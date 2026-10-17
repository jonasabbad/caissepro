import { prisma, Prisma, type Tx } from './prisma.js';
import { num, r2 } from './serialize.js';
import { expensesPnl } from './expenses.js';

/**
 * Accounting rules shared by repairs, the dashboard and the reports (see docs/accounting.md).
 *
 * Repairs
 * - Revenue: the price charged (fixedPrice). It is *realized* only when the repair is completed or delivered AND
 *   fully paid; `realizedAt` records that moment. Unpaid, partly paid and cancelled repairs are never income.
 * - Direct costs: parts (bought for the job or taken from stock, at cost), technician / external labour, other.
 * - A repair's costs (spare parts, technician, other) are always counted in that repair's profit — never as a separate
 *   business expense and never taken from the cash drawer unless a cost line is explicitly paid from it.
 * - Legacy only (costsCapitalized): before 2026-10-17, costs of repairs linked to a stock device were added to the
 *   device cost and show up when the device is sold, so they are excluded from repair profit (no double counting).
 * - Repair Profit = Revenue − Parts − Technician/External − Other direct costs.
 *
 * Whole business, for a period
 * - Revenue = net sales (sales − refunds) + realized repair revenue
 * - Cost of goods = cost of goods sold (net of returns) + repair parts
 * - Gross profit = Revenue − Cost of goods
 * - Repair costs = spare parts + technician/external + other direct repair costs (all realized repairs)
 * - Gross profit = net sales − cost of goods sold + realized repair revenue − repair costs
 *   (= sales gross profit + repair profit)
 * - Direct expenses = business expenses only (Expenses page, by expense date)
 * - Net profit = Gross profit − Direct expenses
 * Business expenses never include stock purchases (counted as COGS when sold) or repair costs (counted on the repair).
 */

export type ExpenseType = 'part' | 'stock_part' | 'labor' | 'other';
type ExpenseLike = { type: string; amount: unknown };
type RepairLike = { fixedPrice: unknown; soldUnitId: string | null; status: string; amountPaid: unknown; realizedAt: Date | null; costsCapitalized?: boolean };

export function repairCosts(expenses: ExpenseLike[]) {
  const sum = (types: string[]) => r2(expenses.filter((e) => types.includes(e.type)).reduce((s, e) => s + num(e.amount), 0));
  const parts = sum(['part', 'stock_part']);
  const labor = sum(['labor']);
  const other = sum(['other']);
  return { parts, labor, other, total: r2(parts + labor + other) };
}

/** Financial view of one repair: what is charged, what it cost, and whether it is realized income yet. */
export function repairFinancials(repair: RepairLike, expenses: ExpenseLike[]) {
  const revenue = num(repair.fixedPrice);
  const costs = repairCosts(expenses);
  const capitalized = !!repair.costsCapitalized;
  const counted = capitalized ? { parts: 0, labor: 0, other: 0, total: 0 } : costs;
  const grossProfit = r2(revenue - counted.parts);
  return {
    revenue,
    partsCost: counted.parts,
    laborCost: counted.labor,
    otherCost: counted.other,
    totalCost: counted.total,
    grossProfit,
    profit: r2(revenue - counted.total),
    costsCapitalized: capitalized,
    capitalizedCost: capitalized ? costs.total : 0,
    amountPaid: num(repair.amountPaid),
    amountDue: r2(Math.max(0, revenue - num(repair.amountPaid))),
    realized: !!repair.realizedAt,
  };
}

/** Recomputes payment status and the realization date after any change of price, payment, status or costs. */
export async function refreshRepairFinancials(tx: Tx, repairId: string) {
  const r = await tx.repair.findUniqueOrThrow({ where: { id: repairId } });
  const price = num(r.fixedPrice);
  const paid = num(r.amountPaid);
  const paymentStatus = paid <= 0 ? 'unpaid' : price > 0 && paid >= price ? 'paid' : 'partial';
  const done = r.status === 'completed' || r.status === 'delivered';
  const realized = done && price > 0 && paymentStatus === 'paid';
  await tx.repair.update({
    where: { id: r.id },
    data: { paymentStatus, realizedAt: realized ? (r.realizedAt ?? new Date()) : null },
  });
}

export interface RepairFilters {
  storeId?: string | null;
  repairerId?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
}

/** Realized repair income for a period (by realization date). */
export async function repairsPnl(tenantId: string, from: Date, to: Date, f: RepairFilters = {}) {
  const repairs = await prisma.repair.findMany({
    where: {
      tenantId,
      realizedAt: { gte: from, lte: to },
      ...(f.storeId && { storeId: f.storeId }),
      ...(f.repairerId && { repairerId: f.repairerId }),
      ...(f.status && { status: f.status }),
    },
    include: { expenses: true },
  });
  const rows = repairs.map((r) => ({ repair: r, ...repairFinancials(r, r.expenses) }));
  const sum = (k: 'revenue' | 'partsCost' | 'laborCost' | 'otherCost' | 'profit' | 'capitalizedCost') => r2(rows.reduce((s, x) => s + x[k], 0));
  return {
    count: rows.length,
    revenue: sum('revenue'),
    partsCost: sum('partsCost'),
    laborCost: sum('laborCost'),
    otherCost: sum('otherCost'),
    grossProfit: r2(sum('revenue') - sum('partsCost')),
    profit: sum('profit'),
    capitalizedCost: sum('capitalizedCost'),
    rows,
  };
}

const revenueWhere = (tenantId: string, from: Date, to: Date, storeId?: string | null): Prisma.TransactionWhereInput => ({
  tenantId,
  createdAt: { gte: from, lte: to },
  status: { not: 'cancelled' },
  OR: [{ type: { in: ['sale', 'credit', 'exchange'] } }, { type: 'reservation', status: 'completed' }],
  ...(storeId && { storeId }),
});

/** Sales side for a period: revenue, refunds and the cost of what was (net) sold. */
export async function salesPnl(tenantId: string, from: Date, to: Date, storeId?: string | null) {
  const [rev, ret] = await Promise.all([
    prisma.transaction.aggregate({ where: revenueWhere(tenantId, from, to, storeId), _sum: { totalAmount: true, totalProfit: true }, _count: true }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'return', status: { not: 'cancelled' }, createdAt: { gte: from, lte: to }, ...(storeId && { storeId }) },
      _sum: { totalAmount: true, totalProfit: true },
    }),
  ]);
  const revenue = r2(num(rev._sum.totalAmount));
  const refunds = r2(num(ret._sum.totalAmount));
  const netRevenue = r2(revenue - refunds);
  const grossProfit = r2(num(rev._sum.totalProfit) + num(ret._sum.totalProfit));
  return { count: rev._count, revenue, refunds, netRevenue, cogs: r2(netRevenue - grossProfit), grossProfit };
}

/** The whole business for a period: sales + realized repairs, with gross and net profit. */
export async function businessPnl(tenantId: string, from: Date, to: Date, storeId?: string | null) {
  const [sales, repairs, expenses] = await Promise.all([salesPnl(tenantId, from, to, storeId), repairsPnl(tenantId, from, to, { storeId }), expensesPnl(tenantId, from, to, storeId)]);
  const revenue = r2(sales.netRevenue + repairs.revenue);
  const cogs = sales.cogs;
  // Every cost of a repair stays with the repair (its profit), whatever its kind.
  const repairCosts = r2(repairs.partsCost + repairs.laborCost + repairs.otherCost);
  const grossProfit = r2(revenue - cogs - repairCosts);
  const directExpenses = expenses.total;
  const netProfit = r2(grossProfit - directExpenses);
  const { rows: _rows, ...repairTotals } = repairs;
  return {
    sales,
    repairs: repairTotals,
    expenses,
    totals: { revenue, cogs, repairCosts, grossProfit, directExpenses, netProfit, margin: revenue ? r2((netProfit / revenue) * 100) : 0 },
  };
}

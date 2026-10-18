import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { expensesWhere } from '../lib/expenses.js';
import { authed, ok, type Req } from '../lib/route.js';
import { endOfDay, qStr, startOfDay } from '../lib/pagination.js';
import { customerStats } from './customers.js';
import { supplierStats } from './suppliers.js';
import { invoicedOrderIds } from '../lib/suppliers.js';
import { isoDay, revenueWhere } from './dashboard.js';
import { businessPnl, repairFinancials } from '../lib/profit.js';
import { parseJson } from '../lib/serialize.js';

type Period = { from: Date; to: Date; fromStr: string; toStr: string };

function period(q: Record<string, string>): Period {
  const now = new Date();
  const fromStr = qStr(q.dateFrom ?? q.startDate) ?? isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const toStr = qStr(q.dateTo ?? q.endDate) ?? isoDay(now);
  return { from: startOfDay(fromStr), to: endOfDay(toStr), fromStr, toStr };
}

const fullName = (c: { firstName: string; lastName: string | null }) => `${c.firstName} ${c.lastName ?? ''}`.trim();

async function salesReport(tenantId: string, p: Period) {
  const txs = await prisma.transaction.findMany({
    where: revenueWhere(tenantId, p.from, p.to),
    include: { items: true, payments: true },
    orderBy: { createdAt: 'desc' },
  });
  const [returns, reservations] = await Promise.all([
    prisma.transaction.aggregate({ where: { tenantId, type: 'return', status: { not: 'cancelled' }, createdAt: { gte: p.from, lte: p.to } }, _sum: { totalProfit: true } }),
    prisma.transaction.findMany({ where: { tenantId, type: 'reservation', status: { not: 'cancelled' }, createdAt: { gte: p.from, lte: p.to } }, select: { amountPaid: true } }),
  ]);
  const unitIds = txs.flatMap((t) => t.items.map((i) => i.soldUnitId)).filter(Boolean) as string[];
  const imeis = new Map((await prisma.soldUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, imei: true } })).map((u) => [u.id, u.imei]));
  const totalSales = r2(txs.reduce((s, t) => s + num(t.totalAmount), 0));
  const totalProfit = r2(txs.reduce((s, t) => s + num(t.totalProfit), 0) + num(returns._sum.totalProfit));

  const byDay = new Map<string, { date: string; sales: number; transactions: number; profit: number }>();
  const bySeller = new Map<string, { employeeId: string | null; name: string; sales: number; transactions: number; profit: number }>();
  const byMethod = new Map<string, { method: string; amount: number; count: number }>();
  const byProduct = new Map<string, { productId: string; name: string; quantity: number; revenue: number }>();
  const employees = new Map(
    (await prisma.employee.findMany({ where: { tenantId }, select: { id: true, firstName: true, lastName: true } })).map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()]),
  );
  for (const t of txs) {
    const day = isoDay(t.createdAt);
    const d = byDay.get(day) ?? { date: day, sales: 0, transactions: 0, profit: 0 };
    d.sales = r2(d.sales + num(t.totalAmount));
    d.profit = r2(d.profit + num(t.totalProfit));
    d.transactions++;
    byDay.set(day, d);
    const key = t.employeeId ?? 'none';
    const s = bySeller.get(key) ?? { employeeId: t.employeeId, name: t.employeeId ? (employees.get(t.employeeId) ?? '—') : 'Non attribué', sales: 0, transactions: 0, profit: 0 };
    s.sales = r2(s.sales + num(t.totalAmount));
    s.profit = r2(s.profit + num(t.totalProfit));
    s.transactions++;
    bySeller.set(key, s);
    for (const pay of t.payments) {
      const m = byMethod.get(pay.method) ?? { method: pay.method, amount: 0, count: 0 };
      m.amount = r2(m.amount + num(pay.amount));
      m.count++;
      byMethod.set(pay.method, m);
    }
    for (const i of t.items) {
      const k = i.productId ?? `unit:${i.productName}`;
      const e = byProduct.get(k) ?? { productId: i.productId ?? k, name: i.productName, quantity: 0, revenue: 0 };
      e.quantity += i.quantity;
      e.revenue = r2(e.revenue + num(i.totalPrice));
      byProduct.set(k, e);
    }
  }
  const recentSales = txs
    .flatMap((t) =>
      t.items.map((i) => ({
        id: i.id,
        type: i.soldUnitId ? 'unit' : 'product',
        name: i.productName,
        quantity: i.quantity,
        ...(i.soldUnitId && { imei: imeis.get(i.soldUnitId) ?? null }),
        salePrice: num(i.totalPrice),
        soldAt: t.createdAt.toISOString(),
      })),
    )
    .slice(0, 20);
  const collected = r2(txs.reduce((s, t) => s + num(t.amountPaid), 0));
  const profit = await businessPnl(tenantId, p.from, p.to);
  return {
    period: { from: p.fromStr, to: p.toStr },
    profit,
    summary: {
      totalSales,
      totalTransactions: txs.length,
      completedTransactions: txs.filter((t) => t.status === 'completed').length,
      partialTransactions: txs.filter((t) => t.status === 'partial').length,
      pendingTransactions: txs.filter((t) => t.status === 'pending').length,
      totalProfit,
      averageTransaction: txs.length ? r2(totalSales / txs.length) : 0,
      totalItems: txs.reduce((s, t) => s + t.items.reduce((a, i) => a + i.quantity, 0), 0),
      totalAmountCollected: collected,
      totalAmountPending: r2(txs.reduce((s, t) => s + Math.max(0, num(t.amountRemaining)), 0)),
      reservationCount: reservations.length,
      totalReservationDeposits: r2(reservations.reduce((s, r) => s + num(r.amountPaid), 0)),
    },
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    bySeller: [...bySeller.values()].sort((a, b) => (a.employeeId ? 0 : 1) - (b.employeeId ? 0 : 1) || b.sales - a.sales),
    byPaymentMethod: [...byMethod.values()].sort((a, b) => b.amount - a.amount),
    topProducts: [...byProduct.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    recentSales,
  };
}

/** Stock is a snapshot (not period-bound): products valued at retail price, devices at sale price. */
async function inventoryReport(tenantId: string, p: Period) {
  const [products, units, categories] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, archivedAt: null }, orderBy: { name: 'asc' } }),
    prisma.soldUnit.findMany({ where: { tenantId } }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const low = products.filter((x) => x.stockQuantity > 0 && x.stockQuantity <= x.minStockLevel);
  const out = products.filter((x) => x.stockQuantity === 0);
  const healthy = products.length - low.length - out.length;
  const productsValue = r2(products.reduce((s, x) => s + x.stockQuantity * num(x.retailPrice), 0));
  const inStock = units.filter((u) => !u.soldAt);
  const sold = units.filter((u) => u.soldAt);
  const unitsValue = r2(inStock.reduce((s, u) => s + num(u.salePrice), 0));

  type Variant = { count: number; inStock: number; sold: number; storage?: string; color?: string; condition: string; deviceType: string };
  const brands = new Map<string, { brand: string; total: number; inStock: number; sold: number; value: number; conditions: Set<string>; deviceTypes: Set<string>; models: Map<string, any> }>();
  for (const u of units) {
    const b = brands.get(u.brand) ?? { brand: u.brand, total: 0, inStock: 0, sold: 0, value: 0, conditions: new Set(), deviceTypes: new Set(), models: new Map() };
    const m = b.models.get(u.model) ?? { model: u.model, total: 0, inStock: 0, sold: 0, value: 0, conditions: new Set<string>(), deviceTypes: new Set<string>(), variants: new Map<string, Variant>() };
    const vKey = `${u.storage ?? ''}|${u.color ?? ''}|${u.condition}|${u.deviceType}`;
    const v: Variant = m.variants.get(vKey) ?? { count: 0, inStock: 0, sold: 0, ...(u.storage && { storage: u.storage }), ...(u.color && { color: u.color }), condition: u.condition, deviceType: u.deviceType };
    b.total++;
    m.total++;
    v.count++;
    for (const x of [b, m, v]) {
      if (u.soldAt) x.sold++;
      else x.inStock++;
    }
    if (!u.soldAt) {
      b.value = r2(b.value + num(u.salePrice));
      m.value = r2(m.value + num(u.salePrice));
    }
    for (const x of [b, m]) {
      x.conditions.add(u.condition);
      x.deviceTypes.add(u.deviceType);
    }
    m.variants.set(vKey, v);
    b.models.set(u.model, m);
    brands.set(u.brand, b);
  }
  const byBrand = [...brands.values()]
    .map((b) => ({
      brand: b.brand,
      total: b.total,
      inStock: b.inStock,
      sold: b.sold,
      value: b.value,
      conditions: [...b.conditions],
      deviceTypes: [...b.deviceTypes],
      models: [...b.models.values()].map((m) => ({ ...m, conditions: [...m.conditions], deviceTypes: [...m.deviceTypes], variants: [...m.variants.values()] })),
    }))
    .sort((a, b) => b.inStock - a.inStock);

  const byCat = new Map<string, { categoryId: string; categoryName: string; products: any[] }>();
  for (const x of products) {
    const id = x.categoryId ?? 'uncategorized';
    const c = byCat.get(id) ?? { categoryId: id, categoryName: x.categoryId ? (catName.get(x.categoryId) ?? 'Sans catégorie') : 'Sans catégorie', products: [] };
    c.products.push({
      id: x.id,
      name: x.name,
      sku: x.sku,
      stockQuantity: x.stockQuantity,
      minStockLevel: x.minStockLevel,
      retailPrice: num(x.retailPrice),
      stockValue: r2(x.stockQuantity * num(x.retailPrice)),
      isLowStock: x.stockQuantity <= x.minStockLevel,
    });
    byCat.set(id, c);
  }
  const byCategory = [...byCat.values()].map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    productCount: c.products.length,
    totalStock: c.products.reduce((s, x) => s + x.stockQuantity, 0),
    totalValue: r2(c.products.reduce((s, x) => s + x.stockValue, 0)),
    lowStockCount: c.products.filter((x) => x.isLowStock).length,
    products: c.products,
  }));

  return {
    period: { from: p.fromStr, to: p.toStr },
    summary: {
      totalUnits: units.length,
      unitsInStock: inStock.length,
      unitsSold: sold.length,
      unitsValue,
      unitsSoldValue: r2(sold.reduce((s, u) => s + num(u.salePrice), 0)),
      totalProducts: products.length,
      productsInStock: products.reduce((s, x) => s + x.stockQuantity, 0),
      productsValue,
      lowStockCount: low.length,
      outOfStockCount: out.length,
      healthyStockCount: healthy,
      totalInventoryValue: r2(productsValue + unitsValue),
      stockHealthScore: products.length ? Math.round((healthy / products.length) * 100) : 100,
    },
    stockDistribution: { healthy, low: low.length, outOfStock: out.length },
    lowStockAlerts: [...out, ...low].map((x) => ({
      id: x.id,
      name: x.name,
      sku: x.sku,
      currentStock: x.stockQuantity,
      minStock: x.minStockLevel,
      category: x.categoryId ? (catName.get(x.categoryId) ?? 'Sans catégorie') : 'Sans catégorie',
    })),
    byBrand,
    byCategory,
  };
}

async function customersReport(tenantId: string, p: Period) {
  const customers = await prisma.customer.findMany({ where: { tenantId } });
  const stats = await customerStats(tenantId, customers.map((c) => c.id));
  const txs = await prisma.transaction.findMany({
    where: { tenantId, customerId: { not: null }, status: { not: 'cancelled' }, createdAt: { gte: p.from, lte: p.to } },
    select: { customerId: true, type: true, status: true, totalAmount: true },
  });
  const per = new Map<string, { purchases: number; exchanges: number; returns: number; spent: number }>();
  let revenue = 0;
  for (const t of txs) {
    const e = per.get(t.customerId!) ?? { purchases: 0, exchanges: 0, returns: 0, spent: 0 };
    if (t.type === 'return') {
      e.returns++;
      e.spent = r2(e.spent - num(t.totalAmount));
    } else if (t.type !== 'reservation' || t.status === 'completed') {
      e.purchases++;
      if (t.type === 'exchange') e.exchanges++;
      e.spent = r2(e.spent + num(t.totalAmount));
      revenue += num(t.totalAmount);
    }
    per.set(t.customerId!, e);
  }
  const byId = new Map(customers.map((c) => [c.id, c]));
  const debtors = customers
    .map((c) => ({ customerId: c.id, name: fullName(c), debt: -((stats.get(c.id) as any)?.balance ?? 0) }))
    .filter((d) => d.debt > 0)
    .sort((a, b) => b.debt - a.debt);
  return {
    period: { from: p.fromStr, to: p.toStr },
    summary: {
      totalCustomers: customers.length,
      newCustomers: customers.filter((c) => c.createdAt >= p.from && c.createdAt <= p.to).length,
      totalDebt: r2(debtors.reduce((s, d) => s + d.debt, 0)),
      totalRevenue: r2(revenue),
    },
    topCustomers: [...per.entries()]
      .map(([id, e]) => ({ customerId: id, name: byId.get(id) ? fullName(byId.get(id)!) : '—', ...e }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10),
    debtors,
  };
}

async function suppliersReport(tenantId: string, p: Period) {
  const [suppliers, orders, invoices, invoiced] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId } }),
    prisma.supplierOrder.findMany({ where: { tenantId, orderedAt: { gte: p.from, lte: p.to } }, orderBy: { orderedAt: 'desc' } }),
    prisma.supplierInvoice.findMany({ where: { tenantId, status: 'confirmed', invoiceDate: { gte: p.from, lte: p.to } }, orderBy: { invoiceDate: 'desc' } }),
    invoicedOrderIds(tenantId),
  ]);
  const stats = await supplierStats(tenantId, suppliers.map((s) => s.id));
  // One purchase per row: an invoiced order is counted through its invoice.
  const counted = [
    ...orders.filter((o) => o.status !== 'draft' && o.status !== 'cancelled' && !invoiced.has(o.id)).map((o) => ({ supplierId: o.supplierId, totalAmount: o.totalAmount, orderedAt: o.orderedAt })),
    ...invoices.map((i) => ({ supplierId: i.supplierId, totalAmount: i.total, orderedAt: i.invoiceDate })),
  ].sort((a, b) => b.orderedAt.getTime() - a.orderedAt.getTime());
  const byStatus = new Map<string, number>();
  for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const name = new Map(suppliers.map((s) => [s.id, s.name]));
  const debtOf = (id: string) => -(stats.get(id)?.balance ?? 0);
  return {
    period: { from: p.fromStr, to: p.toStr },
    summary: {
      totalSuppliers: suppliers.length,
      activeSuppliers: new Set(counted.map((o) => o.supplierId)).size,
      totalOrders: orders.length,
      draftOrders: orders.filter((o) => o.status === 'draft').length,
      totalSpent: r2(counted.reduce((s, o) => s + num(o.totalAmount), 0)),
      totalDebt: r2(suppliers.reduce((s, x) => s + debtOf(x.id), 0)),
    },
    topSuppliers: suppliers
      .map((s) => {
        const mine = counted.filter((o) => o.supplierId === s.id);
        return {
          supplierId: s.id,
          name: s.name,
          orders: mine.length,
          spent: r2(mine.reduce((a, o) => a + num(o.totalAmount), 0)),
          debt: debtOf(s.id),
          lastOrderDate: mine[0]?.orderedAt.toISOString() ?? null,
        };
      })
      .filter((s) => s.orders > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10),
    pendingOrders: orders
      .filter((o) => ['draft', 'pending', 'partial'].includes(o.status))
      .map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        supplier: name.get(o.supplierId) ?? '—',
        status: o.status,
        amount: num(o.totalAmount),
        amountPaid: num(o.amountPaid),
        amountRemaining: num(o.amountRemaining),
        orderedAt: o.orderedAt.toISOString(),
      })),
    suppliersWithDebt: suppliers
      .filter((s) => debtOf(s.id) > 0)
      .map((s) => ({ supplierId: s.id, name: s.name, phone: s.phone, debt: debtOf(s.id), overdue: stats.get(s.id)?.overdue ?? 0 })),
    ordersByStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
  };
}

/**
 * Repairs over a period. `realized` = income recognized in the period (completed/delivered AND fully paid, dated when
 * that happened); `repairs` = every repair received in the period, with its own financials, for follow-up.
 * Filters: repairerId (technician), status, paymentStatus.
 */
async function repairsReport(tenantId: string, p: Period, q: Record<string, string> = {}) {
  const filters = { repairerId: qStr(q.repairerId), status: qStr(q.status), paymentStatus: qStr(q.paymentStatus) };
  const [received, realizedRows, repairers] = await Promise.all([
    prisma.repair.findMany({
      where: {
        tenantId,
        receivedAt: { gte: p.from, lte: p.to },
        ...(filters.repairerId && { repairerId: filters.repairerId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
      },
      include: { expenses: true },
      orderBy: { receivedAt: 'desc' },
    }),
    prisma.repair.findMany({
      where: {
        tenantId,
        realizedAt: { gte: p.from, lte: p.to },
        ...(filters.repairerId && { repairerId: filters.repairerId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.paymentStatus && { paymentStatus: filters.paymentStatus }),
      },
      include: { expenses: true },
    }),
    prisma.repairer.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const customerIds = [...new Set(received.map((r) => r.customerId).filter(Boolean))] as string[];
  const customers = new Map((await prisma.customer.findMany({ where: { id: { in: customerIds } } })).map((c) => [c.id, fullName(c)]));
  const tech = new Map(repairers.map((r) => [r.id, r.name]));
  const realized = realizedRows.map((r) => ({ r, f: repairFinancials(r, r.expenses) }));
  const sum = (k: 'revenue' | 'partsCost' | 'laborCost' | 'otherCost' | 'profit') => r2(realized.reduce((s, x) => s + x.f[k], 0));
  const byTech = new Map<string, { repairerId: string | null; name: string; count: number; revenue: number; laborCost: number; profit: number }>();
  for (const { r, f } of realized) {
    const key = r.repairerId ?? 'none';
    const e = byTech.get(key) ?? { repairerId: r.repairerId, name: r.repairerId ? (tech.get(r.repairerId) ?? '—') : 'Atelier', count: 0, revenue: 0, laborCost: 0, profit: 0 };
    e.count++;
    e.revenue = r2(e.revenue + f.revenue);
    e.laborCost = r2(e.laborCost + f.laborCost);
    e.profit = r2(e.profit + f.profit);
    byTech.set(key, e);
  }
  const pending = received.filter((r) => r.status !== 'cancelled' && !r.realizedAt);
  return {
    period: { from: p.fromStr, to: p.toStr },
    filters,
    summary: {
      realizedCount: realized.length,
      revenue: sum('revenue'),
      partsCost: sum('partsCost'),
      laborCost: sum('laborCost'),
      otherCost: sum('otherCost'),
      grossProfit: r2(sum('revenue') - sum('partsCost')),
      profit: sum('profit'),
      margin: sum('revenue') ? r2((sum('profit') / sum('revenue')) * 100) : 0,
      receivedCount: received.length,
      pendingCount: pending.length,
      // Charged but not yet income: unpaid/partly paid or not finished.
      pendingRevenue: r2(pending.reduce((s, r) => s + num(r.fixedPrice), 0)),
      collectedNotRealized: r2(pending.reduce((s, r) => s + num(r.amountPaid), 0)),
      cancelledCount: received.filter((r) => r.status === 'cancelled').length,
    },
    byTechnician: [...byTech.values()].sort((a, b) => b.profit - a.profit),
    repairs: received.map((r) => {
      const f = repairFinancials(r, r.expenses);
      return {
        id: r.id,
        repairNumber: r.repairNumber,
        customer: r.customerId ? (customers.get(r.customerId) ?? null) : null,
        deviceDescription: r.deviceDescription,
        technician: r.repairerId ? (tech.get(r.repairerId) ?? null) : null,
        status: r.status,
        paymentStatus: r.paymentStatus,
        receivedAt: r.receivedAt.toISOString(),
        realizedAt: r.realizedAt?.toISOString() ?? null,
        payments: parseJson<unknown[]>(r.payments, []).length,
        ...f,
      };
    }),
  };
}

/** Direct expenses of the period (by expense date): totals, by category, payment method and day, and the list. */
async function expensesReport(tenantId: string, p: Period, q: Record<string, string> = {}) {
  const where = { ...expensesWhere(tenantId, p.from, p.to), ...(qStr(q.category) ? { category: q.category } : {}), ...(qStr(q.paymentMethod) ? { paymentMethod: q.paymentMethod } : {}) };
  const rows = await prisma.expense.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
  const sum = (list: typeof rows) => r2(list.reduce((s, e) => s + num(e.amount), 0));
  const group = (key: (e: (typeof rows)[number]) => string) => {
    const m = new Map<string, typeof rows>();
    for (const e of rows) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
    return [...m.entries()].map(([k, list]) => ({ key: k, count: list.length, amount: sum(list) })).sort((a, b) => b.amount - a.amount);
  };
  const total = sum(rows);
  const days = Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000));
  return {
    summary: { total, count: rows.length, averagePerDay: r2(total / days), cash: sum(rows.filter((e) => e.paymentMethod === 'cash')) },
    byCategory: group((e) => e.category),
    byPaymentMethod: group((e) => e.paymentMethod),
    byDay: group((e) => isoDay(e.date)).sort((a, b) => a.key.localeCompare(b.key)),
    expenses: serialize(rows),
    profit: await businessPnl(tenantId, p.from, p.to),
  };
}

const BUILDERS = { sales: salesReport, inventory: inventoryReport, customers: customersReport, suppliers: suppliersReport, repairs: repairsReport, expenses: expensesReport } as const;
type ReportType = keyof typeof BUILDERS;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function reportRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/reports', async (req: Req<unknown, Record<string, string>>) => {
    const type = (qStr(req.query.type) ?? 'sales') as ReportType;
    if (!BUILDERS[type]) throw badRequest('Type de rapport invalide');
    return ok({ report: await BUILDERS[type](req.auth.tenantId, period(req.query), req.query) });
  });

  /** Spreadsheet export (CSV, ";"-separated with a BOM so Excel opens it with accents). The PDF is built in the browser. */
  app.get('/reports/export', async (req: Req<unknown, Record<string, string>>, reply) => {
    const type = (qStr(req.query.type) ?? 'sales') as ReportType;
    if (!BUILDERS[type]) throw badRequest('Type de rapport invalide');
    if (qStr(req.query.format) === 'pdf') throw badRequest("L'export PDF est généré dans le navigateur");
    const p = period(req.query);
    const r: any = await BUILDERS[type](req.auth.tenantId, p, req.query);
    const rows: unknown[][] = [];
    for (const [k, v] of Object.entries(r.summary)) rows.push([k, v]);
    rows.push([]);
    if (type === 'sales') {
      rows.push(['Date', 'Ventes', 'Transactions', 'Profit'], ...r.byDay.map((d: any) => [d.date, d.sales, d.transactions, d.profit]));
      rows.push([], ['Produit', 'Quantité', 'CA'], ...r.topProducts.map((x: any) => [x.name, x.quantity, x.revenue]));
    } else if (type === 'inventory') {
      rows.push(['Catégorie', 'Produit', 'SKU', 'Stock', 'Minimum', 'Prix', 'Valeur']);
      for (const c of r.byCategory) for (const x of c.products) rows.push([c.categoryName, x.name, x.sku, x.stockQuantity, x.minStockLevel, x.retailPrice, x.stockValue]);
    } else if (type === 'customers') {
      rows.push(['Client', 'Achats', 'Reprises', 'Retours', 'Total dépensé'], ...r.topCustomers.map((c: any) => [c.name, c.purchases, c.exchanges, c.returns, c.spent]));
      rows.push([], ['Client', 'Dette'], ...r.debtors.map((d: any) => [d.name, d.debt]));
    } else if (type === 'repairs') {
      rows.push(['Réparation', 'Client', 'Technicien', 'Statut', 'Paiement', 'Prix', 'Pièces', 'Main d’œuvre', 'Autres', 'Profit', 'Réalisée le']);
      for (const x of r.repairs) rows.push([x.repairNumber, x.customer, x.technician, x.status, x.paymentStatus, x.revenue, x.partsCost, x.laborCost, x.otherCost, x.profit, x.realizedAt?.slice(0, 10) ?? '']);
    } else if (type === 'expenses') {
      rows.push(['Date', 'Description', 'Catégorie', 'Paiement', 'Bénéficiaire', 'Montant']);
      for (const x of r.expenses) rows.push([String(x.date).slice(0, 10), x.title, x.category, x.paymentMethod, x.recipient ?? '', x.amount]);
    } else {
      rows.push(['Fournisseur', 'Commandes', 'Dépensé', 'Dette'], ...r.topSuppliers.map((s: any) => [s.name, s.orders, s.spent, s.debt]));
    }
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="rapport-${type}-${p.fromStr}-${p.toStr}.csv"`);
    return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\n');
  });
}

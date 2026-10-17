import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '../lib/prisma.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { endOfDay, qStr, startOfDay } from '../lib/pagination.js';
import { customerStats } from './customers.js';
import { supplierStats } from './suppliers.js';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Revenue-bearing transactions: sales, credit sales and trade-ins, plus reservations once fully paid.
 * Returns are kept apart: their (negative) profit is what was given back.
 */
export const revenueWhere = (tenantId: string, from: Date, to: Date, storeId?: string | null): Prisma.TransactionWhereInput => ({
  tenantId,
  createdAt: { gte: from, lte: to },
  status: { not: 'cancelled' },
  OR: [{ type: { in: ['sale', 'credit', 'exchange'] } }, { type: 'reservation', status: 'completed' }],
  ...(storeId && { storeId }),
});
const returnsWhere = (tenantId: string, from: Date, to: Date, storeId?: string | null): Prisma.TransactionWhereInput => ({
  tenantId,
  type: 'return',
  status: { not: 'cancelled' },
  createdAt: { gte: from, lte: to },
  ...(storeId && { storeId }),
});

/** Today unless a start/end date is given; the "previous" period has the same length and ends just before. */
function period(q: Record<string, string>) {
  const today = isoDay(new Date());
  const from = startOfDay(qStr(q.startDate) ?? today);
  const to = endOfDay(qStr(q.endDate) ?? qStr(q.startDate) ?? today);
  const len = to.getTime() - from.getTime() + 1;
  return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: new Date(from.getTime() - 1) };
}

/** Trend/top windows: the selected range when it spans several days, otherwise the last `days` days. */
function window(q: Record<string, string>, defaultDays = 30) {
  const p = period(q);
  const spanDays = Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000);
  if (qStr(q.startDate) && spanDays >= 1) return { from: p.from, to: p.to };
  const days = Math.max(1, Math.min(366, Number(q.days) || defaultDays));
  const to = endOfDay(qStr(q.endDate) ?? isoDay(new Date()));
  const from = startOfDay(new Date(to.getTime() - (days - 1) * 86_400_000));
  return { from, to };
}

const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : r2(((cur - prev) / Math.abs(prev)) * 100));

async function salesAndProfit(tenantId: string, from: Date, to: Date, storeId?: string | null) {
  const [rev, ret] = await Promise.all([
    prisma.transaction.aggregate({ where: revenueWhere(tenantId, from, to, storeId), _sum: { totalAmount: true, totalProfit: true }, _count: true }),
    prisma.transaction.aggregate({ where: returnsWhere(tenantId, from, to, storeId), _sum: { totalProfit: true } }),
  ]);
  const sales = num(rev._sum.totalAmount);
  return { sales: r2(sales), count: rev._count, profit: r2(num(rev._sum.totalProfit) + num(ret._sum.totalProfit)) };
}

export default async function dashboardRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/dashboard/kpis', async (req: Req<unknown, Record<string, string>>) => {
    const t = req.auth.tenantId;
    const storeId = qStr(req.query.storeId);
    const p = period(req.query);
    const [cur, prev, customers, suppliers, debtPayments, newCustomers, collected] = await Promise.all([
      salesAndProfit(t, p.from, p.to, storeId),
      salesAndProfit(t, p.prevFrom, p.prevTo, storeId),
      prisma.customer.findMany({ where: { tenantId: t }, select: { id: true } }),
      prisma.supplier.findMany({ where: { tenantId: t }, select: { id: true } }),
      prisma.customerPayment.aggregate({ where: { tenantId: t, createdAt: { gte: p.from, lte: p.to } }, _sum: { amount: true }, _count: true }),
      prisma.customer.count({ where: { tenantId: t, createdAt: { gte: p.from, lte: p.to } } }),
      prisma.payment.aggregate({ where: { transaction: { tenantId: t, ...(storeId && { storeId }) }, receivedAt: { gte: p.from, lte: p.to } }, _sum: { amount: true } }),
    ]);
    const cStats = [...(await customerStats(t, customers.map((c) => c.id))).values()].filter((s: any) => s.balance < 0);
    const sStats = [...(await supplierStats(t, suppliers.map((s) => s.id))).values()].filter((s) => s.balance < 0);
    return ok({
      kpis: {
        dailySales: { total: cur.sales, count: cur.count, comparison: pct(cur.sales, prev.sales) },
        realProfit: { total: cur.profit, margin: cur.sales ? r2((cur.profit / cur.sales) * 100) : 0, comparison: pct(cur.profit, prev.profit) },
        customerDebt: { total: r2(cStats.reduce((s: number, c: any) => s - c.balance, 0)), count: cStats.length, overdue: 0 },
        supplierDebt: { total: r2(sStats.reduce((s, x) => s - x.balance, 0)), count: sStats.length },
        debtPayments: { total: r2(num(debtPayments._sum.amount)), count: debtPayments._count },
        newCustomersToday: newCustomers,
        totalAmountCollected: r2(num(collected._sum?.amount) + num(debtPayments._sum.amount)),
      },
    });
  });

  app.get('/dashboard/sales-trend', async (req: Req<unknown, Record<string, string>>) => {
    const w = window(req.query);
    const storeId = qStr(req.query.storeId);
    const [rows, returns] = await Promise.all([
      prisma.transaction.findMany({ where: revenueWhere(req.auth.tenantId, w.from, w.to, storeId), select: { createdAt: true, totalAmount: true, totalProfit: true } }),
      prisma.transaction.findMany({ where: returnsWhere(req.auth.tenantId, w.from, w.to, storeId), select: { createdAt: true, totalProfit: true } }),
    ]);
    const days = new Map<string, { date: string; sales: number; profit: number; count: number }>();
    for (let d = new Date(w.from); d <= w.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.set(isoDay(d), { date: isoDay(d), sales: 0, profit: 0, count: 0 });
    for (const r of rows) {
      const e = days.get(isoDay(r.createdAt));
      if (!e) continue;
      e.sales = r2(e.sales + num(r.totalAmount));
      e.profit = r2(e.profit + num(r.totalProfit));
      e.count++;
    }
    for (const r of returns) {
      const e = days.get(isoDay(r.createdAt));
      if (e) e.profit = r2(e.profit + num(r.totalProfit));
    }
    return ok({ trend: [...days.values()] });
  });

  app.get('/dashboard/top-products', async (req: Req<unknown, Record<string, string>>) => {
    const w = window(req.query);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const items = await prisma.transactionItem.findMany({
      where: { transaction: revenueWhere(req.auth.tenantId, w.from, w.to, qStr(req.query.storeId)) },
      select: { productId: true, soldUnitId: true, productName: true, sku: true, quantity: true, returnedQuantity: true, totalPrice: true, profit: true },
    });
    const by = new Map<string, { productId: string; productName: string; sku: string | null; quantity: number; revenue: number; profit: number }>();
    for (const i of items) {
      const key = i.productId ?? `unit:${i.productName}`;
      const e = by.get(key) ?? { productId: i.productId ?? key, productName: i.productName, sku: i.sku, quantity: 0, revenue: 0, profit: 0 };
      e.quantity += i.quantity - i.returnedQuantity;
      e.revenue = r2(e.revenue + num(i.totalPrice));
      e.profit = r2(e.profit + num(i.profit));
      by.set(key, e);
    }
    const products = [...by.values()].filter((p) => p.quantity > 0).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, limit);
    return ok({ products });
  });

  app.get('/dashboard/low-stock', async (req: Req<unknown, Record<string, string>>) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const products = await prisma.product.findMany({
      where: { tenantId: req.auth.tenantId, archivedAt: null, status: { in: ['low_stock', 'out_of_stock'] } },
      orderBy: { stockQuantity: 'asc' },
      take: limit,
    });
    return ok({ products: serialize(products) });
  });

  app.get('/dashboard/payment-breakdown', async (req: Req<unknown, Record<string, string>>) => {
    const p = period(req.query);
    const rows = await prisma.payment.groupBy({
      by: ['method'],
      where: { transaction: { tenantId: req.auth.tenantId, status: { not: 'cancelled' }, type: { not: 'return' } }, receivedAt: { gte: p.from, lte: p.to } },
      _sum: { amount: true },
      _count: true,
    });
    return ok({ breakdown: rows.map((r) => ({ method: r.method, total: r2(num(r._sum?.amount)), count: r._count })) });
  });

  app.get('/dashboard/store-breakdown', async (req: Req<unknown, Record<string, string>>) => {
    const p = period(req.query);
    const stores = await prisma.store.findMany({ where: { tenantId: req.auth.tenantId, isActive: true }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] });
    if (stores.length < 2) return ok({ breakdown: [] });
    const breakdown = [];
    for (const s of stores) {
      const r = await salesAndProfit(req.auth.tenantId, p.from, p.to, s.id);
      breakdown.push({
        storeId: s.id,
        storeName: s.name,
        storeCode: s.code,
        sales: r.sales,
        transactionCount: r.count,
        profit: r.profit,
        caisseBalance: num(s.caisseBalance),
        margin: r.sales ? r2((r.profit / r.sales) * 100) : 0,
      });
    }
    return ok({ breakdown });
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { dateRange, qStr } from '../lib/pagination.js';
import { supplierBalances, supplierStatement } from '../lib/suppliers.js';

const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
  contactName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * balance < 0 = amount the shop still owes the supplier (confirmed invoices + submitted orders not invoiced, see
 * lib/suppliers.ts), with purchases, payments and overdue amounts.
 */
export async function supplierStats(tenantId: string, ids: string[]) {
  const balances = await supplierBalances(tenantId, ids);
  const out = new Map<string, { orderCount: number; invoiceCount: number; totalPurchases: number; totalPaid: number; balance: number; overdue: number; overdueCount: number }>();
  for (const id of ids) {
    const b = balances.get(id)!;
    out.set(id, { orderCount: b.orderCount, invoiceCount: b.invoiceCount, totalPurchases: b.totalPurchases, totalPaid: b.totalPaid, balance: r2(-b.outstanding), overdue: b.overdue, overdueCount: b.overdueCount });
  }
  return out;
}

export default async function supplierRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/suppliers', async (req: Req<unknown, Record<string, string>>) => {
    const query = qStr(req.query.query);
    const where: Prisma.SupplierWhereInput = {
      tenantId: req.auth.tenantId,
      isActive: true,
      ...(query ? { OR: [{ name: { contains: query } }, { contactName: { contains: query } }, { phone: { contains: query } }, { city: { contains: query } }] } : {}),
    };
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
    const stats = await supplierStats(req.auth.tenantId, suppliers.map((s) => s.id));
    return ok({
      suppliers: serialize(
        suppliers.map((s) => {
          const st = stats.get(s.id)!;
          return { ...s, ...st, totalOrders: st.orderCount, totalPurchased: st.totalPurchases, currentBalance: -st.balance };
        }),
      ),
    });
  });

  app.get('/suppliers/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const s = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!s) throw notFound('Supplier', req.params.id);
    const st = (await supplierStats(req.auth.tenantId, [s.id])).get(s.id)!;
    return ok({ supplier: serialize({ ...s, ...st, totalOrders: st.orderCount, totalPurchased: st.totalPurchases, currentBalance: -st.balance }) });
  });

  app.get('/suppliers/:id/orders', async (req: Req<unknown, unknown, { id: string }>) => {
    const orders = await prisma.supplierOrder.findMany({
      where: { tenantId: req.auth.tenantId, supplierId: req.params.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return ok({ orders: serialize(orders) });
  });

  /** Account statement: purchases, payments, running balance, overdue invoices (dateFrom/dateTo optional). */
  app.get('/suppliers/:id/statement', async (req: Req<unknown, Record<string, string>, { id: string }>) => {
    const s = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!s) throw notFound('Supplier', req.params.id);
    const range = dateRange(req.query.dateFrom, req.query.dateTo);
    const statement = await supplierStatement(req.auth.tenantId, s.id, range?.gte, range?.lte);
    return ok({ supplier: serialize(s), ...statement });
  });

  app.post('/suppliers', async (req: Req<z.infer<typeof supplierSchema>>, reply) => {
    const body = supplierSchema.parse(req.body);
    const s = await prisma.supplier.create({ data: { tenantId: req.auth.tenantId, ...body } });
    reply.status(201);
    return ok({ supplier: serialize({ ...s, orderCount: 0, totalPurchases: 0, balance: 0 }) });
  });

  app.put('/suppliers/:id', async (req: Req<z.infer<typeof supplierSchema>, unknown, { id: string }>) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Supplier', req.params.id);
    const body = supplierSchema.partial().parse(req.body);
    const s = await prisma.supplier.update({ where: { id: existing.id }, data: body });
    return ok({ supplier: serialize(s) });
  });

  app.delete('/suppliers/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Supplier', req.params.id);
    const used = (await prisma.supplierOrder.count({ where: { supplierId: existing.id } })) + (await prisma.supplierInvoice.count({ where: { supplierId: existing.id } }));
    if (used > 0) await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } });
    else await prisma.supplier.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });
}

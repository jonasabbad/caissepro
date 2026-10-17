import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { endOfDay, pageMeta, pageParams, qBool, qStr, startOfDay } from '../lib/pagination.js';
import { resolveStoreId, getTenant } from '../lib/tenant.js';
import { DEFAULT_IR_FLAT_RATE, invoiceTotals, syncTransactionInvoices, takeInvoiceNumber, type InvoiceItem } from '../lib/invoices.js';

const standaloneSchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z
    .array(z.object({ description: z.string().trim().min(1), quantity: z.coerce.number().min(1), unitPrice: z.coerce.number().positive() }))
    .min(1, 'Ajoutez au moins un article'),
  discountAmount: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});
const periodSchema = z.object({ dateFrom: z.string().min(1), dateTo: z.string().min(1) });

type InvoiceRow = Prisma.InvoiceGetPayload<object>;

async function present(rows: InvoiceRow[]) {
  const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
  const txIds = [...new Set(rows.map((r) => r.transactionId).filter(Boolean))] as string[];
  const storeIds = [...new Set(rows.map((r) => r.storeId).filter(Boolean))] as string[];
  const [customers, txs, stores] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: customerIds } } }),
    prisma.transaction.findMany({ where: { id: { in: txIds } }, select: { id: true, transactionNumber: true } }),
    prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }),
  ]);
  const c = new Map(customers.map((x) => [x.id, x]));
  const t = new Map(txs.map((x) => [x.id, x.transactionNumber]));
  const s = new Map(stores.map((x) => [x.id, x.name]));
  return rows.map((r) => {
    const cust = r.customerId ? c.get(r.customerId) : undefined;
    return serialize({
      ...r,
      items: parseJson<InvoiceItem[]>(r.items, []),
      customer: cust ? { ...cust, fullName: `${cust.firstName} ${cust.lastName ?? ''}`.trim() } : null,
      transactionNumber: r.transactionId ? (t.get(r.transactionId) ?? null) : null,
      storeName: r.storeId ? (s.get(r.storeId) ?? null) : null,
    });
  });
}

function standaloneTotals(items: z.infer<typeof standaloneSchema>['items'], discount: number) {
  const lines: InvoiceItem[] = items.map((i) => ({
    id: randomUUID(),
    description: i.description,
    quantity: i.quantity,
    unitPrice: r2(i.unitPrice),
    subtotal: r2(i.quantity * i.unitPrice),
  }));
  const subtotal = r2(lines.reduce((s, l) => s + l.subtotal, 0));
  return { lines, subtotal, discount: r2(Math.min(discount, subtotal)), total: r2(Math.max(0, subtotal - discount)) };
}

/**
 * Invoices: one per sale for shops that invoice (generated server-side, see syncTransactionInvoices),
 * plus free-form ("standalone") invoices. Archived invoices are left out of every tax summary.
 */
export default async function invoiceRoutes(app: FastifyInstance) {
  authed(app);

  const load = async (tenantId: string, id: string, type?: 'standalone') => {
    const inv = await prisma.invoice.findFirst({ where: { id, tenantId, ...(type && { type }) } });
    if (!inv) throw notFound('Invoice', id);
    return inv;
  };

  app.get('/invoices', async (req: Req<unknown, Record<string, string>>) => {
    await syncTransactionInvoices(req.auth.tenantId);
    const q = req.query;
    const p = pageParams(q, 20, 10_000);
    const query = qStr(q.query);
    const type = qStr(q.type);
    const archived = qBool(q.isArchived) ?? qBool(q.archived) ?? false;
    const from = qStr(q.dateFrom ?? q.startDate);
    const to = qStr(q.dateTo ?? q.endDate);
    let customerIds: string[] = [];
    if (query) {
      customerIds = (
        await prisma.customer.findMany({
          where: { tenantId: req.auth.tenantId, OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }, { phone: { contains: query } }] },
          select: { id: true },
        })
      ).map((c) => c.id);
    }
    const where: Prisma.InvoiceWhereInput = {
      tenantId: req.auth.tenantId,
      isArchived: archived,
      ...((type === 'transaction' || type === 'standalone') && { type }),
      ...((from || to) && { date: { ...(from && { gte: startOfDay(from) }), ...(to && { lte: endOfDay(to) }) } }),
      ...(query && { OR: [{ invoiceNumber: { contains: query } }, { customerName: { contains: query } }, { customerId: { in: customerIds } }] }),
    };
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({ where, orderBy: [{ date: 'desc' }, { invoiceNumber: 'desc' }], skip: p.skip, take: p.limit }),
      prisma.invoice.count({ where }),
    ]);
    // `total` is what the list screen reads; `meta` keeps the shape of the other list endpoints.
    return ok({ invoices: await present(rows), total, meta: pageMeta(total, p) });
  });

  app.get('/invoices/quarterly-totals', async (req: Req<unknown, Record<string, string>>) => {
    await syncTransactionInvoices(req.auth.tenantId);
    const year = Number(req.query.year) || new Date().getFullYear();
    const quarters = [];
    for (let q = 1; q <= 4; q++) {
      const t = await invoiceTotals(req.auth.tenantId, new Date(year, (q - 1) * 3, 1), new Date(year, q * 3, 0, 23, 59, 59, 999));
      quarters.push({ quarter: q, label: `T${q}`, totalHT: t.ht, totalTax: t.tax, totalTTC: t.ttc, invoiceCount: t.count });
    }
    return ok({ year, quarters, totalTTC: r2(quarters.reduce((s, q) => s + q.totalTTC, 0)), invoiceCount: quarters.reduce((s, q) => s + q.invoiceCount, 0) });
  });

  app.post('/invoices/tva/calculate-period', async (req: Req<z.infer<typeof periodSchema>>) => {
    const { dateFrom, dateTo } = periodSchema.parse(req.body);
    if (dateFrom > dateTo) throw badRequest('La date de début doit être antérieure à la date de fin');
    await syncTransactionInvoices(req.auth.tenantId);
    const t = await invoiceTotals(req.auth.tenantId, startOfDay(dateFrom), endOfDay(dateTo));
    return ok({ totalSales: t.ht, totalTax: t.tax, totalTTC: t.ttc, invoiceCount: t.count, breakdown: t.breakdown, period: { from: dateFrom, to: dateTo } });
  });

  app.post('/invoices/ir/calculate-period', async (req: Req<z.infer<typeof periodSchema>>) => {
    const { dateFrom, dateTo } = periodSchema.parse(req.body);
    if (dateFrom > dateTo) throw badRequest('La date de début doit être antérieure à la date de fin');
    await syncTransactionInvoices(req.auth.tenantId);
    const tenant = await getTenant(req.auth.tenantId);
    const rate = Number(parseJson<{ irFlatRate?: number }>(tenant.businessInfo, {}).irFlatRate) || DEFAULT_IR_FLAT_RATE;
    const t = await invoiceTotals(req.auth.tenantId, startOfDay(dateFrom), endOfDay(dateTo));
    return ok({ totalRevenue: t.ttc, flatTaxRate: rate, irAmount: r2((t.ttc * rate) / 100), invoiceCount: t.count, period: { from: dateFrom, to: dateTo } });
  });

  app.get('/invoices/:id', async (req: Req<unknown, unknown, { id: string }>) => ok({ invoice: (await present([await load(req.auth.tenantId, req.params.id)]))[0] }));

  app.post('/invoices/standalone', async (req: Req<z.infer<typeof standaloneSchema>>, reply) => {
    const body = standaloneSchema.parse(req.body);
    const customer = body.customerId ? await prisma.customer.findFirst({ where: { id: body.customerId, tenantId: req.auth.tenantId } }) : null;
    if (body.customerId && !customer) throw notFound('Customer', body.customerId);
    const { lines, subtotal, discount, total } = standaloneTotals(body.items, body.discountAmount ?? 0);
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const inv = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
        data: {
          tenantId: req.auth.tenantId,
          storeId,
          invoiceNumber: await takeInvoiceNumber(tx, req.auth.tenantId),
          type: 'standalone',
          customerId: customer?.id ?? null,
          customerName: customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : null,
          customerTaxId: customer?.ice || customer?.cin || null,
          customerAddress: customer?.address ?? null,
          items: JSON.stringify(lines),
          subtotal,
          discountAmount: discount,
          totalAmount: total,
          notes: body.notes ?? null,
          createdBy: req.auth.userId,
        },
      }),
    );
    reply.status(201);
    return ok({ invoice: (await present([inv]))[0] });
  });

  app.patch('/invoices/standalone/:id', async (req: Req<z.infer<typeof standaloneSchema>, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id, 'standalone');
    const body = standaloneSchema.parse(req.body);
    const customer = body.customerId ? await prisma.customer.findFirst({ where: { id: body.customerId, tenantId: req.auth.tenantId } }) : null;
    if (body.customerId && !customer) throw notFound('Customer', body.customerId);
    const { lines, subtotal, discount, total } = standaloneTotals(body.items, body.discountAmount ?? 0);
    const inv = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        customerId: customer?.id ?? null,
        customerName: customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : null,
        customerTaxId: customer?.ice || customer?.cin || null,
        customerAddress: customer?.address ?? null,
        items: JSON.stringify(lines),
        subtotal,
        discountAmount: discount,
        totalAmount: total,
        notes: body.notes ?? null,
      },
    });
    return ok({ invoice: (await present([inv]))[0] });
  });

  app.delete('/invoices/standalone/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id, 'standalone');
    await prisma.invoice.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });

  /** Deleting a sale's invoice resets it: it is rebuilt from the sale on the next read. */
  app.delete('/invoices/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    await prisma.invoice.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });

  app.patch('/invoices/:id/archive', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const inv = await prisma.invoice.update({ where: { id: existing.id }, data: { isArchived: true, archivedAt: new Date() } });
    return ok({ invoice: (await present([inv]))[0] });
  });

  app.patch('/invoices/:id/unarchive', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const inv = await prisma.invoice.update({ where: { id: existing.id }, data: { isArchived: false, archivedAt: null } });
    return ok({ invoice: (await present([inv]))[0] });
  });
}


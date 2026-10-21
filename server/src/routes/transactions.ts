import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { dateRange, pageMeta, pageParams, qStr } from '../lib/pagination.js';
import { addTransactionPayment, paymentSchema } from '../lib/sales.js';
import { moveStock } from '../lib/stock.js';
import { moveCaisse } from '../lib/caisse.js';

const PERSON = { id: true, firstName: true, lastName: true, phone: true, email: true } as const;
const USER = { id: true, firstName: true, lastName: true, email: true } as const;

/** Transaction with customer, cashier, seller, items (+ phone details) and payments. */
export async function loadTransaction(tenantId: string, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, tenantId }, include: { items: true, payments: { orderBy: { receivedAt: 'asc' } } } });
  if (!t) throw notFound('Transaction', id);
  const [customer, cashier, employee, store, units] = await Promise.all([
    t.customerId ? prisma.customer.findUnique({ where: { id: t.customerId }, select: PERSON }) : null,
    t.cashierId ? prisma.user.findUnique({ where: { id: t.cashierId }, select: USER }) : null,
    t.employeeId ? prisma.employee.findUnique({ where: { id: t.employeeId }, select: { id: true, firstName: true, lastName: true } }) : null,
    t.storeId ? prisma.store.findUnique({ where: { id: t.storeId } }) : null,
    prisma.soldUnit.findMany({ where: { id: { in: t.items.map((i) => i.soldUnitId).filter(Boolean) as string[] } } }),
  ]);
  const unitById = new Map(units.map((u) => [u.id, u]));
  return serialize({
    ...t,
    customer,
    cashier,
    employee,
    store,
    items: t.items.map((i) => ({ ...i, soldUnit: i.soldUnitId ? (unitById.get(i.soldUnitId) ?? null) : null, product: null })),
  });
}

export default async function transactionRoutes(app: FastifyInstance) {
  authed(app);

  function listWhere(q: Record<string, string>, tenantId: string): Prisma.TransactionWhereInput {
    const query = qStr(q.query);
    const created = dateRange(q.startDate ?? q.dateFrom, q.endDate ?? q.dateTo);
    return {
      tenantId,
      ...(qStr(q.customerId) ? { customerId: q.customerId } : {}),
      ...(qStr(q.type) ? { type: q.type } : {}),
      ...(qStr(q.status) ? { status: q.status } : {}),
      ...(created ? { createdAt: created } : {}),
      // One look-up in the sale's lines for both the name and the SKU (two separate ones doubled the work).
      ...(query ? { OR: [{ transactionNumber: { contains: query } }, { items: { some: { OR: [{ productName: { contains: query } }, { sku: { contains: query } }] } } }] } : {}),
    };
  }

  app.get('/transactions', async (req: Req<unknown, Record<string, string>>) => {
    const p = pageParams(req.query, 20);
    const where = listWhere(req.query, req.auth.tenantId);
    const [total, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({ where, include: { items: true, payments: true }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
    const employeeIds = [...new Set(rows.map((r) => r.employeeId).filter(Boolean))] as string[];
    const [customers, employees] = await Promise.all([
      prisma.customer.findMany({ where: { id: { in: customerIds } }, select: PERSON }),
      prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const c = new Map(customers.map((x) => [x.id, x]));
    const e = new Map(employees.map((x) => [x.id, x]));
    return ok({
      transactions: serialize(
        rows.map((r) => ({ ...r, customer: r.customerId ? (c.get(r.customerId) ?? null) : null, employee: r.employeeId ? (e.get(r.employeeId) ?? null) : null })),
      ),
      meta: pageMeta(total, p),
    });
  });

  /** CSV export (semicolon separated, UTF-8 with BOM so Excel opens accents correctly). */
  app.get('/transactions/export', async (req: Req<unknown, Record<string, string>>, reply) => {
    const rows = await prisma.transaction.findMany({
      where: listWhere(req.query, req.auth.tenantId),
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    const customers = new Map(
      (await prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId).filter(Boolean) as string[] } } })).map((x) => [x.id, x]),
    );
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Numéro', 'Date', 'Type', 'Statut', 'Client', 'Articles', 'Sous-total', 'TVA', 'Remise', 'Total', 'Payé', 'Reste', 'Profit', 'Paiement'];
    const lines = rows.map((r) => {
      const cust = r.customerId ? customers.get(r.customerId) : null;
      return [
        r.transactionNumber,
        r.createdAt.toISOString().replace('T', ' ').slice(0, 16),
        r.type,
        r.status,
        cust ? `${cust.firstName} ${cust.lastName}`.trim() : '',
        r.items.map((i) => `${i.quantity}x ${i.productName}`).join(' | '),
        num(r.subtotal).toFixed(2),
        num(r.taxAmount).toFixed(2),
        num(r.discountAmount).toFixed(2),
        num(r.totalAmount).toFixed(2),
        num(r.amountPaid).toFixed(2),
        num(r.amountRemaining).toFixed(2),
        num(r.totalProfit).toFixed(2),
        [...new Set(r.payments.map((p) => p.method))].join('/'),
      ]
        .map(esc)
        .join(';');
    });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    return '﻿' + [header.map(esc).join(';'), ...lines].join('\r\n');
  });

  /** Sold product lines that can still be returned (POS return mode). Phones are listed from sold units. */
  app.get('/transactions/sold-items', async (req: Req<unknown, Record<string, string>>) => {
    const p = pageParams(req.query, 50);
    const query = qStr(req.query.query);
    const where: Prisma.TransactionItemWhereInput = {
      soldUnitId: null,
      productId: { not: null },
      transaction: { tenantId: req.auth.tenantId, type: { in: ['sale', 'credit', 'exchange'] }, status: { not: 'cancelled' } },
      ...(query
        ? { OR: [{ productName: { contains: query } }, { sku: { contains: query } }, { transaction: { transactionNumber: { contains: query } } }] }
        : {}),
    };
    const rows = await prisma.transactionItem.findMany({ where, include: { transaction: true }, orderBy: { transaction: { createdAt: 'desc' } }, take: 500 });
    const open = rows.filter((r) => r.quantity - r.returnedQuantity > 0);
    const customers = new Map(
      (await prisma.customer.findMany({ where: { id: { in: open.map((r) => r.transaction.customerId).filter(Boolean) as string[] } } })).map((x) => [x.id, x]),
    );
    const page = open.slice(p.skip, p.skip + p.limit);
    return ok({
      items: page.map((r) => {
        const qty = r.quantity - r.returnedQuantity;
        const cust = r.transaction.customerId ? customers.get(r.transaction.customerId) : null;
        return {
          transactionItemId: r.id,
          transactionId: r.transactionId,
          transactionNumber: r.transaction.transactionNumber,
          productId: r.productId,
          productName: r.productName,
          sku: r.sku,
          quantity: qty,
          unitPrice: num(r.unitPrice),
          totalPrice: r2((num(r.totalPrice) / r.quantity) * qty),
          customerId: r.transaction.customerId,
          customerName: cust ? `${cust.firstName} ${cust.lastName}`.trim() : null,
          soldAt: r.transaction.createdAt.toISOString(),
        };
      }),
      meta: pageMeta(open.length, p),
    });
  });

  app.get('/transactions/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const transaction = await loadTransaction(req.auth.tenantId, req.params.id);
    const tradeInUnit = await prisma.soldUnit.findFirst({ where: { tradeInTransactionId: req.params.id } });
    let tradeIn = null;
    if (tradeInUnit) {
      const from = tradeInUnit.tradeInFromCustomerId
        ? await prisma.customer.findUnique({ where: { id: tradeInUnit.tradeInFromCustomerId }, select: PERSON })
        : null;
      tradeIn = serialize({ ...tradeInUnit, tradeInFromCustomer: from });
    }
    return ok({ transaction, tradeInUnit: tradeIn });
  });

  app.post('/transactions/:id/payment', async (req: Req<z.infer<typeof paymentSchema>, unknown, { id: string }>, reply) => {
    const body = paymentSchema.parse(req.body);
    if (body.method !== 'cash' && !body.reference) throw badRequest('Référence requise pour ce mode de paiement');
    const { cashIn } = await addTransactionPayment(req.auth, req.params.id, body);
    if (cashIn > 0) reply.header('x-cash-drawer', 'open');
    return ok({ transaction: await loadTransaction(req.auth.tenantId, req.params.id) });
  });

  /** Cancelling a sale puts goods back in stock, phones back in inventory and takes the cash back out. */
  app.post('/transactions/:id/cancel', async (req: Req<{ reason?: string }, unknown, { id: string }>) => {
    const t = await prisma.transaction.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId }, include: { items: true, payments: true } });
    if (!t) throw notFound('Transaction', req.params.id);
    if (t.status === 'cancelled') throw badRequest('Transaction déjà annulée');
    if (t.type === 'return') throw badRequest("Un retour ne peut pas être annulé");
    await prisma.$transaction(async (tx) => {
      for (const item of t.items) {
        if (item.soldUnitId) {
          await tx.soldUnit.update({
            where: { id: item.soldUnitId },
            data:
              t.type === 'reservation'
                ? { reservedAt: null, reservedByCustomerId: null, reservationDeposit: null, reservationTransactionId: null }
                : { soldAt: null, transactionId: null, customerId: null, warrantyExpiresAt: null },
          });
        } else if (item.productId && t.type !== 'reservation') {
          const qty = item.quantity - item.returnedQuantity;
          if (qty > 0) {
            await moveStock(tx, {
              tenantId: req.auth.tenantId,
              productId: item.productId,
              delta: qty,
              type: 'return',
              reference: t.transactionNumber,
              notes: 'Annulation de vente',
              storeId: t.storeId,
              userId: req.auth.userId,
            });
          }
        }
      }
      const cash = r2(t.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + num(p.amount), 0));
      if (cash > 0) {
        await moveCaisse(tx, { tenantId: req.auth.tenantId, storeId: t.storeId, delta: -cash, type: 'return_refund', reason: `Annulation - ${t.transactionNumber}`, transactionId: t.id, transactionNumber: t.transactionNumber, userId: req.auth.userId });
      }
      await tx.transaction.update({
        where: { id: t.id },
        data: { status: 'cancelled', cancelReason: req.body?.reason ?? null, cancelledAt: new Date(), amountRemaining: 0 },
      });
    });
    return ok({ transaction: await loadTransaction(req.auth.tenantId, t.id) });
  });

  /** Corrections limited to notes and the seller/customer attribution (amounts are never rewritten). */
  app.patch('/transactions/:id/correct', async (req: Req<{ notes?: string; employeeId?: string | null; customerId?: string | null }, unknown, { id: string }>) => {
    const t = await prisma.transaction.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!t) throw notFound('Transaction', req.params.id);
    const body = z.object({ notes: z.string().optional(), employeeId: z.string().nullable().optional(), customerId: z.string().nullable().optional() }).parse(req.body ?? {});
    await prisma.transaction.update({ where: { id: t.id }, data: body });
    return ok({ transaction: await loadTransaction(req.auth.tenantId, t.id) });
  });

  /** Plain-text receipt (the app renders printable receipts itself; this endpoint serves integrations). */
  app.get('/transactions/:id/receipt', async (req: Req<unknown, unknown, { id: string }>, reply) => {
    const t = await loadTransaction(req.auth.tenantId, req.params.id);
    const lines = [
      `Reçu N° ${t.transactionNumber}`,
      new Date(t.createdAt).toLocaleString('fr-MA'),
      '',
      ...t.items.map((i: any) => `${i.quantity} x ${i.productName}  ${i.totalPrice} DH`),
      '',
      `TOTAL: ${t.totalAmount} DH`,
      `Payé: ${t.amountPaid} DH`,
    ];
    reply.header('content-type', 'text/plain; charset=utf-8');
    return lines.join('\n');
  });
}

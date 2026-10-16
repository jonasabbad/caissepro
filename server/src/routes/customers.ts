import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { pageMeta, pageParams, qStr } from '../lib/pagination.js';
import { moveCaisse } from '../lib/caisse.js';
import { resolveStoreId } from '../lib/tenant.js';

const customerSchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire'),
  lastName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  cin: z.string().trim().optional().nullable(),
  ice: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
  creditLimit: z.coerce.number().min(0).optional().nullable(),
});

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v ? v : null);

/**
 * Derived customer figures.
 * balance < 0: the customer owes the shop (unpaid sales); balance > 0: the shop owes the customer (credit).
 */
export async function customerStats(tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const [txs, refunds, reservations] = await Promise.all([
    prisma.transaction.findMany({
      where: { tenantId, customerId: { in: ids }, status: { not: 'cancelled' } },
      select: { customerId: true, type: true, amountPaid: true, amountRemaining: true, totalAmount: true },
    }),
    prisma.reservationRefund.findMany({ where: { tenantId, customerId: { in: ids }, status: { not: 'completed' } } }),
    prisma.soldUnit.findMany({ where: { tenantId, reservedByCustomerId: { in: ids }, soldAt: null, reservedAt: { not: null } }, select: { reservedByCustomerId: true } }),
  ]);
  const customers = await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, currentBalance: true } });
  const out = new Map<string, any>();
  for (const c of customers) {
    const mine = txs.filter((t) => t.customerId === c.id);
    // Reservations are deposits on items not handed over yet: their balance is not a debt.
    const sales = mine.filter((t) => t.type !== 'return' && t.type !== 'reservation');
    const returns = mine.filter((t) => t.type === 'return');
    const debt = sales.reduce((s, t) => s + num(t.amountRemaining), 0);
    const credit = num(c.currentBalance);
    out.set(c.id, {
      transactionCount: mine.length,
      totalSpent: r2(sales.reduce((s, t) => s + num(t.amountPaid), 0) - returns.reduce((s, t) => s + num(t.amountPaid), 0)),
      totalRefunded: r2(returns.reduce((s, t) => s + num(t.amountPaid), 0)),
      balance: r2(credit - debt),
      debt: r2(debt),
      reservationCount: reservations.filter((r) => r.reservedByCustomerId === c.id).length,
      pendingRefundAmount: r2(
        refunds.filter((r) => r.customerId === c.id).reduce((s, r) => s + num(r.amount) - num(r.amountPaid), 0),
      ),
    });
  }
  return out;
}

export default async function customerRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/customers', async (req: Req<unknown, Record<string, string>>) => {
    const p = pageParams(req.query, 50);
    const query = qStr(req.query.query);
    const where: Prisma.CustomerWhereInput = {
      tenantId: req.auth.tenantId,
      isActive: true,
      ...(query
        ? {
            AND: query.split(/\s+/).map((t) => ({
              OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { phone: { contains: t } }, { email: { contains: t } }, { cin: { contains: t } }],
            })),
          }
        : {}),
    };
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    const stats = await customerStats(req.auth.tenantId, customers.map((c) => c.id));
    return ok({ customers: serialize(customers.map((c) => ({ ...c, ...stats.get(c.id) }))), meta: pageMeta(total, p) });
  });

  app.get('/customers/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const c = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!c) throw notFound('Customer', req.params.id);
    const stats = await customerStats(req.auth.tenantId, [c.id]);
    return ok({ customer: serialize({ ...c, ...stats.get(c.id) }) });
  });

  app.post('/customers', async (req: Req<z.infer<typeof customerSchema>>, reply) => {
    const body = customerSchema.parse(req.body);
    const c = await prisma.customer.create({
      data: {
        tenantId: req.auth.tenantId,
        firstName: body.firstName,
        lastName: body.lastName ?? '',
        phone: blankToNull(body.phone),
        email: blankToNull(body.email),
        cin: blankToNull(body.cin),
        ice: blankToNull(body.ice),
        address: blankToNull(body.address),
        city: blankToNull(body.city),
        notes: blankToNull(body.notes),
        creditLimit: body.creditLimit ?? null,
      },
    });
    reply.status(201);
    return ok({ customer: serialize({ ...c, transactionCount: 0, totalSpent: 0, balance: 0, reservationCount: 0, pendingRefundAmount: 0 }) });
  });

  app.put('/customers/:id', async (req: Req<z.infer<typeof customerSchema>, unknown, { id: string }>) => {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Customer', req.params.id);
    const body = customerSchema.partial().parse(req.body);
    const c = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName ?? '' }),
        phone: blankToNull(body.phone),
        email: blankToNull(body.email),
        cin: blankToNull(body.cin),
        ice: blankToNull(body.ice),
        address: blankToNull(body.address),
        city: blankToNull(body.city),
        notes: blankToNull(body.notes),
        ...(body.creditLimit !== undefined && { creditLimit: body.creditLimit }),
      },
    });
    const stats = await customerStats(req.auth.tenantId, [c.id]);
    return ok({ customer: serialize({ ...c, ...stats.get(c.id) }) });
  });

  /** Customers with history are deactivated (kept for their transactions); others are removed. */
  app.delete('/customers/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Customer', req.params.id);
    const used = await prisma.transaction.count({ where: { customerId: existing.id } });
    if (used > 0) await prisma.customer.update({ where: { id: existing.id }, data: { isActive: false } });
    else await prisma.customer.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });

  app.get('/customers/:id/transactions', async (req: Req<unknown, unknown, { id: string }>) => {
    const transactions = await prisma.transaction.findMany({
      where: { tenantId: req.auth.tenantId, customerId: req.params.id },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ transactions: serialize(transactions) });
  });

  /** Payment history: payments taken on sales + debt payments / refunds recorded on the customer. */
  app.get('/customers/:id/payments', async (req: Req<unknown, unknown, { id: string }>) => {
    const [txPayments, customerPayments] = await Promise.all([
      prisma.payment.findMany({
        where: { transaction: { tenantId: req.auth.tenantId, customerId: req.params.id } },
        include: { transaction: { select: { transactionNumber: true, type: true } } },
      }),
      prisma.customerPayment.findMany({ where: { tenantId: req.auth.tenantId, customerId: req.params.id } }),
    ]);
    const payments = [
      ...txPayments.map((p) => ({
        id: p.id,
        source: 'transaction',
        amount: p.transaction.type === 'return' ? -num(p.amount) : num(p.amount),
        method: p.method,
        reference: p.reference,
        transactionNumber: p.transaction.transactionNumber,
        createdAt: p.receivedAt.toISOString(),
      })),
      ...customerPayments.map((p) => ({
        id: p.id,
        source: 'payment',
        amount: num(p.amount),
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        transactionNumber: null,
        createdAt: p.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ payments });
  });

  const paymentSchema = z.object({
    amount: z.coerce.number().positive('Le montant doit être positif'),
    method: z.enum(['cash', 'card', 'bank_transfer', 'check', 'mobile_money']).default('cash'),
    reference: z.string().trim().optional(),
    notes: z.string().optional(),
  });

  /**
   * Debt payment (customer owes the shop): allocated to the oldest unpaid sales first.
   * Refund (shop owes the customer, balance > 0): reduces the customer's credit.
   */
  app.post('/customers/:id/payments', async (req: Req<z.infer<typeof paymentSchema>, unknown, { id: string }>) => {
    const body = paymentSchema.parse(req.body);
    if (body.method !== 'cash' && !body.reference) throw badRequest('Une référence est requise pour ce mode de paiement');
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!customer) throw notFound('Customer', req.params.id);
    const stats = (await customerStats(req.auth.tenantId, [customer.id])).get(customer.id);
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);

    const result = await prisma.$transaction(async (tx) => {
      if (stats.balance > 0) {
        const refund = Math.min(body.amount, stats.balance);
        await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: r2(num(customer.currentBalance) - refund) } });
        const payment = await tx.customerPayment.create({
          data: { tenantId: req.auth.tenantId, customerId: customer.id, amount: -refund, method: body.method, reference: body.reference, notes: body.notes, createdBy: req.auth.userId },
        });
        if (body.method === 'cash') {
          await moveCaisse(tx, { tenantId: req.auth.tenantId, storeId, amount: -refund, type: 'refund', reference: customer.id, description: 'Remboursement client', userId: req.auth.userId });
        }
        return payment;
      }

      if (stats.debt <= 0) throw badRequest("Ce client n'a aucune dette");
      let remaining = Math.min(body.amount, stats.debt);
      const open = await tx.transaction.findMany({
        where: { tenantId: req.auth.tenantId, customerId: customer.id, status: { not: 'cancelled' }, type: { not: 'return' }, amountRemaining: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
      const allocations: { transactionId: string; amount: number }[] = [];
      for (const t of open) {
        if (remaining <= 0) break;
        const due = num(t.amountRemaining);
        const pay = Math.min(due, remaining);
        remaining = r2(remaining - pay);
        const newRemaining = r2(due - pay);
        await tx.transaction.update({
          where: { id: t.id },
          data: {
            amountPaid: r2(num(t.amountPaid) + pay),
            amountRemaining: newRemaining,
            status: newRemaining <= 0 ? 'completed' : 'partial',
          },
        });
        allocations.push({ transactionId: t.id, amount: pay });
      }
      const paid = r2(allocations.reduce((s, a) => s + a.amount, 0));
      const payment = await tx.customerPayment.create({
        data: {
          tenantId: req.auth.tenantId,
          customerId: customer.id,
          amount: paid,
          method: body.method,
          reference: body.reference,
          notes: body.notes,
          allocations: JSON.stringify(allocations),
          createdBy: req.auth.userId,
        },
      });
      if (body.method === 'cash') {
        await moveCaisse(tx, { tenantId: req.auth.tenantId, storeId, amount: paid, type: 'debt_payment', reference: customer.id, description: 'Paiement dette client', userId: req.auth.userId });
      }
      return payment;
    });

    const fresh = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const after = (await customerStats(req.auth.tenantId, [customer.id])).get(customer.id);
    return ok({ payment: serialize(result), customer: serialize({ ...fresh, ...after }) });
  });
}

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { num, parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { moveCaisse } from '../lib/caisse.js';
import { qStr } from '../lib/pagination.js';

interface RefundPayment {
  id: string;
  amount: number;
  method: string;
  notes?: string;
  paidAt: string;
}

/** Deposit refunds owed to customers whose reserved phone was sold to someone else. */
async function present(rows: Awaited<ReturnType<typeof prisma.reservationRefund.findMany>>) {
  const [customers, units] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId).filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true, phone: true } }),
    prisma.soldUnit.findMany({ where: { id: { in: rows.map((r) => r.soldUnitId).filter(Boolean) as string[] } } }),
  ]);
  const c = new Map(customers.map((x) => [x.id, x]));
  const u = new Map(units.map((x) => [x.id, x]));
  return rows.map((r) =>
    serialize({
      ...r,
      depositAmount: num(r.amount).toFixed(2),
      refundedAmount: num(r.amountPaid).toFixed(2),
      payments: parseJson<RefundPayment[]>(r.payments, []),
      customer: r.customerId ? (c.get(r.customerId) ?? null) : null,
      soldUnit: r.soldUnitId ? (u.get(r.soldUnitId) ?? null) : null,
    }),
  );
}

export default async function reservationRoutes(app: FastifyInstance) {
  authed(app);
  const base = '/phone-seller/reservation-refunds';

  app.get(base, async (req: Req<unknown, Record<string, string>>) => {
    const where: Prisma.ReservationRefundWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(req.query.status) ? { status: req.query.status } : {}),
      ...(qStr(req.query.customerId) ? { customerId: req.query.customerId } : {}),
    };
    return ok({ refunds: await present(await prisma.reservationRefund.findMany({ where, orderBy: { createdAt: 'desc' } })) });
  });

  app.get(`${base}/pending`, async (req: Req<unknown, Record<string, string>>) => {
    const rows = await prisma.reservationRefund.findMany({
      where: { tenantId: req.auth.tenantId, status: { in: ['pending', 'partial'] }, ...(qStr(req.query.customerId) ? { customerId: req.query.customerId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ refunds: await present(rows) });
  });

  app.get(`${base}/summary`, async (req) => {
    const rows = await prisma.reservationRefund.findMany({ where: { tenantId: req.auth.tenantId } });
    const pending = rows.filter((r) => r.status !== 'completed');
    return ok({
      pendingCount: pending.length,
      pendingAmount: r2(pending.reduce((s, r) => s + num(r.amount) - num(r.amountPaid), 0)),
      completedCount: rows.filter((r) => r.status === 'completed').length,
      totalRefunded: r2(rows.reduce((s, r) => s + num(r.amountPaid), 0)),
    });
  });

  app.get(`${base}/:id`, async (req: Req<unknown, unknown, { id: string }>) => {
    const r = await prisma.reservationRefund.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!r) throw notFound('Reservation refund', req.params.id);
    return ok({ refund: (await present([r]))[0] });
  });

  app.post(`${base}/:id/record-payment`, async (req: Req<{ amount: number; method?: string; notes?: string }, unknown, { id: string }>, reply) => {
    const body = z.object({ amount: z.coerce.number().positive(), method: z.string().default('cash'), notes: z.string().optional() }).parse(req.body);
    const r = await prisma.reservationRefund.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!r) throw notFound('Reservation refund', req.params.id);
    const remaining = r2(num(r.amount) - num(r.amountPaid));
    if (remaining <= 0) throw badRequest('Acompte déjà remboursé');
    const amount = r2(Math.min(body.amount, remaining));
    const payments = parseJson<RefundPayment[]>(r.payments, []);
    payments.push({ id: randomUUID(), amount, method: body.method, notes: body.notes, paidAt: new Date().toISOString() });
    const paid = r2(num(r.amountPaid) + amount);
    const done = paid >= num(r.amount);
    await prisma.$transaction(async (tx) => {
      await tx.reservationRefund.update({
        where: { id: r.id },
        data: { amountPaid: paid, payments: JSON.stringify(payments), status: done ? 'completed' : 'partial', completedAt: done ? new Date() : null },
      });
      if (body.method === 'cash') {
        await moveCaisse(tx, {
          tenantId: req.auth.tenantId,
          storeId: req.auth.storeId,
          delta: -amount,
          type: 'reservation_refund',
          reason: 'Remboursement acompte réservation',
          transactionId: r.transactionId,
          userId: req.auth.userId,
        });
      }
    });
    if (body.method === 'cash') reply.header('x-cash-drawer', 'open');
    const fresh = await prisma.reservationRefund.findUniqueOrThrow({ where: { id: r.id } });
    return ok({ refund: (await present([fresh]))[0] });
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { endOfDay, pageMeta, pageParams, qStr, startOfDay } from '../lib/pagination.js';
import { INFLOW_TYPES, moveCaisse, type CaisseType } from '../lib/caisse.js';

const moneySchema = z.object({ amount: z.coerce.number().positive('Montant invalide'), reason: z.string().trim().min(1, 'Le motif est obligatoire') });
const adjustSchema = z.object({ newBalance: z.coerce.number(), reason: z.string().trim().min(1, 'Le motif est obligatoire') });

/** Signed effect of a movement row on the balance. */
const signed = (m: { type: string; amount: unknown }) =>
  m.type === 'adjustment' ? num(m.amount) : INFLOW_TYPES.includes(m.type as CaisseType) ? num(m.amount) : -num(m.amount);

export default async function storesRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/stores', async (req) => {
    const stores = await prisma.store.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    return ok({ stores: serialize(stores) });
  });

  app.get('/stores/active', async (req) => {
    const stores = await prisma.store.findMany({
      where: { tenantId: req.auth.tenantId, isActive: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    return ok({ stores: serialize(stores) });
  });

  const loadStore = async (tenantId: string, id: string) => {
    const store = await prisma.store.findFirst({ where: { id, tenantId } });
    if (!store) throw notFound('Store', id);
    return store;
  };

  /** Drawer balance, movements of the period (default: today) and the period's in/out summary. */
  app.get('/stores/:id/caisse', async (req: Req<unknown, Record<string, string>, { id: string }>) => {
    const store = await loadStore(req.auth.tenantId, req.params.id);
    const today = new Date();
    const from = startOfDay(qStr(req.query.startDate) ?? today);
    const to = endOfDay(qStr(req.query.endDate) ?? today);
    const p = pageParams(req.query, 50);
    const where: Prisma.CaisseMovementWhereInput = { storeId: store.id, createdAt: { gte: from, lte: to } };
    const [rows, total, inPeriod, before] = await Promise.all([
      prisma.caisseMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
      prisma.caisseMovement.count({ where }),
      prisma.caisseMovement.findMany({ where, orderBy: { createdAt: 'asc' }, select: { type: true, amount: true, balanceAfter: true } }),
      prisma.caisseMovement.findFirst({ where: { storeId: store.id, createdAt: { lt: from } }, orderBy: { createdAt: 'desc' }, select: { balanceAfter: true } }),
    ]);
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as string[] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const u = new Map(users.map((x) => [x.id, x]));
    const opening = before ? num(before.balanceAfter) : 0;
    const byType: Record<string, number> = {};
    let totalIn = 0;
    let totalOut = 0;
    for (const m of inPeriod) {
      const d = signed(m);
      if (d >= 0) totalIn += d;
      else totalOut -= d;
      byType[m.type] = r2((byType[m.type] ?? 0) + Math.abs(num(m.amount)));
    }
    return ok({
      balance: num(store.caisseBalance),
      dailySummary: {
        openingBalance: r2(opening),
        closingBalance: inPeriod.length ? num(inPeriod[inPeriod.length - 1].balanceAfter) : r2(opening),
        totalIn: r2(totalIn),
        totalOut: r2(totalOut),
        byType,
      },
      movements: serialize(rows.map((r) => ({ ...r, creator: r.createdBy ? (u.get(r.createdBy) ?? null) : null }))),
      meta: pageMeta(total, p),
    });
  });

  app.get('/stores/:id/caisse/balance', async (req: Req<unknown, unknown, { id: string }>) => {
    const store = await loadStore(req.auth.tenantId, req.params.id);
    return ok({ balance: num(store.caisseBalance) });
  });

  const manual = (type: 'cash_in' | 'cash_out') => async (req: Req<z.infer<typeof moneySchema>, unknown, { id: string }>, reply: { header: (k: string, v: string) => unknown }) => {
    const store = await loadStore(req.auth.tenantId, req.params.id);
    const body = moneySchema.parse(req.body);
    const movement = await prisma.$transaction((tx) =>
      moveCaisse(tx, { tenantId: req.auth.tenantId, storeId: store.id, delta: type === 'cash_in' ? body.amount : -body.amount, type, reason: body.reason, userId: req.auth.userId }),
    );
    reply.header('x-cash-drawer', 'open');
    return ok({ movement: serialize(movement) });
  };
  app.post('/stores/:id/caisse/cash-in', manual('cash_in'));
  app.post('/stores/:id/caisse/cash-out', manual('cash_out'));

  /** Count correction: sets the balance to the counted amount and logs the difference. */
  app.post('/stores/:id/caisse/adjust', async (req: Req<z.infer<typeof adjustSchema>, unknown, { id: string }>) => {
    const store = await loadStore(req.auth.tenantId, req.params.id);
    const body = adjustSchema.parse(req.body);
    const delta = r2(body.newBalance - num(store.caisseBalance));
    const movement = delta
      ? await prisma.$transaction((tx) => moveCaisse(tx, { tenantId: req.auth.tenantId, storeId: store.id, delta, type: 'adjustment', reason: body.reason, userId: req.auth.userId }))
      : null;
    return ok({ movement: serialize(movement), balance: body.newBalance });
  });
}

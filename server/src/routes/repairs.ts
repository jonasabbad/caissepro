import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma, type Tx } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { num, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { makeRef } from '../lib/refs.js';
import { qStr } from '../lib/pagination.js';
import { resolveStoreId } from '../lib/tenant.js';

const STATUSES = ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'] as const;
type Status = (typeof STATUSES)[number];
/** A device can only have one repair in these states at a time. */
const ACTIVE: Status[] = ['pending', 'in_progress', 'completed'];
const NEXT: Record<Status, Status[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['delivered'],
  delivered: [],
  cancelled: [],
};

const money = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(0).optional());
const repairSchema = z.object({
  customerId: z.string().min(1, 'Le client est obligatoire'),
  deviceDescription: z.string().trim().min(1, "La description de l'appareil est obligatoire").max(255),
  fixedPrice: money,
  soldUnitId: z.string().optional().nullable(),
  repairerId: z.string().optional().nullable(),
  diagnosticNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
const expenseSchema = z.object({
  description: z.string().trim().min(1, 'La description est obligatoire').max(255),
  amount: z.coerce.number().min(0),
  type: z.enum(['part', 'labor', 'other']).default('part'),
});

const userSelect = { id: true, firstName: true, lastName: true, email: true } as const;

async function present(rows: Prisma.RepairGetPayload<{ include: { expenses: true } }>[]) {
  const ids = (k: 'customerId' | 'repairerId' | 'soldUnitId' | 'createdBy') => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const [customers, repairers, units, users] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: ids('customerId') } } }),
    prisma.repairer.findMany({ where: { id: { in: ids('repairerId') } } }),
    prisma.soldUnit.findMany({ where: { id: { in: ids('soldUnitId') } } }),
    prisma.user.findMany({ where: { id: { in: ids('createdBy') } }, select: userSelect }),
  ]);
  const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const [c, rp, u, us] = [by(customers), by(repairers), by(units), by(users)];
  return rows.map((r) =>
    serialize({
      ...r,
      expenses: [...r.expenses].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      customer: r.customerId ? (c.get(r.customerId) ?? null) : null,
      repairer: r.repairerId ? (rp.get(r.repairerId) ?? null) : null,
      soldUnit: r.soldUnitId ? (u.get(r.soldUnitId) ?? null) : null,
      creator: r.createdBy ? (us.get(r.createdBy) ?? null) : null,
    }),
  );
}

/** Repair spending on a stock device raises its cost: repairCost = Σ cost of its non-cancelled repairs. */
async function syncUnitRepairCost(tx: Tx, soldUnitId: string | null | undefined) {
  if (!soldUnitId) return;
  const unit = await tx.soldUnit.findUnique({ where: { id: soldUnitId } });
  if (!unit) return;
  const repairs = await tx.repair.findMany({ where: { soldUnitId, status: { not: 'cancelled' } }, select: { totalCost: true } });
  const repairCost = r2(repairs.reduce((s, r) => s + num(r.totalCost), 0));
  await tx.soldUnit.update({
    where: { id: unit.id },
    data: { repairCost, profit: r2(num(unit.salePrice) - num(unit.purchasePrice) - repairCost) },
  });
}

async function recomputeTotal(tx: Tx, repairId: string) {
  const expenses = await tx.repairExpense.findMany({ where: { repairId } });
  const repair = await tx.repair.update({ where: { id: repairId }, data: { totalCost: r2(expenses.reduce((s, e) => s + num(e.amount), 0)) } });
  await syncUnitRepairCost(tx, repair.soldUnitId);
}

export default async function repairRoutes(app: FastifyInstance) {
  authed(app);

  const load = async (tenantId: string, id: string) => {
    const r = await prisma.repair.findFirst({ where: { id, tenantId }, include: { expenses: true } });
    if (!r) throw notFound('Repair', id);
    return r;
  };
  const one = async (tenantId: string, id: string) => (await present([await load(tenantId, id)]))[0];

  async function assertRefs(tenantId: string, body: Partial<z.infer<typeof repairSchema>>, exceptRepairId?: string) {
    if (body.customerId && !(await prisma.customer.findFirst({ where: { id: body.customerId, tenantId } }))) throw notFound('Customer', body.customerId);
    if (body.repairerId && !(await prisma.repairer.findFirst({ where: { id: body.repairerId, tenantId } }))) throw notFound('Repairer', body.repairerId);
    if (body.soldUnitId) {
      if (!(await prisma.soldUnit.findFirst({ where: { id: body.soldUnitId, tenantId } }))) throw notFound('Sold unit', body.soldUnitId);
      const active = await prisma.repair.findFirst({
        where: { tenantId, soldUnitId: body.soldUnitId, status: { in: ACTIVE }, ...(exceptRepairId && { id: { not: exceptRepairId } }) },
      });
      if (active) throw conflict(`Cet appareil a déjà une réparation en cours (${active.repairNumber})`);
    }
  }

  app.get('/repairs', async (req: Req<unknown, Record<string, string>>) => {
    const query = qStr(req.query.query);
    const status = qStr(req.query.status);
    let where: Prisma.RepairWhereInput = { tenantId: req.auth.tenantId, ...(status && { status }) };
    if (query) {
      const customers = await prisma.customer.findMany({
        where: { tenantId: req.auth.tenantId, OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }, { phone: { contains: query } }] },
        select: { id: true },
      });
      where = {
        ...where,
        OR: [{ repairNumber: { contains: query } }, { deviceDescription: { contains: query } }, { customerId: { in: customers.map((c) => c.id) } }],
      };
    }
    const rows = await prisma.repair.findMany({ where, include: { expenses: true }, orderBy: { receivedAt: 'desc' } });
    return ok({ repairs: await present(rows) });
  });

  app.get('/repairs/by-unit/:unitId', async (req: Req<unknown, unknown, { unitId: string }>) => {
    const rows = await prisma.repair.findMany({
      where: { tenantId: req.auth.tenantId, soldUnitId: req.params.unitId },
      include: { expenses: true },
      orderBy: { receivedAt: 'desc' },
    });
    return ok({ repairs: await present(rows) });
  });

  app.get('/repairs/:id', async (req: Req<unknown, unknown, { id: string }>) => ok({ repair: await one(req.auth.tenantId, req.params.id) }));

  app.post('/repairs', async (req: Req<z.infer<typeof repairSchema>>, reply) => {
    const body = repairSchema.parse(req.body);
    await assertRefs(req.auth.tenantId, body);
    const r = await prisma.repair.create({
      data: {
        tenantId: req.auth.tenantId,
        storeId: await resolveStoreId(req.auth.tenantId, req.auth.storeId),
        repairNumber: makeRef('REP'),
        customerId: body.customerId,
        deviceDescription: body.deviceDescription,
        fixedPrice: body.fixedPrice ?? 0,
        soldUnitId: body.soldUnitId || null,
        repairerId: body.repairerId || null,
        diagnosticNotes: body.diagnosticNotes ?? '',
        notes: body.notes ?? '',
        status: 'pending',
        createdBy: req.auth.userId,
      },
    });
    reply.status(201);
    return ok({ repair: await one(req.auth.tenantId, r.id) });
  });

  app.put('/repairs/:id', async (req: Req<Partial<z.infer<typeof repairSchema>>, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const body = repairSchema.partial().parse(req.body);
    if (body.soldUnitId !== undefined && body.soldUnitId !== existing.soldUnitId) await assertRefs(req.auth.tenantId, { soldUnitId: body.soldUnitId }, existing.id);
    await assertRefs(req.auth.tenantId, { customerId: body.customerId, repairerId: body.repairerId });
    await prisma.$transaction(async (tx) => {
      await tx.repair.update({
        where: { id: existing.id },
        data: {
          ...(body.customerId !== undefined && { customerId: body.customerId }),
          ...(body.deviceDescription !== undefined && { deviceDescription: body.deviceDescription }),
          ...('fixedPrice' in body && { fixedPrice: body.fixedPrice ?? 0 }),
          ...(body.soldUnitId !== undefined && { soldUnitId: body.soldUnitId || null }),
          ...(body.repairerId !== undefined && { repairerId: body.repairerId || null }),
          ...(body.diagnosticNotes !== undefined && { diagnosticNotes: body.diagnosticNotes ?? '' }),
          ...(body.notes !== undefined && { notes: body.notes ?? '' }),
        },
      });
      if (body.soldUnitId !== undefined && body.soldUnitId !== existing.soldUnitId) {
        await syncUnitRepairCost(tx, existing.soldUnitId);
        await syncUnitRepairCost(tx, body.soldUnitId);
      }
    });
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  /** pending → in_progress → completed → delivered; cancel from pending / in_progress. Completing needs a price. */
  app.patch('/repairs/:id/status', async (req: Req<{ status: string }, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const from = existing.status as Status;
    if (!NEXT[from]?.includes(status)) throw badRequest(`Transition de statut invalide (${from} → ${status})`);
    if (status === 'completed' && num(existing.fixedPrice) <= 0) throw badRequest('Définissez le prix de la réparation avant de la terminer');
    await prisma.$transaction(async (tx) => {
      await tx.repair.update({
        where: { id: existing.id },
        data: {
          status,
          ...(status === 'completed' && { completedAt: new Date() }),
          ...(status === 'delivered' && { deliveredAt: new Date() }),
        },
      });
      if (status === 'cancelled') await syncUnitRepairCost(tx, existing.soldUnitId);
    });
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  app.delete('/repairs/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.repair.delete({ where: { id: existing.id } });
      await syncUnitRepairCost(tx, existing.soldUnitId);
    });
    return ok({ deleted: true });
  });

  app.post('/repairs/:id/expenses', async (req: Req<z.infer<typeof expenseSchema>, unknown, { id: string }>, reply) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (existing.status === 'cancelled' || existing.status === 'delivered') throw badRequest('Réparation clôturée');
    const body = expenseSchema.parse(req.body);
    await prisma.$transaction(async (tx) => {
      await tx.repairExpense.create({ data: { repairId: existing.id, tenantId: req.auth.tenantId, ...body } });
      await recomputeTotal(tx, existing.id);
    });
    reply.status(201);
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  app.delete('/repairs/:id/expenses/:expenseId', async (req: Req<unknown, unknown, { id: string; expenseId: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const expense = await prisma.repairExpense.findFirst({ where: { id: req.params.expenseId, repairId: existing.id } });
    if (!expense) throw notFound('Repair expense', req.params.expenseId);
    await prisma.$transaction(async (tx) => {
      await tx.repairExpense.delete({ where: { id: expense.id } });
      await recomputeTotal(tx, existing.id);
    });
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  // ── Repairers (external technicians) ──
  app.get('/repairers', async (req: Req<unknown, Record<string, string>>) => {
    const query = qStr(req.query.query);
    const repairers = await prisma.repairer.findMany({
      where: { tenantId: req.auth.tenantId, isActive: true, ...(query && { OR: [{ name: { contains: query } }, { phone: { contains: query } }] }) },
      orderBy: { name: 'asc' },
    });
    return ok({ repairers: serialize(repairers) });
  });

  app.post('/repairers', async (req: Req<{ name: string; phone?: string }>, reply) => {
    const body = z.object({ name: z.string().trim().min(1, 'Le nom est obligatoire'), phone: z.string().trim().optional().nullable() }).parse(req.body);
    const repairer = await prisma.repairer.create({ data: { tenantId: req.auth.tenantId, name: body.name, phone: body.phone || null } });
    reply.status(201);
    return ok({ repairer: serialize(repairer) });
  });
}

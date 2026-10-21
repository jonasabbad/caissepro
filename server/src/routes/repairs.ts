import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma, Prisma, type Tx } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { num, parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { makeRef } from '../lib/refs.js';
import { endOfDay, pageMeta, pageParams, qStr, startOfDay } from '../lib/pagination.js';
import { resolveStoreId } from '../lib/tenant.js';
import { moveStock } from '../lib/stock.js';
import { moveCaisse } from '../lib/caisse.js';
import { refreshRepairFinancials, repairFinancials } from '../lib/profit.js';
import { newTrackingToken } from '../lib/codes.js';

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
const PAY_METHODS = ['cash', 'card', 'bank_transfer', 'check'] as const;

const money = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(0).optional());
const repairSchema = z.object({
  customerId: z.string().min(1, 'Le client est obligatoire'),
  deviceDescription: z.string().trim().min(1, "La description de l'appareil est obligatoire").max(255),
  fixedPrice: money,
  soldUnitId: z.string().optional().nullable(),
  repairerId: z.string().optional().nullable(),
  diagnosticNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  estimatedCompletionAt: z.coerce.date().optional().nullable(),
});
const expenseSchema = z.object({
  description: z.string().trim().max(255).optional(),
  amount: z.coerce.number().min(0).optional(),
  type: z.enum(['part', 'stock_part', 'labor', 'other']).default('part'),
  productId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1).optional(),
  repairerId: z.string().optional().nullable(),
  paidFromDrawer: z.boolean().optional(),
});
const paymentSchema = z.object({
  amount: z.coerce.number().positive('Montant invalide'),
  method: z.enum(PAY_METHODS).default('cash'),
  reference: z.string().trim().optional().nullable(),
});

interface RepairPayment {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
  userId: string;
}

const userSelect = { id: true, firstName: true, lastName: true, email: true } as const;
type RepairRow = Prisma.RepairGetPayload<{ include: { expenses: true } }>;

async function present(rows: RepairRow[]) {
  const ids = (k: 'customerId' | 'repairerId' | 'soldUnitId' | 'createdBy') => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const productIds = [...new Set(rows.flatMap((r) => r.expenses.map((e) => e.productId)).filter(Boolean))] as string[];
  const expenseRepairerIds = rows.flatMap((r) => r.expenses.map((e) => e.repairerId)).filter(Boolean) as string[];
  const [customers, repairers, units, users, products] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: ids('customerId') } } }),
    prisma.repairer.findMany({ where: { id: { in: [...new Set([...ids('repairerId'), ...expenseRepairerIds])] } } }),
    prisma.soldUnit.findMany({ where: { id: { in: ids('soldUnitId') } } }),
    prisma.user.findMany({ where: { id: { in: ids('createdBy') } }, select: userSelect }),
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }),
  ]);
  const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const [c, rp, u, us, pr] = [by(customers), by(repairers), by(units), by(users), by(products)];
  return rows.map((r) =>
    serialize({
      ...r,
      payments: parseJson<RepairPayment[]>(r.payments, []),
      expenses: [...r.expenses]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((e) => ({ ...e, product: e.productId ? (pr.get(e.productId) ?? null) : null, repairer: e.repairerId ? (rp.get(e.repairerId) ?? null) : null })),
      financials: repairFinancials(r, r.expenses),
      customer: r.customerId ? (c.get(r.customerId) ?? null) : null,
      repairer: r.repairerId ? (rp.get(r.repairerId) ?? null) : null,
      soldUnit: r.soldUnitId ? (u.get(r.soldUnitId) ?? null) : null,
      creator: r.createdBy ? (us.get(r.createdBy) ?? null) : null,
    }),
  );
}

/**
 * Device cost from repairs: only legacy repairs (costsCapitalized) still add their costs to the device. Since
 * 2026-10-17 a repair's costs stay in the repair's own profit, so they are not counted again when the device is sold.
 */
async function syncUnitRepairCost(tx: Tx, soldUnitId: string | null | undefined) {
  if (!soldUnitId) return;
  const unit = await tx.soldUnit.findUnique({ where: { id: soldUnitId } });
  if (!unit) return;
  const repairs = await tx.repair.findMany({ where: { soldUnitId, status: { not: 'cancelled' }, costsCapitalized: true }, select: { totalCost: true } });
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
  await refreshRepairFinancials(tx, repairId);
}

/** Removes an expense and undoes its side effects: stock parts go back to inventory, drawer payments are put back. */
async function undoExpense(tx: Tx, repair: { id: string; tenantId: string; storeId: string | null; repairNumber: string }, expenseId: string, userId: string, reason: string) {
  const e = await tx.repairExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (e.type === 'stock_part' && e.productId && e.quantity) {
    await moveStock(tx, {
      tenantId: repair.tenantId,
      productId: e.productId,
      delta: e.quantity,
      type: 'return',
      reference: repair.repairNumber,
      notes: reason,
      storeId: repair.storeId,
      userId,
    });
  }
  if (e.paidFromDrawer && num(e.amount) > 0) {
    await moveCaisse(tx, { tenantId: repair.tenantId, storeId: repair.storeId, delta: num(e.amount), type: 'cash_in', reason: `Annulation dépense - ${repair.repairNumber}`, userId });
  }
  await tx.repairExpense.delete({ where: { id: e.id } });
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

  /** Filters: query, status, repairerId (technician), paymentStatus, dateFrom/dateTo (intake date). */
  app.get('/repairs', async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const query = qStr(q.query);
    const from = qStr(q.dateFrom ?? q.startDate);
    const to = qStr(q.dateTo ?? q.endDate);
    let where: Prisma.RepairWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.status) && { status: q.status }),
      ...(qStr(q.repairerId) && { repairerId: q.repairerId }),
      ...(qStr(q.paymentStatus) && { paymentStatus: q.paymentStatus }),
      ...((from || to) && { receivedAt: { ...(from && { gte: startOfDay(from) }), ...(to && { lte: endOfDay(to) }) } }),
    };
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
    // With ?page=…, one page plus the totals the list shows; without it, every match (kept for older callers).
    if (q.page !== undefined) {
      const p = pageParams(q, 20, 100);
      const [total, activeCount, rows] = await Promise.all([
        prisma.repair.count({ where }),
        prisma.repair.count({ where: { AND: [where, { status: { in: ['pending', 'in_progress', 'completed'] } }] } }),
        prisma.repair.findMany({ where, include: { expenses: true }, orderBy: { receivedAt: 'desc' }, skip: p.skip, take: p.limit }),
      ]);
      return ok({ repairs: await present(rows), meta: { ...pageMeta(total, p), activeCount } });
    }
    const rows = await prisma.repair.findMany({ where, include: { expenses: true }, orderBy: { receivedAt: 'desc' } });
    return ok({ repairs: await present(rows) });
  });

  /** How many repairs each device has had (POS badges), without loading the repairs themselves. */
  app.get('/repairs/counts-by-unit', async (req) => {
    const groups = await prisma.repair.groupBy({ by: ['soldUnitId'], where: { tenantId: req.auth.tenantId, soldUnitId: { not: null } }, _count: true });
    return ok({ counts: Object.fromEntries(groups.map((g) => [g.soldUnitId!, g._count])) });
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
        estimatedCompletionAt: body.estimatedCompletionAt ?? null,
        trackingToken: newTrackingToken(),
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
    if ('fixedPrice' in body && (body.fixedPrice ?? 0) < num(existing.amountPaid)) throw badRequest('Le prix ne peut pas être inférieur au montant déjà encaissé');
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
          ...(body.estimatedCompletionAt !== undefined && { estimatedCompletionAt: body.estimatedCompletionAt ?? null }),
        },
      });
      if (body.soldUnitId !== undefined && body.soldUnitId !== existing.soldUnitId) {
        await syncUnitRepairCost(tx, existing.soldUnitId);
        await syncUnitRepairCost(tx, body.soldUnitId);
      }
      await refreshRepairFinancials(tx, existing.id);
    });
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  /**
   * pending → in_progress → completed → delivered; cancel from pending / in_progress. Completing needs a price.
   * Cancelling is refused once money was taken, and puts unused stock parts back on the shelf.
   */
  app.patch('/repairs/:id/status', async (req: Req<{ status: string }, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const from = existing.status as Status;
    if (!NEXT[from]?.includes(status)) throw badRequest(`Transition de statut invalide (${from} → ${status})`);
    if (status === 'completed' && num(existing.fixedPrice) <= 0) throw badRequest('Définissez le prix de la réparation avant de la terminer');
    if (status === 'cancelled' && num(existing.amountPaid) > 0) throw badRequest('Remboursez le client avant d’annuler une réparation déjà payée');
    await prisma.$transaction(async (tx) => {
      if (status === 'cancelled') {
        for (const e of existing.expenses.filter((x) => x.type === 'stock_part')) {
          await undoExpense(tx, existing, e.id, req.auth.userId, 'Pièce remise en stock (réparation annulée)');
        }
      }
      await tx.repair.update({
        where: { id: existing.id },
        data: {
          status,
          ...(status === 'completed' && { completedAt: new Date() }),
          ...(status === 'delivered' && { deliveredAt: new Date() }),
        },
      });
      await recomputeTotal(tx, existing.id);
    });
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  /** Customer payment (deposit or balance). Cash goes into the drawer. */
  app.post('/repairs/:id/payments', async (req: Req<z.infer<typeof paymentSchema>, unknown, { id: string }>, reply) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (existing.status === 'cancelled') throw badRequest('Réparation annulée');
    const body = paymentSchema.parse(req.body);
    const price = num(existing.fixedPrice);
    if (price <= 0) throw badRequest('Définissez le prix de la réparation avant d’encaisser');
    const due = r2(price - num(existing.amountPaid));
    if (due <= 0) throw badRequest('Réparation déjà payée');
    if (body.method !== 'cash' && !body.reference?.trim()) throw badRequest('Référence requise pour ce mode de paiement');
    const amount = r2(Math.min(body.amount, due));
    const payments = parseJson<RepairPayment[]>(existing.payments, []);
    payments.push({ id: randomUUID(), amount, method: body.method, reference: body.reference ?? null, paidAt: new Date().toISOString(), userId: req.auth.userId });
    await prisma.$transaction(async (tx) => {
      await tx.repair.update({ where: { id: existing.id }, data: { amountPaid: r2(num(existing.amountPaid) + amount), payments: JSON.stringify(payments) } });
      if (body.method === 'cash') {
        await moveCaisse(tx, { tenantId: existing.tenantId, storeId: existing.storeId, delta: amount, type: 'sale', reason: `Paiement réparation - ${existing.repairNumber}`, userId: req.auth.userId });
      }
      await refreshRepairFinancials(tx, existing.id);
    });
    if (body.method === 'cash') reply.header('x-cash-drawer', 'open');
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  app.delete('/repairs/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (num(existing.amountPaid) > 0) throw badRequest('Impossible de supprimer une réparation déjà payée');
    await prisma.$transaction(async (tx) => {
      for (const e of existing.expenses) await undoExpense(tx, existing, e.id, req.auth.userId, 'Pièce remise en stock (réparation supprimée)');
      await tx.repair.delete({ where: { id: existing.id } });
      await syncUnitRepairCost(tx, existing.soldUnitId);
    });
    return ok({ deleted: true });
  });

  /**
   * Costs: `part` (bought for this job), `stock_part` (taken from inventory: stock decreases, cost = product cost
   * price × quantity), `labor` (technician / external service, optionally linked to a repairer), `other`.
   * `paidFromDrawer` takes the amount out of the cash drawer.
   */
  app.post('/repairs/:id/expenses', async (req: Req<z.infer<typeof expenseSchema>, unknown, { id: string }>, reply) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (existing.status === 'cancelled' || existing.status === 'delivered') throw badRequest('Réparation clôturée');
    const body = expenseSchema.parse(req.body);
    await prisma.$transaction(async (tx) => {
      let data: Prisma.RepairExpenseUncheckedCreateInput;
      if (body.type === 'stock_part') {
        if (!body.productId || !body.quantity) throw badRequest('Choisissez la pièce et la quantité');
        const product = await tx.product.findFirst({ where: { id: body.productId, tenantId: req.auth.tenantId } });
        if (!product) throw notFound('Product', body.productId);
        await moveStock(tx, {
          tenantId: req.auth.tenantId,
          productId: product.id,
          delta: -body.quantity,
          type: 'repair',
          reference: existing.repairNumber,
          notes: 'Pièce utilisée en réparation',
          storeId: existing.storeId,
          userId: req.auth.userId,
        });
        const unitCost = num(product.costPrice);
        data = {
          repairId: existing.id,
          tenantId: req.auth.tenantId,
          type: 'stock_part',
          description: body.description?.trim() || product.name,
          productId: product.id,
          quantity: body.quantity,
          unitCost,
          amount: r2(unitCost * body.quantity),
        };
      } else {
        if (!body.description?.trim()) throw badRequest('La description est obligatoire');
        if (body.amount === undefined) throw badRequest('Le montant est obligatoire');
        if (body.repairerId && !(await tx.repairer.findFirst({ where: { id: body.repairerId, tenantId: req.auth.tenantId } }))) throw notFound('Repairer', body.repairerId);
        data = {
          repairId: existing.id,
          tenantId: req.auth.tenantId,
          type: body.type,
          description: body.description.trim(),
          amount: body.amount,
          repairerId: body.type === 'labor' ? body.repairerId || existing.repairerId || null : null,
          paidFromDrawer: !!body.paidFromDrawer,
        };
        if (body.paidFromDrawer && body.amount > 0) {
          await moveCaisse(tx, {
            tenantId: req.auth.tenantId,
            storeId: existing.storeId,
            delta: -body.amount,
            type: 'cash_out',
            reason: `${body.type === 'labor' ? 'Main d’œuvre' : 'Achat pièce'} - ${existing.repairNumber}`,
            userId: req.auth.userId,
          });
        }
      }
      await tx.repairExpense.create({ data });
      await recomputeTotal(tx, existing.id);
    });
    reply.status(201);
    return ok({ repair: await one(req.auth.tenantId, existing.id) });
  });

  app.delete('/repairs/:id/expenses/:expenseId', async (req: Req<unknown, unknown, { id: string; expenseId: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (existing.status === 'cancelled' || existing.status === 'delivered') throw badRequest('Réparation clôturée');
    const expense = existing.expenses.find((e) => e.id === req.params.expenseId);
    if (!expense) throw notFound('Repair expense', req.params.expenseId);
    await prisma.$transaction(async (tx) => {
      await undoExpense(tx, existing, expense.id, req.auth.userId, 'Pièce retirée de la réparation');
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

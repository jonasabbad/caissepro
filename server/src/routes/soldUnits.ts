import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { num, r2, serialize, toJson } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { dateRange, pageMeta, pageParams, qBool, qStr } from '../lib/pagination.js';
import { resolveStoreId } from '../lib/tenant.js';
import { isAllowedImageUrl, removeUpload } from '../lib/uploads.js';
import { learnTac, lookupTac } from '../lib/tac.js';

const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function newUnitRef(tenantId: string) {
  for (;;) {
    let ref = '';
    for (let i = 0; i < 8; i++) ref += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
    if (!(await prisma.soldUnit.findFirst({ where: { tenantId, ref } }))) return ref;
  }
}

const PERSON_SELECT = { id: true, firstName: true, lastName: true, phone: true } as const;

/** Adds supplier / customer / reservation / trade-in party objects to units (no Prisma relations on SoldUnit). */
export async function withUnitRelations<T extends { supplierId: string | null; customerId: string | null; reservedByCustomerId: string | null; tradeInFromCustomerId: string | null }>(units: T[]) {
  const customerIds = [...new Set(units.flatMap((u) => [u.customerId, u.reservedByCustomerId, u.tradeInFromCustomerId]).filter(Boolean))] as string[];
  const supplierIds = [...new Set(units.map((u) => u.supplierId).filter(Boolean))] as string[];
  const [customers, suppliers] = await Promise.all([
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: PERSON_SELECT }) : [],
    supplierIds.length ? prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, phone: true } }) : [],
  ]);
  const c = new Map(customers.map((x) => [x.id, x]));
  const s = new Map(suppliers.map((x) => [x.id, x]));
  return units.map((u) => ({
    ...u,
    product: null,
    supplier: u.supplierId ? (s.get(u.supplierId) ?? null) : null,
    customer: u.customerId ? (c.get(u.customerId) ?? null) : null,
    reservedByCustomer: u.reservedByCustomerId ? (c.get(u.reservedByCustomerId) ?? null) : null,
    tradeInFromCustomer: u.tradeInFromCustomerId ? (c.get(u.tradeInFromCustomerId) ?? null) : null,
  }));
}

/** Every search word must match one of brand / model / IMEI / serial / ref. */
function searchWhere(query?: string): Prisma.SoldUnitWhereInput {
  const terms = (query ?? '').trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return {};
  return {
    AND: terms.map((t) => ({
      OR: [
        { brand: { contains: t } },
        { model: { contains: t } },
        { imei: { contains: t } },
        { serialNumber: { contains: t } },
        { ref: { contains: t } },
      ],
    })),
  };
}

const unitSchema = z.object({
  deviceType: z.enum(['phone', 'tablet', 'laptop', 'macbook', 'watch']).default('phone'),
  brand: z.string().trim().min(1, 'La marque est obligatoire'),
  model: z.string().trim().min(1, 'Le modèle est obligatoire'),
  storage: z.string().trim().optional().nullable(),
  ram: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  condition: z.string().default('new'),
  imei: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  batteryHealth: z.coerce.number().int().min(0).max(100).optional().nullable(),
  chargeCycles: z.coerce.number().int().min(0).optional().nullable(),
  purchasePrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  hasWarranty: z.boolean().optional(),
  warrantyDays: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
  accessories: z.array(z.string()).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  supplierId: z.string().optional().nullable(),
  supplierOrderId: z.string().optional().nullable(),
});
type UnitInput = z.infer<typeof unitSchema>;

/** A device photo must be an image uploaded by this business (see /uploads). */
function checkImage(tenantId: string, url: string | null | undefined) {
  if (url && !isAllowedImageUrl(tenantId, url)) throw badRequest('URL d’image invalide');
}

async function assertUniqueImei(tenantId: string, imei: string | null | undefined, exceptId?: string) {
  if (!imei) return;
  const clash = await prisma.soldUnit.findFirst({ where: { tenantId, imei, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw conflict(`Device with IMEI ${imei} already exists`);
}

export async function createUnit(
  tx: Prisma.TransactionClient,
  ctx: { tenantId: string; userId: string; storeId: string | null },
  input: UnitInput,
  extra: Partial<Prisma.SoldUnitUncheckedCreateInput> = {},
) {
  const unit = await tx.soldUnit.create({
    data: {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      ref: await newUnitRef(ctx.tenantId),
      deviceType: input.deviceType,
      brand: input.brand,
      model: input.model,
      storage: input.storage || null,
      ram: input.ram || null,
      color: input.color || null,
      condition: input.condition,
      imei: input.imei || null,
      serialNumber: input.serialNumber || null,
      batteryHealth: input.batteryHealth ?? null,
      chargeCycles: input.chargeCycles ?? null,
      purchasePrice: r2(input.purchasePrice),
      salePrice: r2(input.salePrice),
      profit: r2(input.salePrice - input.purchasePrice),
      hasWarranty: input.hasWarranty ?? true,
      warrantyDays: input.warrantyDays ?? null,
      notes: input.notes || null,
      accessories: toJson(input.accessories),
      imageUrl: input.imageUrl || null,
      supplierId: input.supplierId || null,
      supplierOrderId: input.supplierOrderId || null,
      createdBy: ctx.userId,
      ...extra,
    },
  });
  // Remembers this TAC → brand / model for the next device with the same model (see lib/tac.ts).
  await learnTac(tx, ctx.tenantId, unit);
  return unit;
}

export default async function soldUnitRoutes(app: FastifyInstance) {
  authed(app);
  const base = '/phone-seller/sold-units';

  app.get(base, async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const p = pageParams(q, 20);
    // `inStock=true` (used by the repair form) is the same as `sold=false`.
    const sold = qBool(q.sold) ?? (qBool(q.inStock) === true ? false : undefined);
    const created = dateRange(q.startDate, q.endDate);
    const where: Prisma.SoldUnitWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.deviceType) ? { deviceType: q.deviceType } : {}),
      ...(qStr(q.brand) ? { brand: q.brand } : {}),
      ...(qStr(q.model) ? { model: q.model } : {}),
      ...(qStr(q.storage) ? { storage: q.storage } : {}),
      ...(qStr(q.condition) ? { condition: q.condition } : {}),
      ...(sold === undefined ? {} : sold ? { soldAt: { not: null } } : { soldAt: null }),
      ...(created ? { createdAt: created } : {}),
      ...searchWhere(q.query),
    };
    const [total, units] = await Promise.all([
      prisma.soldUnit.count({ where }),
      prisma.soldUnit.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    return ok({ units: serialize(await withUnitRelations(units)), meta: pageMeta(total, p) });
  });

  app.get(`${base}/filter-options`, async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const where: Prisma.SoldUnitWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.deviceType) ? { deviceType: q.deviceType } : {}),
      ...(qStr(q.brand) ? { brand: q.brand } : {}),
    };
    const rows = await prisma.soldUnit.findMany({ where, select: { model: true, storage: true } });
    const models = [...new Set(rows.map((r) => r.model))].sort();
    const storage = [
      ...new Set(rows.filter((r) => !qStr(q.model) || r.model === q.model).map((r) => r.storage).filter(Boolean)),
    ] as string[];
    return ok({ models, storage });
  });

  app.get(`${base}/inventory`, async (req) => {
    const units = await prisma.soldUnit.findMany({ where: { tenantId: req.auth.tenantId, soldAt: null }, orderBy: { createdAt: 'desc' } });
    return ok({ units: serialize(await withUnitRelations(units)) });
  });

  app.get(`${base}/reserved`, async (req) => {
    const units = await prisma.soldUnit.findMany({
      where: { tenantId: req.auth.tenantId, soldAt: null, reservedAt: { not: null } },
      orderBy: { reservedAt: 'desc' },
    });
    return ok({ units: serialize(await withUnitRelations(units)), count: units.length });
  });

  app.get(`${base}/sold`, async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const p = pageParams(q, 50);
    const where: Prisma.SoldUnitWhereInput = {
      tenantId: req.auth.tenantId,
      soldAt: { not: null },
      ...(qStr(q.brand) ? { brand: q.brand } : {}),
      ...(qStr(q.condition) ? { condition: q.condition } : {}),
      ...searchWhere(q.query),
    };
    const [total, units] = await Promise.all([
      prisma.soldUnit.count({ where }),
      prisma.soldUnit.findMany({ where, orderBy: { soldAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    // What the customer actually paid for each phone (default refund amount in POS return mode).
    const lines = await prisma.transactionItem.findMany({
      where: { soldUnitId: { in: units.map((u) => u.id) }, transaction: { type: { not: 'return' } } },
      orderBy: { transaction: { createdAt: 'desc' } },
    });
    const paid = new Map<string, number>();
    for (const l of lines) if (l.soldUnitId && !paid.has(l.soldUnitId)) paid.set(l.soldUnitId, num(l.totalPrice));
    const rows = (await withUnitRelations(units)).map((u) => ({ ...u, paidAmount: (paid.get(u.id) ?? num(u.salePrice)).toFixed(2) }));
    return ok({ units: serialize(rows), meta: pageMeta(total, p) });
  });

  /** Completes a reservation whose balance has been paid: the phone is handed over. */
  app.post(`${base}/:id/complete-reservation`, async (req: Req<unknown, unknown, { id: string }>) => {
    const unit = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!unit) throw notFound('Sold unit', req.params.id);
    if (!unit.reservedAt || !unit.reservationTransactionId) throw badRequest("Cet appareil n'est pas réservé");
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id: unit.reservationTransactionId } });
    if (num(t.amountRemaining) > 0) throw badRequest(`Reste à payer sur la réservation : ${num(t.amountRemaining).toFixed(2)} DH`);
    const updated = await prisma.soldUnit.update({
      where: { id: unit.id },
      data: {
        soldAt: new Date(),
        transactionId: t.id,
        customerId: unit.reservedByCustomerId,
        reservedAt: null,
        reservedByCustomerId: null,
        reservationDeposit: null,
        reservationTransactionId: null,
      },
    });
    return ok({ unit: serialize(updated) });
  });

  /**
   * Device identification from a TAC (first 8 IMEI digits; the full IMEI is never sent here). Answers from this
   * business's own devices first, then imported reference TAC data. found: false = fill in by hand.
   */
  app.get(`${base}/tac/:tac`, async (req: Req<unknown, unknown, { tac: string }>) => {
    if (!/^\d{8}$/.test(req.params.tac)) throw badRequest('TAC invalide');
    const device = await lookupTac(req.auth.tenantId, req.params.tac);
    return ok({ found: !!device, device });
  });

  app.get(`${base}/available`, async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const units = await prisma.soldUnit.findMany({
      where: {
        tenantId: req.auth.tenantId,
        soldAt: null,
        ...(qStr(q.brand) ? { brand: q.brand } : {}),
        ...(qStr(q.model) ? { model: q.model } : {}),
        ...(qStr(q.storage) ? { storage: q.storage } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return ok({ units: serialize(await withUnitRelations(units)) });
  });

  app.get(`${base}/:id`, async (req: Req<unknown, unknown, { id: string }>) => {
    const unit = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!unit) throw notFound('Sold unit', req.params.id);
    const [full] = await withUnitRelations([unit]);
    return ok({ unit: serialize(full) });
  });

  app.post(base, async (req: Req<UnitInput>, reply) => {
    const input = unitSchema.parse(req.body);
    checkImage(req.auth.tenantId, input.imageUrl);
    await assertUniqueImei(req.auth.tenantId, input.imei);
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const unit = await prisma.$transaction((tx) => createUnit(tx, { tenantId: req.auth.tenantId, userId: req.auth.userId, storeId }, input));
    reply.status(201);
    return ok({ unit: serialize(unit) });
  });

  app.put(`${base}/:id`, async (req: Req<Partial<UnitInput>, unknown, { id: string }>) => {
    const existing = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Sold unit', req.params.id);
    const input = unitSchema.partial().parse(req.body);
    checkImage(req.auth.tenantId, input.imageUrl);
    await assertUniqueImei(req.auth.tenantId, input.imei, existing.id);
    const purchase = input.purchasePrice ?? num(existing.purchasePrice);
    const sale = input.salePrice ?? num(existing.salePrice);
    const data: Prisma.SoldUnitUpdateInput = {
      ...(input.deviceType !== undefined && { deviceType: input.deviceType }),
      ...(input.brand !== undefined && { brand: input.brand }),
      ...(input.model !== undefined && { model: input.model }),
      ...(input.storage !== undefined && { storage: input.storage || null }),
      ...(input.ram !== undefined && { ram: input.ram || null }),
      ...(input.color !== undefined && { color: input.color || null }),
      ...(input.condition !== undefined && { condition: input.condition }),
      ...(input.imei !== undefined && { imei: input.imei || null }),
      ...(input.serialNumber !== undefined && { serialNumber: input.serialNumber || null }),
      ...(input.batteryHealth !== undefined && { batteryHealth: input.batteryHealth }),
      ...(input.chargeCycles !== undefined && { chargeCycles: input.chargeCycles }),
      ...(input.hasWarranty !== undefined && { hasWarranty: input.hasWarranty }),
      ...(input.warrantyDays !== undefined && { warrantyDays: input.warrantyDays }),
      ...(input.notes !== undefined && { notes: input.notes || null }),
      ...(input.accessories !== undefined && { accessories: toJson(input.accessories) }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl || null }),
      ...(input.supplierId !== undefined && { supplierId: input.supplierId || null }),
      purchasePrice: r2(purchase),
      salePrice: r2(sale),
      profit: r2(sale - purchase - num(existing.repairCost)),
    };
    const unit = await prisma.$transaction(async (tx) => {
      const u = await tx.soldUnit.update({ where: { id: existing.id }, data });
      if (input.imei !== undefined || input.brand !== undefined || input.model !== undefined) await learnTac(tx, req.auth.tenantId, u);
      return u;
    });
    // A replaced or removed photo is deleted from storage.
    if (input.imageUrl !== undefined && (input.imageUrl || null) !== existing.imageUrl) await removeUpload(req.auth.tenantId, existing.imageUrl);
    const [full] = await withUnitRelations([unit]);
    return ok({ unit: serialize(full) });
  });

  app.delete(`${base}/:id`, async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Sold unit', req.params.id);
    if (existing.soldAt) throw badRequest('Impossible de supprimer un appareil déjà vendu');
    await prisma.soldUnit.delete({ where: { id: existing.id } });
    await removeUpload(req.auth.tenantId, existing.imageUrl);
    return ok({ deleted: true });
  });

  app.post(`${base}/:id/mark-sold`, async (req: Req<{ transactionId?: string; customerId?: string }, unknown, { id: string }>) => {
    const existing = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Sold unit', req.params.id);
    if (existing.soldAt) throw badRequest('Cet appareil est déjà vendu');
    const unit = await prisma.soldUnit.update({
      where: { id: existing.id },
      data: {
        soldAt: new Date(),
        transactionId: req.body?.transactionId ?? null,
        customerId: req.body?.customerId ?? null,
        warrantyExpiresAt: existing.hasWarranty && existing.warrantyDays ? new Date(Date.now() + existing.warrantyDays * 86400_000) : null,
      },
    });
    return ok({ unit: serialize(unit) });
  });

  app.post(`${base}/:id/mark-returned`, async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.soldUnit.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Sold unit', req.params.id);
    const unit = await prisma.soldUnit.update({
      where: { id: existing.id },
      data: { soldAt: null, returnedAt: new Date(), transactionId: null, customerId: null, warrantyExpiresAt: null },
    });
    return ok({ unit: serialize(unit) });
  });
}

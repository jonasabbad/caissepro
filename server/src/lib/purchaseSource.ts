import type { SoldUnit } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Prisma } from './prisma.js';
import { badRequest } from './errors.js';

/**
 * Where a phone or device was bought. None of it is required to add stock:
 * - supplier: an existing supplier, optionally an existing (submitted / received) order of theirs. A linked order gives
 *   the supplier, the purchase date and the order's single purchase invoice; the device keeps its own cost and the
 *   order / invoice are never changed or created from here.
 * - other: bought elsewhere (a person, a shop…): its cost and an optional description.
 * - unknown: not recorded — no supplier, order, date or cost is stored or shown.
 */
export const PURCHASE_SOURCES = ['supplier', 'other', 'unknown'] as const;
export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];

export const purchaseFields = {
  purchaseSource: z.enum(PURCHASE_SOURCES).optional(),
  purchaseNote: z.string().trim().max(191, 'Description trop longue (191 caractères max.)').optional().nullable(),
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Date d’achat invalide')
    .optional()
    .nullable(),
};

type PurchaseInput = {
  purchaseSource?: PurchaseSource;
  purchaseNote?: string | null;
  purchasedAt?: string | null;
  supplierId?: string | null;
  supplierOrderId?: string | null;
  purchasePrice?: number;
};

/** Source shown for a device; devices added before the source was recorded get it from what they hold. */
export function sourceOf(u: Pick<SoldUnit, 'purchaseSource' | 'supplierId' | 'supplierOrderId' | 'tradeInAt' | 'purchasePrice'>): PurchaseSource | 'trade_in' {
  if (u.tradeInAt) return 'trade_in';
  if (u.purchaseSource) return u.purchaseSource as PurchaseSource;
  if (u.supplierOrderId || u.supplierId) return 'supplier';
  return Number(u.purchasePrice) > 0 ? 'other' : 'unknown';
}

/** A device received with its order (listed in the order's units) keeps that order: it is its purchase record. */
async function receivedWithOrder(unit: Pick<SoldUnit, 'id' | 'supplierOrderId'>) {
  if (!unit.supplierOrderId) return false;
  return !!(await prisma.supplierOrderItem.findFirst({ where: { supplierOrderId: unit.supplierOrderId, unitDetails: { contains: unit.id } }, select: { id: true } }));
}

/**
 * Checks the purchase part of a device form and returns the columns to store. Without `purchaseSource` (older
 * clients) only the supplier / order links are checked and kept as sent.
 */
export async function resolvePurchase(
  tenantId: string,
  input: PurchaseInput,
  existing?: Pick<SoldUnit, 'id' | 'supplierOrderId' | 'supplierId'>,
): Promise<Partial<Prisma.SoldUnitUncheckedCreateInput>> {
  const touchesLinks = input.purchaseSource !== undefined || input.supplierId !== undefined || input.supplierOrderId !== undefined;
  if (existing && touchesLinks && (await receivedWithOrder(existing))) {
    const sameOrder = (input.supplierOrderId ?? existing.supplierOrderId) === existing.supplierOrderId;
    const stillSupplier = input.purchaseSource === undefined || input.purchaseSource === 'supplier';
    if (!sameOrder || !stillSupplier) throw badRequest('Cet appareil a été reçu avec sa commande fournisseur : son origine ne peut pas être changée');
    return {}; // nothing to change: its order holds its purchase
  }

  const source = input.purchaseSource;
  let supplierId = input.supplierId || null;
  const supplierOrderId = input.supplierOrderId || null;

  if (supplierOrderId && source !== 'other' && source !== 'unknown') {
    const order = await prisma.supplierOrder.findFirst({ where: { id: supplierOrderId, tenantId }, select: { supplierId: true, status: true } });
    if (!order) throw badRequest('Commande fournisseur introuvable');
    if (order.status === 'draft' || order.status === 'cancelled') throw badRequest('Cette commande fournisseur ne peut pas être liée (brouillon ou annulée)');
    if (supplierId && supplierId !== order.supplierId) throw badRequest('Cette commande n’est pas de ce fournisseur');
    supplierId = order.supplierId;
  }
  if (supplierId && source !== 'other' && source !== 'unknown') {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
    if (!supplier) throw badRequest('Fournisseur introuvable');
  }

  const date = input.purchasedAt ? new Date(`${input.purchasedAt.slice(0, 10)}T12:00:00.000Z`) : null;
  if (date && (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86400_000)) throw badRequest('Date d’achat invalide');

  if (source === undefined) {
    return {
      ...(input.supplierId !== undefined || supplierOrderId ? { supplierId } : {}),
      ...(input.supplierOrderId !== undefined ? { supplierOrderId } : {}),
    };
  }
  if (source === 'supplier') {
    if (!supplierId) throw badRequest('Choisissez le fournisseur');
    // A linked order gives its own date; otherwise the date entered, if any.
    return { purchaseSource: source, supplierId, supplierOrderId, purchaseNote: null, purchasedAt: supplierOrderId ? null : date };
  }
  if (source === 'other') {
    return { purchaseSource: source, supplierId: null, supplierOrderId: null, purchaseNote: input.purchaseNote || null, purchasedAt: date };
  }
  return { purchaseSource: source, supplierId: null, supplierOrderId: null, purchaseNote: null, purchasedAt: null, purchasePrice: 0 };
}

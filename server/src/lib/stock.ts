import type { Tx } from './prisma.js';
import { badRequest, notFound } from './errors.js';

/** available → low_stock (≤ minimum) → out_of_stock (0). Archived products keep their status. */
export function stockStatus(stock: number, minStockLevel: number, current?: string) {
  if (current === 'archived') return 'archived';
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minStockLevel) return 'low_stock';
  return 'available';
}

export interface MovementInput {
  tenantId: string;
  productId: string;
  delta: number;
  type: string;
  reference?: string | null;
  notes?: string | null;
  storeId?: string | null;
  userId?: string | null;
  /** Allow the stock to go below zero (never used by the UI flows; returns of untracked stock). */
  allowNegative?: boolean;
}

/**
 * Applies a stock change and records the inventory movement atomically.
 * Every stock change in the app goes through here so movements always reconcile with stock levels.
 */
export async function moveStock(tx: Tx, m: MovementInput) {
  const product = await tx.product.findFirst({ where: { id: m.productId, tenantId: m.tenantId } });
  if (!product) throw notFound('Product', m.productId);
  const previous = product.stockQuantity;
  const next = previous + m.delta;
  if (next < 0 && !m.allowNegative) {
    throw badRequest(`Stock insuffisant pour « ${product.name} » (disponible : ${previous})`);
  }
  const updated = await tx.product.update({
    where: { id: product.id },
    data: { stockQuantity: next, status: stockStatus(next, product.minStockLevel, product.status) },
  });
  await tx.inventoryMovement.create({
    data: {
      tenantId: m.tenantId,
      productId: product.id,
      storeId: m.storeId ?? product.storeId,
      type: m.type,
      quantity: m.delta,
      previousQuantity: previous,
      newQuantity: next,
      reference: m.reference ?? null,
      notes: m.notes ?? null,
      createdBy: m.userId ?? null,
    },
  });
  return updated;
}

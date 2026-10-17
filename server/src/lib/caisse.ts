import type { Tx } from './prisma.js';
import { num, r2 } from './serialize.js';

export type CaisseType = 'cash_in' | 'cash_out' | 'sale' | 'return_refund' | 'reservation_refund' | 'adjustment';
/** Types that put money into the drawer; every other type (except adjustments, which are signed) takes it out. */
export const INFLOW_TYPES: CaisseType[] = ['cash_in', 'sale'];

/**
 * Cash drawer ledger. Every cash movement (cash sale, refund, debt payment, supplier payment, manual cash in/out,
 * count adjustment) updates the store's caisseBalance and appends a CaisseMovement row.
 * `delta` is the signed change of the balance; the row stores a positive amount except for adjustments.
 */
export async function moveCaisse(
  tx: Tx,
  m: {
    tenantId: string;
    storeId: string | null;
    delta: number;
    type: CaisseType;
    reason?: string | null;
    transactionId?: string | null;
    transactionNumber?: string | null;
    userId?: string | null;
  },
) {
  if (!m.storeId || !m.delta) return null;
  const store = await tx.store.findUnique({ where: { id: m.storeId } });
  if (!store) return null;
  const before = num(store.caisseBalance);
  const after = r2(before + m.delta);
  await tx.store.update({ where: { id: store.id }, data: { caisseBalance: after } });
  return tx.caisseMovement.create({
    data: {
      tenantId: m.tenantId,
      storeId: store.id,
      type: m.type,
      amount: m.type === 'adjustment' ? r2(m.delta) : r2(Math.abs(m.delta)),
      balanceBefore: before,
      balanceAfter: after,
      reason: m.reason ?? null,
      transactionId: m.transactionId ?? null,
      transactionNumber: m.transactionNumber ?? null,
      createdBy: m.userId ?? null,
    },
  });
}

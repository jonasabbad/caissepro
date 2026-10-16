import type { Tx } from './prisma.js';
import { num, r2 } from './serialize.js';

/**
 * Cash drawer ledger. Every cash movement (cash sale, refund, debt payment, manual cash in/out)
 * updates the store's caisseBalance and appends a CaisseMovement row.
 */
export async function moveCaisse(
  tx: Tx,
  m: { tenantId: string; storeId: string | null; amount: number; type: string; reference?: string | null; description?: string | null; userId?: string | null },
) {
  if (!m.storeId || !m.amount) return null;
  const store = await tx.store.findUnique({ where: { id: m.storeId } });
  if (!store) return null;
  const before = num(store.caisseBalance);
  const after = r2(before + m.amount);
  await tx.store.update({ where: { id: store.id }, data: { caisseBalance: after } });
  return tx.caisseMovement.create({
    data: {
      tenantId: m.tenantId,
      storeId: store.id,
      type: m.type,
      amount: r2(m.amount),
      balanceBefore: before,
      balanceAfter: after,
      reference: m.reference ?? null,
      description: m.description ?? null,
      createdBy: m.userId ?? null,
    },
  });
}

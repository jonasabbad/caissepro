import { prisma, type Tx } from './prisma.js';
import { num, parseJson, r2 } from './serialize.js';

/**
 * Money of a supplier order: what it costs, what was paid, what is left, and the payment history.
 *
 * One supplier order = one purchase invoice. Until that invoice is confirmed the order carries its own payments; from
 * confirmation on, the invoice carries them (the order's earlier payments are moved onto it, see carryOrderPayments),
 * and the order shows the invoice's figures. Either way there is a single amount left to pay, paid from the order
 * page or the invoice page alike.
 */
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface OrderPaymentEntry {
  id: string;
  amount: number;
  createdAt: string;
  method: string;
  note: string | null;
  userName: string | null;
  voided: boolean;
}

interface JsonPayment {
  id: string;
  amount: number;
  note?: string;
  userName?: string;
  createdAt: string;
}

/**
 * Locks a supplier order (or invoice) row until the transaction ends. Must be the transaction's first statement: the
 * locking read waits for any other transaction holding the row, then everything read after it is current, so two
 * payments (or two "create the invoice" clicks) at the same moment are applied one after the other.
 */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM \`SupplierOrder\` WHERE id = ${orderId} FOR UPDATE`;
}
export async function lockInvoice(tx: Tx, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM \`SupplierInvoice\` WHERE id = ${invoiceId} FOR UPDATE`;
}

export const paymentStatusOf =(paid: number, remaining: number): PaymentStatus => (remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');

/** The order's invoice, when not cancelled (draft or confirmed), with its payments. */
type OrderInvoice = Awaited<ReturnType<typeof orderInvoices>> extends Map<string, infer V> ? V : never;

export async function orderInvoices(tenantId: string, orderIds: string[], db: Tx | typeof prisma = prisma) {
  const rows = orderIds.length
    ? await db.supplierInvoice.findMany({
        where: { tenantId, supplierOrderId: { in: orderIds }, status: { not: 'cancelled' } },
        select: { id: true, number: true, status: true, total: true, amountPaid: true, supplierOrderId: true, payments: { orderBy: { paidAt: 'asc' } } },
      })
    : [];
  return new Map(rows.map((r) => [r.supplierOrderId!, r]));
}

export function orderMoney(order: { totalAmount: unknown; amountPaid: unknown; amountRemaining: unknown; payments: string; status: string }, inv: OrderInvoice | undefined) {
  if (inv && inv.status === 'confirmed') {
    const total = r2(num(inv.total));
    const paid = r2(num(inv.amountPaid));
    const remaining = r2(Math.max(0, total - paid));
    return {
      // Same format as every amount the API returns ("120.00").
      totalAmount: total.toFixed(2),
      amountPaid: paid.toFixed(2),
      amountRemaining: remaining.toFixed(2),
      paymentStatus: paymentStatusOf(paid, remaining),
      paidOn: 'invoice' as const,
      payments: inv.payments.map<OrderPaymentEntry>((p) => ({
        id: p.id,
        amount: r2(num(p.amount)),
        createdAt: p.paidAt.toISOString(),
        method: p.method,
        note: p.notes || p.reference || null,
        userName: null,
        voided: !!p.voidedAt,
      })),
    };
  }
  const total = r2(num(order.totalAmount));
  const paid = r2(num(order.amountPaid));
  const remaining = r2(num(order.amountRemaining));
  return {
    totalAmount: total.toFixed(2),
    amountPaid: paid.toFixed(2),
    amountRemaining: remaining.toFixed(2),
    paymentStatus: paymentStatusOf(paid, remaining),
    paidOn: 'order' as const,
    payments: parseJson<JsonPayment[]>(order.payments, []).map<OrderPaymentEntry>((p) => ({
      id: p.id,
      amount: r2(num(p.amount)),
      createdAt: p.createdAt,
      method: 'cash',
      note: p.note ?? null,
      userName: p.userName ?? null,
      voided: false,
    })),
  };
}

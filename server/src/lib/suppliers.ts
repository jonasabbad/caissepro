import { prisma } from './prisma.js';
import { num, parseJson, r2 } from './serialize.js';

/**
 * What the business owes its suppliers. Two kinds of purchase documents carry a debt:
 * - confirmed supplier invoices: total − non-voided payments;
 * - submitted purchase orders that have no (non-cancelled) invoice: once an order is invoiced, its debt and its
 *   payments move to the invoice, so the same purchase is never counted twice.
 * Draft and cancelled documents owe nothing.
 */

export interface SupplierBalance {
  invoiceCount: number;
  orderCount: number;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  overdueCount: number;
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function invoiceState(inv: { status: string; total: unknown; amountPaid: unknown; dueDate: Date | null }) {
  const total = num(inv.total);
  const paid = num(inv.amountPaid);
  const remaining = r2(Math.max(0, total - paid));
  const paymentStatus = remaining <= 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  const overdue = inv.status === 'confirmed' && remaining > 0 && !!inv.dueDate && inv.dueDate < startOfToday();
  return { remaining, paymentStatus, overdue };
}

/** Purchase orders whose debt has moved to an invoice. */
export async function invoicedOrderIds(tenantId: string) {
  const rows = await prisma.supplierInvoice.findMany({
    where: { tenantId, status: { not: 'cancelled' }, supplierOrderId: { not: null } },
    select: { supplierOrderId: true },
  });
  return new Set(rows.map((r) => r.supplierOrderId!));
}

export async function supplierBalances(tenantId: string, ids: string[]) {
  const [invoices, orders, invoiced] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { tenantId, supplierId: { in: ids }, status: 'confirmed' },
      select: { supplierId: true, status: true, total: true, amountPaid: true, dueDate: true },
    }),
    prisma.supplierOrder.findMany({
      where: { tenantId, supplierId: { in: ids }, status: { notIn: ['draft', 'cancelled'] } },
      select: { id: true, supplierId: true, totalAmount: true, amountPaid: true, amountRemaining: true },
    }),
    invoicedOrderIds(tenantId),
  ]);
  const out = new Map<string, SupplierBalance>();
  for (const id of ids) out.set(id, { invoiceCount: 0, orderCount: 0, totalPurchases: 0, totalPaid: 0, outstanding: 0, overdue: 0, overdueCount: 0 });
  for (const inv of invoices) {
    const b = out.get(inv.supplierId)!;
    const st = invoiceState(inv);
    b.invoiceCount++;
    b.totalPurchases += num(inv.total);
    b.totalPaid += num(inv.amountPaid);
    b.outstanding += st.remaining;
    if (st.overdue) (b.overdue += st.remaining), b.overdueCount++;
  }
  for (const o of orders) {
    if (invoiced.has(o.id)) continue;
    const b = out.get(o.supplierId)!;
    b.orderCount++;
    b.totalPurchases += num(o.totalAmount);
    b.totalPaid += num(o.amountPaid);
    b.outstanding += num(o.amountRemaining);
  }
  for (const b of out.values()) for (const k of ['totalPurchases', 'totalPaid', 'outstanding', 'overdue'] as const) b[k] = r2(b[k]);
  return out;
}

export interface StatementEntry {
  date: string;
  kind: 'invoice' | 'order' | 'payment' | 'order_payment';
  reference: string;
  documentId: string;
  supplierRef?: string | null;
  method?: string | null;
  paymentReference?: string | null;
  dueDate?: string | null;
  overdue?: boolean;
  remaining?: number;
  debit: number; // purchase (increases what is owed)
  credit: number; // payment (decreases it)
  balance: number; // running amount owed after this line
}

/**
 * Account statement: every purchase (invoice / non-invoiced order) and every payment, oldest first, with a running
 * balance. Lines before `from` are summed into the opening balance.
 */
export async function supplierStatement(tenantId: string, supplierId: string, from?: Date, to?: Date) {
  const [invoices, orders, invoiced] = await Promise.all([
    prisma.supplierInvoice.findMany({
      where: { tenantId, supplierId, status: 'confirmed' },
      include: { payments: { where: { voidedAt: null } } },
    }),
    prisma.supplierOrder.findMany({ where: { tenantId, supplierId, status: { notIn: ['draft', 'cancelled'] } } }),
    invoicedOrderIds(tenantId),
  ]);
  const lines: Omit<StatementEntry, 'balance'>[] = [];
  const overdueInvoices = [];
  for (const inv of invoices) {
    const st = invoiceState(inv);
    lines.push({
      date: inv.invoiceDate.toISOString(),
      kind: 'invoice',
      reference: inv.number,
      documentId: inv.id,
      supplierRef: inv.supplierRef,
      dueDate: inv.dueDate?.toISOString() ?? null,
      overdue: st.overdue,
      remaining: st.remaining,
      debit: num(inv.total),
      credit: 0,
    });
    if (st.overdue) overdueInvoices.push({ id: inv.id, number: inv.number, dueDate: inv.dueDate!.toISOString(), remaining: st.remaining });
    for (const p of inv.payments) {
      lines.push({ date: p.paidAt.toISOString(), kind: 'payment', reference: inv.number, documentId: inv.id, method: p.method, paymentReference: p.reference, debit: 0, credit: num(p.amount) });
    }
  }
  for (const o of orders) {
    if (invoiced.has(o.id)) continue;
    lines.push({ date: o.orderedAt.toISOString(), kind: 'order', reference: o.orderNumber, documentId: o.id, debit: num(o.totalAmount), credit: 0, remaining: num(o.amountRemaining) });
    for (const p of parseJson<{ amount: number; createdAt: string; note?: string }[]>(o.payments, [])) {
      lines.push({ date: p.createdAt, kind: 'order_payment', reference: o.orderNumber, documentId: o.id, method: 'cash', paymentReference: p.note ?? null, debit: 0, credit: num(p.amount) });
    }
  }
  // By day; on the same day purchases come before payments, then by time.
  lines.sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || b.debit - a.debit || a.date.localeCompare(b.date));
  let balance = 0;
  let opening = 0;
  const entries: StatementEntry[] = [];
  for (const l of lines) {
    balance = r2(balance + l.debit - l.credit);
    const d = new Date(l.date);
    if (from && d < from) opening = balance;
    else if (!to || d <= to) entries.push({ ...l, balance });
  }
  const inRange = (k: 'debit' | 'credit') => r2(entries.reduce((s, e) => s + e[k], 0));
  return {
    openingBalance: opening,
    entries,
    period: { purchases: inRange('debit'), payments: inRange('credit'), closingBalance: entries.length ? entries.at(-1)!.balance : opening },
    totals: {
      purchases: r2(lines.reduce((s, l) => s + l.debit, 0)),
      paid: r2(lines.reduce((s, l) => s + l.credit, 0)),
      outstanding: balance,
      overdue: r2(overdueInvoices.reduce((s, i) => s + i.remaining, 0)),
    },
    overdueInvoices: overdueInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}

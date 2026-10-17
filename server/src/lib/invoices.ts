import { randomUUID } from 'node:crypto';
import { prisma, type Tx } from './prisma.js';
import { num, parseJson, r2 } from './serialize.js';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoiceNumbering {
  invoicePrefix: string;
  invoiceYearFormat: string; // YYYY | YY | '' (no year)
  invoiceSeparator: string;
  invoiceDigits: number;
  nextInvoiceNumber: number;
}

/** Auto-entrepreneur flat income tax on turnover; 0.5 % is the rate for trade (commerce) activities. */
export const DEFAULT_IR_FLAT_RATE = 0.5;

export function numbering(businessInfo: string | null | undefined): InvoiceNumbering {
  const b = parseJson<Partial<InvoiceNumbering>>(businessInfo, {});
  return {
    invoicePrefix: b.invoicePrefix || 'FAC',
    invoiceYearFormat: b.invoiceYearFormat ?? 'YYYY',
    invoiceSeparator: b.invoiceSeparator ?? '-',
    invoiceDigits: Number(b.invoiceDigits) || 4,
    nextInvoiceNumber: Number(b.nextInvoiceNumber) || 1,
  };
}

/** FAC-2026-0001 with the default settings. */
export function formatInvoiceNumber(n: InvoiceNumbering, seq: number, date = new Date()) {
  const year = n.invoiceYearFormat === 'YY' ? String(date.getFullYear()).slice(-2) : n.invoiceYearFormat === 'YYYY' ? String(date.getFullYear()) : '';
  return [n.invoicePrefix, year, String(seq).padStart(n.invoiceDigits, '0')].filter(Boolean).join(n.invoiceSeparator);
}

/** Takes the next number from the tenant's sequence (skipping any already used) and advances it. */
export async function takeInvoiceNumber(tx: Tx, tenantId: string, date = new Date()) {
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const n = numbering(tenant.businessInfo);
  let seq = n.nextInvoiceNumber;
  let number = formatInvoiceNumber(n, seq, date);
  while (await tx.invoice.findFirst({ where: { tenantId, invoiceNumber: number }, select: { id: true } })) number = formatInvoiceNumber(n, ++seq, date);
  const info = parseJson<Record<string, unknown>>(tenant.businessInfo, {});
  await tx.tenant.update({ where: { id: tenantId }, data: { businessInfo: JSON.stringify({ ...info, nextInvoiceNumber: seq + 1 }) } });
  return number;
}

/** Shops with a declared legal status (or charging TVA) get an invoice for every sale. */
export const invoicingEnabled = (t: { legalStatus: string | null; applyTva: boolean }) => !!t.legalStatus || t.applyTva;

const INVOICED_TYPES = ['sale', 'credit', 'exchange'];

/**
 * Brings transaction invoices in line with the sales: creates the missing ones (oldest first, so numbers follow the
 * sales order) and drops non-archived invoices whose sale was cancelled. Deleting an invoice therefore "resets" it:
 * it is rebuilt from the current sale (e.g. after the customer was corrected) on the next read.
 */
export async function syncTransactionInvoices(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !invoicingEnabled(tenant)) return;
  await prisma.$transaction(async (tx) => {
    const invoiced = await tx.invoice.findMany({ where: { tenantId, type: 'transaction' }, select: { id: true, transactionId: true, isArchived: true } });
    const byTx = new Map(invoiced.map((i) => [i.transactionId, i]));
    const cancelled = await tx.transaction.findMany({
      where: { tenantId, status: 'cancelled', id: { in: invoiced.map((i) => i.transactionId).filter(Boolean) as string[] } },
      select: { id: true },
    });
    for (const c of cancelled) {
      const inv = byTx.get(c.id);
      if (inv && !inv.isArchived) await tx.invoice.delete({ where: { id: inv.id } });
    }
    const missing = await tx.transaction.findMany({
      where: { tenantId, type: { in: INVOICED_TYPES }, status: { not: 'cancelled' }, id: { notIn: [...byTx.keys()].filter(Boolean) as string[] } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of missing) {
      const customer = t.customerId ? await tx.customer.findUnique({ where: { id: t.customerId } }) : null;
      const items: InvoiceItem[] = t.items.map((i) => ({
        id: randomUUID(),
        description: i.productName,
        quantity: i.quantity,
        unitPrice: num(i.unitPrice),
        subtotal: num(i.totalPrice),
      }));
      await tx.invoice.create({
        data: {
          tenantId,
          storeId: t.storeId,
          invoiceNumber: await takeInvoiceNumber(tx, tenantId, t.createdAt),
          type: 'transaction',
          transactionId: t.id,
          customerId: customer?.id ?? null,
          customerName: customer ? `${customer.firstName} ${customer.lastName ?? ''}`.trim() : null,
          customerTaxId: customer?.ice || customer?.cin || null,
          customerAddress: customer?.address ?? null,
          items: JSON.stringify(items),
          subtotal: num(t.subtotal),
          discountAmount: Math.max(0, num(t.discountAmount)),
          taxRate: num(t.taxRate),
          taxAmount: num(t.taxAmount),
          totalAmount: num(t.totalAmount),
          date: t.createdAt,
          createdBy: t.cashierId,
        },
      });
    }
  });
}

/** Totals over non-archived invoices dated in [from, to]. HT = TTC − TVA. */
export async function invoiceTotals(tenantId: string, from: Date, to: Date) {
  const rows = await prisma.invoice.findMany({ where: { tenantId, isArchived: false, date: { gte: from, lte: to } } });
  const ttc = r2(rows.reduce((s, i) => s + num(i.totalAmount), 0));
  const tax = r2(rows.reduce((s, i) => s + num(i.taxAmount), 0));
  const byRate = new Map<number, { rate: number; sales: number; tax: number; count: number }>();
  for (const i of rows) {
    const rate = num(i.taxRate);
    const e = byRate.get(rate) ?? { rate, sales: 0, tax: 0, count: 0 };
    e.sales = r2(e.sales + num(i.totalAmount) - num(i.taxAmount));
    e.tax = r2(e.tax + num(i.taxAmount));
    e.count++;
    byRate.set(rate, e);
  }
  return { count: rows.length, ttc, tax, ht: r2(ttc - tax), breakdown: [...byRate.values()].sort((a, b) => b.tax - a.tax) };
}

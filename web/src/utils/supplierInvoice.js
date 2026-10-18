import { intlLocale } from '@/i18n';

/** One badge per invoice: draft / cancelled, else its payment state (overdue first). */
export function invoiceBadge(inv) {
  if (inv.status === 'draft') return { key: 'supplierInvoices.status.draft', cls: 'bg-gray-100 text-gray-700' };
  if (inv.status === 'cancelled') return { key: 'supplierInvoices.status.cancelled', cls: 'bg-gray-100 text-gray-400 line-through' };
  if (inv.overdue) return { key: 'supplierInvoices.paymentStatus.overdue', cls: 'bg-amber-100 text-amber-800' };
  if (inv.paymentStatus === 'paid') return { key: 'supplierInvoices.paymentStatus.paid', cls: 'bg-success-100 text-success-700' };
  if (inv.paymentStatus === 'partial') return { key: 'supplierInvoices.paymentStatus.partial', cls: 'bg-blue-100 text-blue-700' };
  return { key: 'supplierInvoices.paymentStatus.unpaid', cls: 'bg-danger-100 text-danger-700' };
}

export const shortDay = (d) => (d ? new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'check'];

export const daysLate = (due) => Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 86400000));

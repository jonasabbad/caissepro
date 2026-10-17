import { intlLocale, ltr } from '@/i18n';

/** 1234.5 -> "1 234,50 DH"; `sign` ('+', '-', '−') is prefixed inside the same left-to-right run. */
export function formatCurrency(value, currency = 'DH', sign = '') {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return formatCurrency(0, currency, sign);
  return ltr(sign + new Intl.NumberFormat(intlLocale(), { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ` ${currency}`);
}

export function formatDate(value, options = {}) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', ...options }).format(d);
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Round to cents. */
export const round2 = (n) => Math.round(n * 100) / 100;

/** YYYY-MM-DD in local time. */
export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const hasManagerRole = (roles) => (roles ?? []).some((r) => r === 'admin' || r === 'manager');

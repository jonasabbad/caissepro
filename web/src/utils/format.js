const LOCALES = { fr_MA: 'fr-MA', ar_MA: 'ar-MA' };

/** 1234.5 -> "1 234,50 DH" */
export function formatCurrency(value, currency = 'DH', locale = 'fr_MA') {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return `0,00 ${currency}`;
  return (
    new Intl.NumberFormat(LOCALES[locale], { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) +
    ` ${currency}`
  );
}

export function formatDate(value, locale = 'fr_MA', options = {}) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALES[locale], { dateStyle: 'medium', ...options }).format(d);
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Round to cents. */
export const round2 = (n) => Math.round(n * 100) / 100;

/** YYYY-MM-DD in local time. */
export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export const hasManagerRole = (roles) => (roles ?? []).some((r) => r === 'admin' || r === 'manager');

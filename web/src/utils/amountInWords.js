// i18n-scan: data — stored values or language-specific wording, translated elsewhere.
import { docLocale } from '@/i18n';

const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function below100(n) {
  if (n < 20) return UNITS[n];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  // 70-79 and 90-99 are built on 60 / 80 + 10..19 ("soixante-et-onze", "quatre-vingt-douze").
  if (tens === 7 || tens === 9) return TENS[tens] + (unit === 1 && tens === 7 ? '-et-' : '-') + UNITS[10 + unit];
  if (unit === 0) return TENS[tens] + (tens === 8 ? 's' : '');
  if (unit === 1 && tens !== 8) return `${TENS[tens]}-et-un`;
  return `${TENS[tens]}-${UNITS[unit]}`;
}

function below1000(n) {
  if (n < 100) return below100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let s = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent`;
  if (rest === 0 && hundreds > 1) s += 's';
  else if (rest > 0) s += ` ${below100(rest)}`;
  return s;
}

function integerWords(n) {
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    return (m === 1 ? 'un million' : `${integerWords(m)} millions`) + (rest ? ` ${integerWords(rest)}` : '');
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    return (k === 1 ? 'mille' : `${below1000(k)} mille`) + (rest ? ` ${below1000(rest)}` : '');
  }
  return below1000(n);
}

// ── English ──
const EN_UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const enBelow100 = (n) => (n < 20 ? EN_UNITS[n] : EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_UNITS[n % 10]}` : ''));
const enBelow1000 = (n) => (n < 100 ? enBelow100(n) : `${EN_UNITS[Math.floor(n / 100)]} hundred${n % 100 ? ` ${enBelow100(n % 100)}` : ''}`);
function enInteger(n) {
  if (n >= 1_000_000) return `${enInteger(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${enInteger(n % 1_000_000)}` : ''}`;
  if (n >= 1000) return `${enBelow1000(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${enBelow1000(n % 1000)}` : ''}`;
  return enBelow1000(n);
}
function amountInWordsEn(amount) {
  if (amount === 0) return 'zero dirhams';
  if (amount < 0) return `minus ${amountInWordsEn(-amount)}`;
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  let s = `${whole === 0 ? 'zero' : enInteger(whole)} dirham${whole === 1 ? '' : 's'}`;
  if (cents > 0) s += ` and ${enBelow100(cents)} centime${cents === 1 ? '' : 's'}`;
  return s;
}

/**
 * 1250.5 → "mille deux cent cinquante dirhams et cinquante centimes" (wording required on Moroccan invoices),
 * or "one thousand two hundred fifty dirhams and fifty centimes" when documents are in English.
 */
export function amountInWords(value, locale = docLocale()) {
  const amount = Number(value) || 0;
  if (locale === 'en') return amountInWordsEn(amount);
  if (amount === 0) return 'zéro dirhams';
  if (amount < 0) return `moins ${amountInWords(-amount, 'fr')}`;
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  let s = `${whole === 0 ? 'zéro' : integerWords(whole)} dirhams`;
  if (cents > 0) s += ` et ${below100(cents)} centimes`;
  return s;
}

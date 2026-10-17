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

/** 1250.5 → "mille deux cent cinquante dirhams et cinquante centimes" (wording required on Moroccan invoices). */
export function amountInWords(value) {
  const amount = Number(value) || 0;
  if (amount === 0) return 'zéro dirhams';
  if (amount < 0) return `moins ${amountInWords(-amount)}`;
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  let s = `${whole === 0 ? 'zéro' : integerWords(whole)} dirhams`;
  if (cents > 0) s += ` et ${below100(cents)} centimes`;
  return s;
}

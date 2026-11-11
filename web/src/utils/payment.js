/**
 * POS payment arithmetic, shared by the payment window and its tests. It never changes what is sold:
 *  - `due`      what the customer owes (cart total, minus trade-ins): the sale's total stays this amount;
 *  - received  the money actually handed over, by method;
 *  - change    received − due, given back in cash only (never recorded as revenue, never part of the total);
 *  - remaining due − received; a direct sale or trade-in cannot leave it unpaid unless it is given as a discount
 *              (explicit choice); a credit sale keeps it as customer debt; a reservation as the balance to pay.
 */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const CENT = 0.005;

/** Methods that can give change back. */
export const CHANGE_METHODS = ['cash'];

/**
 * An amount typed at the till: "500", "420,50", "1 250". Empty → null (not entered); anything else that is not a
 * non-negative amount → NaN.
 */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return round2(Number(s));
}

/** Types whose empty main amount means "the exact rest" (they settle in full); credit / reservation mean 0. */
const SETTLES_IN_FULL = new Set(['sale', 'exchange']);

/**
 * @param {object} o
 * @param {number} o.due        amount owed
 * @param {Array<{method:string, amount:any, reference?:string}>} o.rows  first row = main method; others = extra methods
 * @param {'sale'|'credit'|'reservation'|'exchange'} [o.saleType]
 * @param {boolean} [o.allowDiscount]  a direct sale / trade-in paid short: give the gap as a discount
 */
export function settlePayment({ due, rows, saleType = 'sale', allowDiscount = false }) {
  const owed = round2(Math.max(0, Number(due) || 0));
  const errors = [];
  const parsed = rows.map((r) => parseAmount(r.amount));
  if (parsed.some((a) => Number.isNaN(a))) errors.push('invalidAmount');

  const others = round2(parsed.slice(1).reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0));
  const mainEmpty = parsed[0] === null;
  const exactRest = mainEmpty && SETTLES_IN_FULL.has(saleType);
  const mainAmount = Number.isFinite(parsed[0]) ? parsed[0] : exactRest ? round2(Math.max(0, owed - others)) : 0;
  const amounts = [mainAmount, ...parsed.slice(1).map((a) => (Number.isFinite(a) ? a : 0))];

  const received = round2(amounts.reduce((s, a) => s + a, 0));
  const cashReceived = round2(rows.reduce((s, r, i) => s + (CHANGE_METHODS.includes(r.method) ? amounts[i] : 0), 0));
  const over = round2(Math.max(0, received - owed));
  const remaining = round2(Math.max(0, owed - received));

  // Change is handed back from the cash drawer: card, transfer, check or mobile cannot be overpaid.
  if (over > CENT && over - cashReceived > CENT) errors.push('nonCashOver');
  const change = errors.includes('nonCashOver') ? 0 : over;

  let discount = 0;
  if (remaining > CENT && SETTLES_IN_FULL.has(saleType)) {
    if (allowDiscount) discount = remaining;
    else errors.push('remaining');
  }

  // Sent in this order: cash last, so the server takes the change out of the cash (as handed back).
  const payments = rows
    .map((r, i) => ({ method: r.method, amount: amounts[i], reference: String(r.reference ?? '').trim() || undefined }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => Number(CHANGE_METHODS.includes(a.method)) - Number(CHANGE_METHODS.includes(b.method)));

  return {
    due: owed,
    amounts,
    mainAmount,
    exactRest,
    received,
    cashReceived,
    change,
    remaining,
    discount,
    // What the sale records as paid (change excluded); with a discount the sale's total is due − discount.
    recorded: round2(received - change),
    saleTotal: round2(owed - discount),
    payments,
    errors,
    ok: errors.length === 0,
  };
}

/** Quick amounts for cash: the exact amount, then the next round amounts a customer usually hands over. */
export function cashSuggestions(due) {
  const owed = round2(Math.max(0, Number(due) || 0));
  if (owed <= 0) return [];
  const up = (step) => Math.ceil((owed + CENT) / step) * step;
  const next = [...new Set([up(50), up(100), up(200), up(500)])].filter((v) => v > owed);
  return [owed, ...next].slice(0, 4);
}

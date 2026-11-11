/**
 * Point of sale helpers shared by the cart and the scanners (pure functions, see posScan.test.js).
 */

/** Highest price accepted for one piece, to catch a code scanned into the price field by mistake. */
export const MAX_UNIT_PRICE = 10_000_000;

/** A price typed by the cashier ("12,5", "12.50", " 99 "): the amount rounded to the cent, or null when invalid or ≤ 0. */
export function parsePrice(input) {
  const s = String(input ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 && n <= MAX_UNIT_PRICE ? n : null;
}

/** A readable product code: 3 to 64 visible characters (barcode, SKU, IMEI, serial number). */
export const isValidScanCode = (code) => /^[\x21-\x7e]{3,64}$/.test(String(code ?? '').trim());

/**
 * What a scanned code points to: a device in stock (exact REF / IMEI / serial), else a product with exactly this
 * barcode or SKU. Never a "closest match": an unknown code is reported as unknown.
 * `findByCode(code)` returns the product, or null when there is none; any other failure is reported as `error`.
 * @returns {Promise<{ kind: 'invalid' | 'unknown' | 'error' } | { kind: 'unit', unit: object } | { kind: 'product', product: object }>}
 */
export async function resolveScan(raw, { units = [], findByCode }) {
  const code = String(raw ?? '').trim();
  if (!isValidScanCode(code)) return { kind: 'invalid', code };
  const lc = code.toLowerCase();
  const unit = units.find((u) => [u.ref, u.imei, u.serialNumber].some((v) => v && String(v).toLowerCase() === lc));
  if (unit) return { kind: 'unit', unit, code };
  try {
    const product = await findByCode(code);
    return product ? { kind: 'product', product, code } : { kind: 'unknown', code };
  } catch {
    return { kind: 'error', code };
  }
}

/**
 * Continuous camera scanning: the camera sees the same barcode many times a second. A code is accepted when it is
 * new, or when the same product comes back after leaving the frame (scanning a second piece), never while it stays
 * in view. `accept(code, now)` → true when the read should count.
 */
export function createScanGate({ minGapMs = 400, sameGoneMs = 700 } = {}) {
  let lastCode = '';
  let lastAccepted = -Infinity;
  let lastSeen = -Infinity;
  return {
    accept(code, now = Date.now()) {
      if (code === lastCode) {
        const gone = now - lastSeen > sameGoneMs;
        lastSeen = now;
        if (!gone) return false;
      } else if (now - lastAccepted < minGapMs) {
        return false;
      }
      lastCode = code;
      lastAccepted = now;
      lastSeen = now;
      return true;
    },
    reset() {
      lastCode = '';
      lastAccepted = lastSeen = -Infinity;
    },
  };
}

/**
 * The cart line a scanned product went into, so the phone cashier can keep showing it (live: quantity, price, total).
 * A device has its own line (`unit-<id>`); a product's piece line wins over its box line when both exist.
 */
export function scannedLineId(items, { productId, unitId } = {}) {
  if (unitId) return items.some((i) => i.productId === `unit-${unitId}`) ? `unit-${unitId}` : null;
  if (!productId) return null;
  const lines = items.filter((i) => !i.soldUnit && (i.realProductId ?? i.productId) === productId);
  return (lines.find((i) => i.saleMode !== 'pack') ?? lines[0])?.productId ?? null;
}

/** What the phone cashier shows for a cart line: selling price (charged), cost and stock, kept apart. */
export function lineFigures(line, cartItems = []) {
  if (!line) return null;
  const isPack = line.saleMode === 'pack';
  const per = isPack ? line.packSize || 1 : 1;
  const realId = line.realProductId ?? line.productId;
  const inCart = line.soldUnit ? 1 : cartItems.filter((i) => !i.soldUnit && (i.realProductId ?? i.productId) === realId).reduce((s, i) => s + i.quantity, 0);
  const stock = line.soldUnit ? 1 : Number(line.product.stockQuantity) || 0;
  const quantity = isPack ? line.quantity / per : line.quantity;
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    // Per piece, or per box for a box line (its fixed box price: line total / boxes).
    sellingPrice: isPack ? round2(line.total / (quantity || 1)) : line.unitPrice,
    cost: round2(Number(line.product.costPrice) * per),
    stock,
    inCart,
    left: Math.max(0, stock - inCart),
    quantity,
    perBox: isPack ? per : null,
    total: line.total,
    profit: line.profit,
  };
}

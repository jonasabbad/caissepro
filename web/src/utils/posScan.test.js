import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCartStore } from '@/stores/cart';
import { createScanGate, isValidScanCode, lineFigures, parsePrice, resolveScan, scannedLineId } from './posScan';
import { cameraErrorCode } from '@/composables/useBarcodeCamera';

describe('parsePrice', () => {
  it('reads what a cashier types', () => {
    expect([parsePrice('12'), parsePrice('12,5'), parsePrice(' 12.499 '), parsePrice('1 250'), parsePrice(99.999)]).toEqual([12, 12.5, 12.5, 1250, 100]);
  });
  it('refuses empty, zero, negative and malformed amounts', () => {
    for (const bad of ['', ' ', '0', '0.001', '-3', 'abc', '1.2.3', '1e3', null, undefined, Number.NaN, '20000000']) expect(parsePrice(bad)).toBeNull();
  });
});

describe('scanned codes', () => {
  const products = { '6111000000017': { id: 'p1', name: 'Câble' }, 'CAB-1': { id: 'p1', name: 'Câble' } };
  const findByCode = async (c) => products[c] ?? null;

  it('finds a product by its exact barcode or SKU only', async () => {
    expect(await resolveScan(' 6111000000017 ', { findByCode })).toMatchObject({ kind: 'product', product: { id: 'p1' } });
    expect(await resolveScan('CAB-1', { findByCode })).toMatchObject({ kind: 'product' });
    // A code that only looks like a product is unknown, never "the closest match".
    expect(await resolveScan('6111000000', { findByCode })).toEqual({ kind: 'unknown', code: '6111000000' });
  });

  it('reports invalid codes without looking them up', async () => {
    let calls = 0;
    const spy = async () => (calls++, null);
    for (const bad of ['', '  ', 'ab', 'x'.repeat(65), 'code with spaces', 'é123']) expect((await resolveScan(bad, { findByCode: spy })).kind).toBe('invalid');
    expect(calls).toBe(0);
    expect([isValidScanCode('PH-123'), isValidScanCode('12')]).toEqual([true, false]);
  });

  it('prefers a device in stock with that IMEI, REF or serial number', async () => {
    const units = [{ id: 'u1', imei: '490154203237518', ref: 'PH-7' }];
    expect(await resolveScan('490154203237518', { units, findByCode })).toMatchObject({ kind: 'unit', unit: { id: 'u1' } });
    expect(await resolveScan('ph-7', { units, findByCode })).toMatchObject({ kind: 'unit' });
  });

  it('reports a lookup failure (network, server) as an error, not as unknown', async () => {
    const failing = async () => {
      throw new Error('Network Error');
    };
    expect((await resolveScan('6111000000017', { findByCode: failing })).kind).toBe('error');
  });
});

describe('continuous camera scanning', () => {
  it('counts a barcode held in view once, and again when it comes back', () => {
    const gate = createScanGate({ minGapMs: 400, sameGoneMs: 700 });
    expect(gate.accept('A', 0)).toBe(true);
    expect([gate.accept('A', 100), gate.accept('A', 300), gate.accept('A', 900)]).toEqual([false, false, false]); // still in view
    expect(gate.accept('A', 2000)).toBe(true); // left the frame for more than 700 ms: a second piece
  });
  it('accepts a different product right after, but not within the same instant', () => {
    const gate = createScanGate({ minGapMs: 400, sameGoneMs: 700 });
    gate.accept('A', 0);
    expect(gate.accept('B', 100)).toBe(false);
    expect(gate.accept('B', 500)).toBe(true);
    gate.reset();
    expect(gate.accept('B', 510)).toBe(true);
  });
});

describe('camera errors', () => {
  it('tells permission refusals, missing cameras and other failures apart', () => {
    const err = (name) => Object.assign(new Error(name), { name });
    expect([cameraErrorCode(err('NotAllowedError')), cameraErrorCode(err('SecurityError'))]).toEqual(['denied', 'denied']);
    expect([cameraErrorCode(err('NotFoundError')), cameraErrorCode(err('OverconstrainedError'))]).toEqual(['nocamera', 'nocamera']);
    expect([cameraErrorCode(err('NotReadableError')), cameraErrorCode(undefined)]).toEqual(['failed', 'failed']);
  });
});

describe('phone cashier: last scanned product', () => {
  // The real POS cart: the phone cashier shows its lines, it never computes its own figures.
  const cable = () => ({ id: 'p-cable', name: 'Câble USB-C', sku: 'CAB-1', barcode: '6111000000017', retailPrice: 35, costPrice: 15, stockQuantity: 40 });
  let cart;
  beforeEach(() => {
    setActivePinia(createPinia());
    cart = useCartStore();
  });

  it('follows the line of a product scanned twice: quantity, stock left, total and profit', () => {
    cart.addItem(cable());
    cart.addItem(cable());
    const id = scannedLineId(cart.items, { productId: 'p-cable' });
    expect(id).toBe('p-cable');
    const f = lineFigures(cart.items.find((i) => i.productId === id), cart.items);
    expect(f).toMatchObject({ sellingPrice: 35, cost: 15, stock: 40, inCart: 2, left: 38, quantity: 2, total: 70, profit: 40, perBox: null });
  });

  it('shows the price edited for this sale as the selling price; cost and product price stay the same', () => {
    const product = cable();
    cart.addItem(product, 2);
    cart.updateItemPrice('p-cable', '30');
    const f = lineFigures(cart.items[0], cart.items);
    expect([f.sellingPrice, f.cost, f.total, f.profit]).toEqual([30, 15, 60, 30]);
    expect([product.retailPrice, cart.items[0].product.retailPrice]).toEqual([35, 35]);
  });

  it('shows a box line per box (box price and cost), counting the pieces of the product already in the cart', () => {
    cart.addItem(cable());
    cart.addPackItem({ ...cable(), packSize: 10, packRetailPrice: 300 });
    const box = cart.items.find((i) => i.productId === 'pack-p-cable');
    expect(lineFigures(box, cart.items)).toMatchObject({ sellingPrice: 300, cost: 150, quantity: 1, perBox: 10, inCart: 11, left: 29 });
    // The piece line is the one shown after a scan of the product.
    expect(scannedLineId(cart.items, { productId: 'p-cable' })).toBe('p-cable');
  });

  it('follows a phone by its own line', () => {
    cart.addItem({ id: 'unit-u1', name: 'iPhone 11', sku: '490154203237518', retailPrice: 2600, costPrice: 2000, stockQuantity: 1 }, 1, { id: 'u1', imei: '490154203237518' });
    expect(scannedLineId(cart.items, { unitId: 'u1' })).toBe('unit-u1');
    expect(lineFigures(cart.items[0], cart.items)).toMatchObject({ sellingPrice: 2600, cost: 2000, stock: 1, inCart: 1, profit: 600 });
    expect(scannedLineId(cart.items, { unitId: 'gone' })).toBeNull();
    expect(lineFigures(null)).toBeNull();
  });
});

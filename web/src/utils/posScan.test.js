import { describe, expect, it } from 'vitest';
import { createScanGate, isValidScanCode, parsePrice, resolveScan } from './posScan';
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

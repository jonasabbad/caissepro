import { describe, expect, it } from 'vitest';
import { cashSuggestions, parseAmount, settlePayment } from './payment';

const cash = (amount) => ({ method: 'cash', amount });
const card = (amount) => ({ method: 'card', amount });

describe('payment: received, change and remaining (sale total 420 DH)', () => {
  it('1. received 500 in cash → change 80, the sale stays at 420', () => {
    const r = settlePayment({ due: 420, rows: [cash('500')] });
    expect(r).toMatchObject({ ok: true, received: 500, change: 80, remaining: 0, recorded: 420, saleTotal: 420, discount: 0 });
  });

  it('2. received exactly 420 → change 0', () => {
    expect(settlePayment({ due: 420, rows: [cash('420')] })).toMatchObject({ ok: true, change: 0, remaining: 0, recorded: 420, saleTotal: 420 });
    // Left empty: the exact amount.
    expect(settlePayment({ due: 420, rows: [cash('')] })).toMatchObject({ ok: true, exactRest: true, received: 420, change: 0, saleTotal: 420 });
  });

  it('3. received 400 → 20 remaining, not accepted silently; a discount only when chosen', () => {
    const r = settlePayment({ due: 420, rows: [cash('400')] });
    expect(r).toMatchObject({ ok: false, remaining: 20, change: 0, errors: ['remaining'] });
    expect(settlePayment({ due: 420, rows: [cash('400')], allowDiscount: true })).toMatchObject({ ok: true, discount: 20, saleTotal: 400, recorded: 400 });
    // A credit sale keeps the 20 as customer debt; the sale total stays 420.
    expect(settlePayment({ due: 420, rows: [cash('400')], saleType: 'credit' })).toMatchObject({ ok: true, remaining: 20, discount: 0, saleTotal: 420 });
  });

  it('4. cash 300 + card 120 → fully paid, no change', () => {
    const r = settlePayment({ due: 420, rows: [cash('300'), card('120')] });
    expect(r).toMatchObject({ ok: true, received: 420, change: 0, remaining: 0, saleTotal: 420 });
    expect(r.payments).toEqual([
      { method: 'card', amount: 120, reference: undefined },
      { method: 'cash', amount: 300, reference: undefined },
    ]);
  });

  it('5. cash 500 → change 80 (as case 1)', () => {
    expect(settlePayment({ due: 420, rows: [cash('500')] })).toMatchObject({ change: 80, saleTotal: 420, payments: [{ method: 'cash', amount: 500 }] });
  });
});

describe('payment: several methods', () => {
  it('card first, then cash with change: the change comes out of the cash, which is sent last', () => {
    const r = settlePayment({ due: 420, rows: [card('100'), cash('400')] });
    expect(r).toMatchObject({ ok: true, received: 500, cashReceived: 400, change: 80, saleTotal: 420 });
    expect(r.payments.map((p) => p.method)).toEqual(['card', 'cash']);
  });

  it('an empty main amount pays the exact rest of the other methods', () => {
    const r = settlePayment({ due: 420, rows: [cash(''), card('120')] });
    expect(r).toMatchObject({ ok: true, mainAmount: 300, received: 420, change: 0 });
  });

  it('change can only be given in cash: card, transfer, check or mobile cannot exceed what is due', () => {
    expect(settlePayment({ due: 420, rows: [card('500')] })).toMatchObject({ ok: false, errors: ['nonCashOver'], change: 0 });
    // 20 over but only 10 in cash: the card was overpaid.
    expect(settlePayment({ due: 420, rows: [cash('10'), card('430')] })).toMatchObject({ ok: false, errors: ['nonCashOver'] });
    // 30 over, 50 in cash: fine.
    expect(settlePayment({ due: 420, rows: [card('400'), cash('50')] })).toMatchObject({ ok: true, change: 30 });
  });

  it('refuses unreadable amounts', () => {
    expect(settlePayment({ due: 420, rows: [cash('abc')] }).errors).toContain('invalidAmount');
    expect(settlePayment({ due: 420, rows: [cash('420'), card('-5')] }).errors).toContain('invalidAmount');
  });

  it('reservation deposit: empty means no deposit, the rest is paid at pickup', () => {
    expect(settlePayment({ due: 2600, rows: [cash('')], saleType: 'reservation' })).toMatchObject({ ok: true, received: 0, remaining: 2600, payments: [] });
    expect(settlePayment({ due: 2600, rows: [cash('500')], saleType: 'reservation' })).toMatchObject({ ok: true, received: 500, remaining: 2100 });
  });
});

describe('typed amounts and quick amounts', () => {
  it('reads what a cashier types', () => {
    expect([parseAmount('500'), parseAmount('420,50'), parseAmount('1 250'), parseAmount(''), parseAmount(' ')]).toEqual([500, 420.5, 1250, null, null]);
    expect([parseAmount('-1'), parseAmount('1e3'), parseAmount('12,3,4')].every(Number.isNaN)).toBe(true);
  });
  it('offers the exact amount and the next round amounts', () => {
    expect(cashSuggestions(420)).toEqual([420, 450, 500, 600]);
    expect(cashSuggestions(500)).toEqual([500, 550, 600, 1000]);
    expect(cashSuggestions(0)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('cash drawer', () => {
  it('logs every cash flow with the observed types, reasons and running balance', async () => {
    const { api, store } = await newTenant();
    const product = (await api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 50 })).body.data.product;
    const supplier = (await api.post('/suppliers', { name: 'Grossiste' })).body.data.supplier;

    const sale = (await api.post('/checkout', { items: [{ productId: product.id, quantity: 4, unitPrice: 50 }], payments: [{ method: 'cash', amount: 200 }] })).body.data.transaction;
    const card = await api.post('/checkout', { items: [{ productId: product.id, quantity: 1, unitPrice: 50 }], payments: [{ method: 'card', amount: 50 }] });
    expect(card.status).toBe(200);
    const items = (await api.get('/transactions/sold-items')).body.data.items;
    const line = items.find((i: any) => i.transactionId === sale.id);
    await api.post('/checkout/return', { items: [{ transactionItemId: line.transactionItemId, productName: 'Coque', originalAmount: 50, refundAmount: 50, quantity: 1 }] });

    const order = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: product.id, productName: 'Coque', quantityOrdered: 10, unitCost: 8 }] })).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);
    await api.post(`/supplier-orders/${order.id}/payment`, { amount: 30 });

    const cin = await api.post(`/stores/${store.id}/caisse/cash-in`, { amount: 100, reason: 'Apport de fonds' });
    expect(cin.headers['x-cash-drawer']).toBe('open');
    expect((await api.post(`/stores/${store.id}/caisse/cash-out`, { amount: 20, reason: '' })).status).toBe(400);
    await api.post(`/stores/${store.id}/caisse/cash-out`, { amount: 20, reason: 'Achat fournitures' });
    expect((await api.get(`/stores/${store.id}/caisse/balance`)).body.data.balance).toBe(200);
    const adj = (await api.post(`/stores/${store.id}/caisse/adjust`, { newBalance: 190, reason: 'Correction caisse' })).body.data;
    expect([adj.movement.type, adj.movement.amount, adj.movement.balanceAfter]).toEqual(['adjustment', '-10.00', '190.00']);

    const day = localDay();
    const c = (await api.get(`/stores/${store.id}/caisse?startDate=${day}&endDate=${day}`)).body.data;
    expect(c.balance).toBe(190);
    expect(c.movements.map((m: any) => [m.type, m.amount, m.reason])).toEqual([
      ['adjustment', '-10.00', 'Correction caisse'],
      ['cash_out', '20.00', 'Achat fournitures'],
      ['cash_in', '100.00', 'Apport de fonds'],
      ['cash_out', '30.00', `Paiement fournisseur - ${order.orderNumber}`],
      ['return_refund', '50.00', expect.stringMatching(/^Remboursement retour - RET-/)],
      ['sale', '200.00', `Paiement espèces - ${sale.transactionNumber}`],
    ]);
    expect(c.movements.at(-1).transactionNumber).toBe(sale.transactionNumber);
    expect(c.movements[0].creator.firstName).toBe('Test');
    expect(c.dailySummary).toEqual({
      openingBalance: 0,
      closingBalance: 190,
      totalIn: 300,
      totalOut: 110,
      byType: { sale: 200, return_refund: 50, cash_out: 50, cash_in: 100, adjustment: 10 },
    });
    // A past period with no movement.
    expect((await api.get(`/stores/${store.id}/caisse?startDate=2020-01-01&endDate=2020-01-02`)).body.data.movements).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { newTenant } from './helpers.js';

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('dashboard', () => {
  it('computes KPIs, trend, top products, low stock and payment breakdown from real records', async () => {
    const { api, tenant } = await newTenant();
    const coque = (await api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 20, minStockLevel: 5 })).body.data.product;
    const cable = (await api.post('/products', { name: 'Câble', costPrice: 5, retailPrice: 20, stockQuantity: 6, minStockLevel: 5 })).body.data.product;
    const customer = (await api.post('/customers', { firstName: 'Walid' })).body.data.customer;
    const supplier = (await api.post('/suppliers', { name: 'Grossiste' })).body.data.supplier;

    // Yesterday: one 100 DH sale.
    const y = (await api.post('/checkout', { items: [{ productId: coque.id, quantity: 2, unitPrice: 50 }], payments: [{ method: 'cash', amount: 100 }] })).body.data.transaction;
    await prisma.transaction.update({ where: { id: y.id }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
    await prisma.payment.updateMany({ where: { transactionId: y.id }, data: { receivedAt: new Date(Date.now() - 86_400_000) } });
    // Today: cash sale 150 (profit 120), card sale 40 (profit 30), credit 100 with 20 paid (profit 80), return of one coque refunded 50.
    const s1 = (await api.post('/checkout', { items: [{ productId: coque.id, quantity: 3, unitPrice: 50 }], payments: [{ method: 'cash', amount: 150 }] })).body.data.transaction;
    await api.post('/checkout', { items: [{ productId: cable.id, quantity: 2, unitPrice: 20 }], payments: [{ method: 'card', amount: 40 }] });
    await api.post('/checkout', { type: 'credit', customerId: customer.id, items: [{ productId: coque.id, quantity: 2, unitPrice: 50 }], payments: [{ method: 'cash', amount: 20 }] });
    const line = (await api.get('/transactions/sold-items')).body.data.items.find((i: any) => i.transactionId === s1.id);
    await api.post('/checkout/return', { items: [{ transactionItemId: line.transactionItemId, productName: 'Coque', originalAmount: 50, refundAmount: 50, quantity: 1 }] });
    const order = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: coque.id, productName: 'Coque', quantityOrdered: 10, unitCost: 10 }] })).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);

    const k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect(k.dailySales).toEqual({ total: 290, count: 3, comparison: 190 });
    // 120 + 30 + 80 − 40 (the returned coque's margin) = 190
    expect(k.realProfit.total).toBe(190);
    expect(k.realProfit.margin).toBeCloseTo(65.52, 1);
    expect(k.customerDebt).toEqual({ total: 80, count: 1, overdue: 0 });
    expect(k.supplierDebt).toEqual({ total: 100, count: 1 });
    expect(k.newCustomersToday).toBe(1);

    const today = localDay();
    const yesterday = localDay(new Date(Date.now() - 86_400_000));
    const range = (await api.get(`/dashboard/kpis?startDate=${yesterday}&endDate=${today}`)).body.data.kpis;
    expect(range.dailySales.total).toBe(390);

    const trend = (await api.get('/dashboard/sales-trend?days=30')).body.data.trend;
    expect(trend).toHaveLength(30);
    expect(trend.at(-1)).toEqual({ date: today, sales: 290, profit: 190, count: 3 });
    expect(trend.at(-2)).toEqual({ date: yesterday, sales: 100, profit: 80, count: 1 });

    const top = (await api.get('/dashboard/top-products?limit=5')).body.data.products;
    expect(top.map((p: any) => [p.productName, p.quantity])).toEqual([['Coque', 6], ['Câble', 2]]);

    const low = (await api.get('/dashboard/low-stock')).body.data.products;
    expect(low.map((p: any) => p.name)).toEqual(['Câble']);

    const pay = (await api.get('/dashboard/payment-breakdown')).body.data.breakdown;
    expect(Object.fromEntries(pay.map((p: any) => [p.method, p.total]))).toEqual({ cash: 170, card: 40 });
    expect((await api.get('/dashboard/store-breakdown')).body.data.breakdown).toEqual([]);
    expect(tenant.id).toBeTruthy();
  });
});

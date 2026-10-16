import { describe, expect, it } from 'vitest';
import { getApp, newTenant } from './helpers.js';

describe('customers', () => {
  it('creates, searches, updates and deletes customers', async () => {
    const { api } = await newTenant();
    const c = (await api.post('/customers', { firstName: 'Walid', lastName: 'Amrani', phone: '0612345678', city: 'Casablanca' })).body.data.customer;
    expect(c.balance).toBe(0);
    expect((await api.post('/customers', {})).status).toBe(400);
    expect((await api.get('/customers?query=0612')).body.data.customers.map((x: any) => x.firstName)).toEqual(['Walid']);
    expect((await api.get('/customers?query=walid%20amr')).body.data.customers).toHaveLength(1);
    const u = await api.put(`/customers/${c.id}`, { firstName: 'Walid', email: 'w@x.ma' });
    expect(u.body.data.customer.email).toBe('w@x.ma');
    expect((await api.get(`/customers/${c.id}/payments`)).body.data.payments).toEqual([]);
    expect((await api.post(`/customers/${c.id}/payments`, { amount: 10, method: 'cash' })).status).toBe(400);
    expect((await api.post(`/customers/${c.id}/payments`, { amount: 10, method: 'check' })).body.message).toMatch(/référence/);
    await api.delete(`/customers/${c.id}`);
    expect((await api.get('/customers')).body.data.customers).toHaveLength(0);
  });
});

describe('suppliers & supplier orders', () => {
  async function setup() {
    const t = await newTenant();
    const supplier = (await t.api.post('/suppliers', { name: 'Oussama', city: 'Casablanca' })).body.data.supplier;
    const product = (await t.api.post('/products', { name: 'Câble V8', costPrice: 5, retailPrice: 25, stockQuantity: 18 })).body.data.product;
    return { ...t, supplier, product };
  }

  it('runs draft → pending → partial → received with stock movements and payments', async () => {
    const { api, supplier, product } = await setup();
    const created = await api.post('/supplier-orders', {
      supplierId: supplier.id,
      items: [{ itemType: 'product', productId: product.id, productName: product.name, sku: product.sku, quantityOrdered: 20, unitCost: 6 }],
      notes: 'TEST',
    });
    expect(created.status).toBe(201);
    const order = created.body.data.order;
    expect(order.orderNumber).toMatch(/^PO-/);
    expect(order.status).toBe('draft');
    expect(order.totalAmount).toBe('120.00');
    // Drafts do not count as supplier debt.
    expect((await api.get(`/suppliers/${supplier.id}`)).body.data.supplier.balance).toBe(0);

    expect((await api.post(`/supplier-orders/${order.id}/receive`, { items: [{ itemId: order.items[0].id, quantityReceived: 1 }] })).status).toBe(400);
    await api.post(`/supplier-orders/${order.id}/submit`);
    let s = (await api.get(`/suppliers/${supplier.id}`)).body.data.supplier;
    expect([s.balance, s.orderCount, s.totalPurchases]).toEqual([-120, 1, 120]);

    let r = await api.post(`/supplier-orders/${order.id}/receive`, { items: [{ itemId: order.items[0].id, quantityReceived: 5 }] });
    expect(r.body.data.order.status).toBe('partial');
    r = await api.post(`/supplier-orders/${order.id}/receive`, { items: [{ itemId: order.items[0].id, quantityReceived: 15 }], paymentAmount: 50 });
    expect(r.body.data.order.status).toBe('received');
    expect(r.body.data.order.amountRemaining).toBe('70.00');
    expect(r.body.data.order.payments).toHaveLength(1);
    expect((await api.post(`/supplier-orders/${order.id}/receive`, { items: [{ itemId: order.items[0].id, quantityReceived: 1 }] })).status).toBe(400);

    const p = (await api.get(`/products/${product.id}`)).body.data.product;
    expect(p.stockQuantity).toBe(38);
    expect(p.costPrice).toBe('6.00');
    const mv = (await api.get(`/inventory-movements?productId=${product.id}&type=purchase`)).body.data.movements;
    expect(mv.map((m: any) => [m.quantity, m.reference, m.notes])).toEqual([
      [15, order.orderNumber, 'Stock received from supplier'],
      [5, order.orderNumber, 'Stock received from supplier'],
    ]);

    r = await api.post(`/supplier-orders/${order.id}/payment`, { amount: 500 });
    expect(r.body.data.order.amountRemaining).toBe('0.00');
    expect(r.body.data.order.amountPaid).toBe('120.00');
    s = (await api.get(`/suppliers/${supplier.id}`)).body.data.supplier;
    expect(s.balance).toBe(0);
    expect((await api.get(`/supplier-orders?supplierId=${supplier.id}`)).body.data.orders).toHaveLength(1);
    expect((await api.get(`/supplier-orders?query=oussa`)).body.data.orders).toHaveLength(1);
  });

  it('converts ordered devices into phones in stock', async () => {
    const { api, supplier } = await setup();
    const order = (
      await api.post('/supplier-orders', {
        supplierId: supplier.id,
        items: [{ itemType: 'unit', productName: 'Apple iPhone 13', quantityOrdered: 3, unitCost: 3000, deviceType: 'phone', brand: 'Apple', model: 'iPhone 13', defaultSalePrice: 3800 }],
      })
    ).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);
    const itemId = order.items[0].id;
    await api.patch(`/supplier-orders/${order.id}/items/${itemId}/units`, { units: [{ imei: '490154203237518', condition: 'grade_a_plus' }] });
    const one = await api.post(`/supplier-orders/${order.id}/items/${itemId}/convert-units`, { unitIndexes: [0] });
    expect(one.body.data.converted).toBe(1);
    let o = (await api.get(`/supplier-orders/${order.id}`)).body.data.order;
    expect(o.status).toBe('partial');
    expect(o.items[0].unitDetails[0].addedToInventory).toBe(true);
    const all = await api.post(`/supplier-orders/${order.id}/convert-all-units`);
    expect(all.body.data.converted).toBe(2);
    o = (await api.get(`/supplier-orders/${order.id}`)).body.data.order;
    expect(o.status).toBe('received');
    const units = (await api.get('/phone-seller/sold-units')).body.data.units;
    expect(units).toHaveLength(3);
    expect(units.every((u: any) => u.supplierId === supplier.id && u.purchasePrice === '3000.00' && u.salePrice === '3800.00')).toBe(true);
    expect(units.find((u: any) => u.imei === '490154203237518').condition).toBe('grade_a_plus');
    expect(units[0].supplier.name).toBe('Oussama');
  });

  it('cancels only unreceived orders', async () => {
    const { api, supplier, product } = await setup();
    const order = (
      await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: product.id, productName: 'x', quantityOrdered: 2, unitCost: 1 }] })
    ).body.data.order;
    expect((await api.post(`/supplier-orders/${order.id}/cancel`)).body.data.order.status).toBe('cancelled');
    expect((await api.post(`/supplier-orders/${order.id}/payment`, { amount: 1 })).status).toBe(400);
  });
});

describe('http', () => {
  it('accepts a JSON content type with an empty body', async () => {
    const { token } = await newTenant();
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/lock', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, payload: '' });
    expect(res.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/api/v1/customers', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, payload: '{oops' });
    expect(bad.statusCode).toBe(400);
  });
});

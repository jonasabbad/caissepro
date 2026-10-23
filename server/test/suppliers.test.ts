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

  it('counts every order of a supplier, received and invoiced ones included, without counting their debt twice', async () => {
    const { api, supplier, product } = await setup();
    const newOrder = async () =>
      (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: product.id, productName: product.name, quantityOrdered: 2, unitCost: 50 }] })).body.data.order;
    const received = await newOrder();
    await api.post(`/supplier-orders/${received.id}/submit`);
    await api.post(`/supplier-orders/${received.id}/receive`, { items: [{ itemId: received.items[0].id, quantityReceived: 2 }] });
    const inv = (await api.post(`/supplier-invoices/from-order/${received.id}`)).body.data.invoice;
    await api.post(`/supplier-invoices/${inv.id}/confirm`);
    await newOrder(); // draft

    const listed = (await api.get('/suppliers')).body.data.suppliers.find((x: any) => x.id === supplier.id);
    const s = (await api.get(`/suppliers/${supplier.id}`)).body.data.supplier;
    const orders = (await api.get(`/suppliers/${supplier.id}/orders`)).body.data.orders;
    expect(orders.map((o: any) => o.status).sort()).toEqual(['draft', 'received']);
    expect([listed.orderCount, s.orderCount, s.totalOrders]).toEqual([2, 2, 2]);
    // The received order's 100 DH is owed once, through its invoice.
    expect([s.invoiceCount, s.totalPurchases, s.balance]).toEqual([1, 100, -100]);
  });

  it('receives all eligible orders at once, and only those', async () => {
    const { api, supplier, product } = await setup();
    const stock = async () => (await api.get(`/products/${product.id}`)).body.data.product.stockQuantity;
    const status = async (o: any) => (await api.get(`/supplier-orders/${o.id}`)).body.data.order.status;
    const make = async (qty: number, extra: any[] = []) =>
      (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: product.id, productName: product.name, quantityOrdered: qty, unitCost: 5 }, ...extra] })).body.data.order;
    const pending = await make(4);
    const partial = await make(3);
    const draft = await make(7);
    const received = await make(2);
    const cancelled = await make(9);
    const devices = await make(1, [{ itemType: 'unit', productName: 'Apple iPhone 13', quantityOrdered: 1, unitCost: 3000, deviceType: 'phone', brand: 'Apple', model: 'iPhone 13' }]);
    for (const o of [pending, partial, received, devices]) await api.post(`/supplier-orders/${o.id}/submit`);
    await api.post(`/supplier-orders/${partial.id}/receive`, { items: [{ itemId: partial.items[0].id, quantityReceived: 1 }] });
    await api.post(`/supplier-orders/${received.id}/receive`, { items: [{ itemId: received.items[0].id, quantityReceived: 2 }] });
    await api.post(`/supplier-orders/${cancelled.id}/cancel`);
    const before = await stock(); // 18 + 1 + 2

    // Two clicks at once: each order is received once.
    const [a, b] = await Promise.all([api.post('/supplier-orders/receive-all', {}), api.post('/supplier-orders/receive-all', {})]);
    expect([...a.body.data.received, ...b.body.data.received].sort()).toEqual([partial.orderNumber, pending.orderNumber].sort());
    expect(a.body.data.skipped.concat(b.body.data.skipped).filter((s: any) => s.reason === 'devices').map((s: any) => s.orderNumber)).toContain(devices.orderNumber);
    expect(await stock()).toBe(before + 4 + 2);
    expect([await status(pending), await status(partial)]).toEqual(['received', 'received']);
    expect([await status(draft), await status(received), await status(cancelled), await status(devices)]).toEqual(['draft', 'received', 'cancelled', 'pending']);
    const mv = (await api.get(`/inventory-movements?productId=${product.id}&type=purchase`)).body.data.movements;
    expect(mv.filter((m: any) => m.reference === pending.orderNumber).map((m: any) => m.quantity)).toEqual([4]);

    // Nothing left: a second Receive All changes nothing; ineligible orders named explicitly are skipped.
    const again = (await api.post('/supplier-orders/receive-all', { orderIds: [pending.id, draft.id, cancelled.id] })).body.data;
    expect(again.received).toEqual([]);
    expect(again.skipped.map((s: any) => s.reason)).toEqual(['status', 'status', 'status']);
    expect(await stock()).toBe(before + 6);
  });

  it('receives one order line at a time, never twice for simultaneous clicks', async () => {
    const { api, supplier, product } = await setup();
    const order = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: product.id, productName: product.name, quantityOrdered: 5, unitCost: 5 }] })).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);
    const line = [{ itemId: order.items[0].id, quantityReceived: 5 }];
    const res = await Promise.all([api.post(`/supplier-orders/${order.id}/receive`, { items: line }), api.post(`/supplier-orders/${order.id}/receive`, { items: line })]);
    // One succeeds; the other is refused (nothing left to receive, or caught while the first was running).
    expect(res.map((r) => r.status).filter((s) => s === 200)).toHaveLength(1);
    expect(res.every((r) => [200, 400, 409].includes(r.status))).toBe(true);
    expect((await api.get(`/products/${product.id}`)).body.data.product.stockQuantity).toBe(18 + 5);
    expect((await api.get(`/supplier-orders/${order.id}`)).body.data.order.status).toBe('received');
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

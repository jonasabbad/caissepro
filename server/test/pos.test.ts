import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { client, getApp, newTenant } from './helpers.js';

async function setup() {
  const t = await newTenant();
  const cable = (await t.api.post('/products', { name: 'Câble V8', costPrice: 6, retailPrice: 25, stockQuantity: 20, minStockLevel: 5 })).body.data.product;
  const phone = (
    await t.api.post('/phone-seller/sold-units', {
      brand: 'Apple', model: 'iPhone 11', storage: '64 GB', condition: 'grade_a', imei: '490154203237518', purchasePrice: 2000, salePrice: 2600,
    })
  ).body.data.unit;
  const customer = (await t.api.post('/customers', { firstName: 'Walid', lastName: 'A' })).body.data.customer;
  const other = (await t.api.post('/customers', { firstName: 'Sara', lastName: 'B' })).body.data.customer;
  const caisse = async () => Number((await prisma.store.findUniqueOrThrow({ where: { id: t.store.id } })).caisseBalance);
  return { ...t, cable, phone, customer, other, caisse };
}

describe('POS checkout', () => {
  it('cash sale: stock out, phone sold, profit, caisse, drawer header', async () => {
    const { api, cable, phone, caisse } = await setup();
    const r = await api.post('/checkout', {
      type: 'sale',
      items: [
        { productId: cable.id, quantity: 2, unitPrice: 25 },
        { productId: `unit-${phone.id}`, soldUnitId: phone.id, quantity: 1, unitPrice: 2600 },
      ],
      payments: [{ method: 'cash', amount: 2650 }],
      taxRate: 0,
    });
    expect(r.status).toBe(200);
    expect(r.headers['x-cash-drawer']).toBe('open');
    const tx = r.body.data.transaction;
    expect(tx.transactionNumber).toMatch(/^TRX-/);
    expect([tx.status, tx.totalAmount, tx.amountPaid, tx.amountRemaining, tx.totalCost, tx.totalProfit]).toEqual([
      'completed', '2650.00', '2650.00', '0.00', '2012.00', '638.00',
    ]);
    expect(tx.items.find((i: any) => i.soldUnitId).soldUnit.imei).toBe('490154203237518');
    expect((await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(18);
    expect((await api.get(`/phone-seller/sold-units/${phone.id}`)).body.data.unit.soldAt).not.toBeNull();
    expect(await caisse()).toBe(2650);
    const mv = (await api.get(`/inventory-movements?productId=${cable.id}&type=sale`)).body.data.movements[0];
    expect([mv.quantity, mv.reference, mv.notes]).toEqual([-2, tx.transactionNumber, 'Product sold']);
    // Selling the same phone twice is refused.
    expect((await api.post('/checkout', { items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }], payments: [{ method: 'cash', amount: 2600 }] })).status).toBe(400);
  });

  it('cash change is not recorded; discount and supplement adjust the total', async () => {
    const { api, cable, caisse } = await setup();
    let tx = (await api.post('/checkout', { items: [{ productId: cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'cash', amount: 50 }] })).body.data.transaction;
    expect([tx.totalAmount, tx.amountPaid, tx.payments[0].amount]).toEqual(['25.00', '25.00', '25.00']);
    tx = (await api.post('/checkout', { items: [{ productId: cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'card', amount: 20 }], discountAmount: 5 })).body.data.transaction;
    expect([tx.totalAmount, tx.discountAmount, tx.totalProfit]).toEqual(['20.00', '5.00', '14.00']);
    tx = (await api.post('/checkout', { items: [{ productId: cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'card', amount: 30 }], discountAmount: -5 })).body.data.transaction;
    expect(tx.totalAmount).toBe('30.00');
    expect(await caisse()).toBe(25); // only the cash sale went into the drawer
    // A plain sale cannot leave a balance.
    expect((await api.post('/checkout', { items: [{ productId: cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'cash', amount: 10 }] })).status).toBe(400);
  });

  it('applies TVA on (subtotal − discount)', async () => {
    const { api, cable } = await setup();
    const tx = (
      await api.post('/checkout', { items: [{ productId: cable.id, quantity: 4, unitPrice: 25 }], payments: [{ method: 'cash', amount: 108 }], discountAmount: 10, taxRate: 20 })
    ).body.data.transaction;
    expect([tx.subtotal, tx.taxAmount, tx.totalAmount]).toEqual(['100.00', '18.00', '108.00']);
  });

  it('credit sale creates customer debt that is paid back FIFO', async () => {
    const { api, cable, customer, caisse } = await setup();
    expect((await api.post('/checkout', { type: 'credit', items: [{ productId: cable.id, quantity: 4, unitPrice: 25 }], payments: [] })).status).toBe(400);
    const a = (await api.post('/checkout', { type: 'credit', customerId: customer.id, items: [{ productId: cable.id, quantity: 4, unitPrice: 25 }], payments: [{ method: 'cash', amount: 40 }] })).body.data.transaction;
    expect([a.status, a.amountPaid, a.amountRemaining]).toEqual(['partial', '40.00', '60.00']);
    const b = (await api.post('/checkout', { type: 'credit', customerId: customer.id, items: [{ productId: cable.id, quantity: 2, unitPrice: 25 }], payments: [] })).body.data.transaction;
    let c = (await api.get(`/customers/${customer.id}`)).body.data.customer;
    expect([c.balance, c.debt, c.transactionCount]).toEqual([-110, 110, 2]);

    const pay = await api.post(`/customers/${customer.id}/payments`, { amount: 80, method: 'cash' });
    expect(pay.body.data.customer.balance).toBe(-30);
    expect((await api.get(`/transactions/${a.id}`)).body.data.transaction.status).toBe('completed');
    const bAfter = (await api.get(`/transactions/${b.id}`)).body.data.transaction;
    expect([bAfter.status, bAfter.amountRemaining]).toEqual(['partial', '30.00']);

    const viaTx = await api.post(`/transactions/${b.id}/payment`, { amount: 30, method: 'cash' });
    expect(viaTx.body.data.transaction.status).toBe('completed');
    c = (await api.get(`/customers/${customer.id}`)).body.data.customer;
    expect([c.balance, c.totalSpent]).toEqual([0, 150]);
    const history = (await api.get(`/customers/${customer.id}/payments`)).body.data.payments;
    expect(history.map((p: any) => p.source).sort()).toEqual(['payment', 'transaction', 'transaction']);
    expect(await caisse()).toBe(150);
    expect((await api.get(`/customers?query=walid`)).body.data.customers[0].balance).toBe(0);
  });

  it('reservation: deposit, completion hands the phone over', async () => {
    const { api, phone, customer } = await setup();
    expect((await api.post('/checkout', { type: 'reservation', customerId: customer.id, items: [{ productId: 'x', quantity: 1, unitPrice: 1 }], payments: [] })).status).toBe(400);
    const res = (
      await api.post('/checkout', { type: 'reservation', customerId: customer.id, items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }], payments: [{ method: 'cash', amount: 500 }] })
    ).body.data.transaction;
    expect([res.type, res.status, res.amountPaid, res.amountRemaining]).toEqual(['reservation', 'pending', '500.00', '2100.00']);
    let u = (await api.get(`/phone-seller/sold-units/${phone.id}`)).body.data.unit;
    expect([u.soldAt, u.reservationDeposit, u.reservedByCustomer.firstName]).toEqual([null, '500.00', 'Walid']);
    expect((await api.get('/phone-seller/sold-units/reserved')).body.data.count).toBe(1);
    // A pending reservation is not a debt.
    expect((await api.get(`/customers/${customer.id}`)).body.data.customer.balance).toBe(0);
    expect((await api.get('/customers')).body.data.customers.find((c: any) => c.id === customer.id).reservationCount).toBe(1);

    await api.post(`/transactions/${res.id}/payment`, { amount: 2100, method: 'cash' });
    u = (await api.get(`/phone-seller/sold-units/${phone.id}`)).body.data.unit;
    expect(u.soldAt).not.toBeNull();
    expect(u.reservedAt).toBeNull();
    expect(u.customerId).toBe(customer.id);
    expect((await api.get(`/transactions/${res.id}`)).body.data.transaction.status).toBe('completed');
  });

  it('selling a reserved phone to someone else creates a deposit refund', async () => {
    const { api, phone, customer, other, caisse } = await setup();
    const res = (
      await api.post('/checkout', { type: 'reservation', customerId: customer.id, items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }], payments: [{ method: 'cash', amount: 300 }] })
    ).body.data.transaction;
    await api.post('/checkout', { customerId: other.id, items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }], payments: [{ method: 'cash', amount: 2600 }] });
    expect((await api.get(`/transactions/${res.id}`)).body.data.transaction.status).toBe('cancelled');
    const pending = (await api.get('/phone-seller/reservation-refunds/pending')).body.data.refunds;
    expect(pending).toHaveLength(1);
    expect([pending[0].depositAmount, pending[0].refundedAmount, pending[0].customer.firstName]).toEqual(['300.00', '0.00', 'Walid']);
    expect((await api.get('/customers')).body.data.customers.find((c: any) => c.id === customer.id).pendingRefundAmount).toBe(300);

    const paid = await api.post(`/phone-seller/reservation-refunds/${pending[0].id}/record-payment`, { amount: 300 });
    expect(paid.body.data.refund.status).toBe('completed');
    expect((await api.get('/phone-seller/reservation-refunds/pending')).body.data.refunds).toHaveLength(0);
    expect(await caisse()).toBe(2600);
  });

  it('trade-in: customer device enters stock, value deducted', async () => {
    const { api, phone, customer } = await setup();
    const r = await api.post('/checkout/trade-in', {
      customerId: customer.id,
      type: 'exchange',
      items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }],
      payments: [{ method: 'cash', amount: 1600 }],
      tradeInDevices: [{ brand: 'Samsung', model: 'Galaxy S21', deviceType: 'phone', condition: 'grade_b', tradeInValue: 1000, imei: '356938035643809', estimatedSalePrice: 1500 }],
    });
    expect(r.status).toBe(200);
    const tx = r.body.data.transaction;
    expect([tx.type, tx.status, tx.totalAmount, tx.tradeInValue, tx.amountPaid]).toEqual(['exchange', 'completed', '2600.00', '1000.00', '2600.00']);
    const unit = r.body.data.tradeInUnits[0];
    expect([unit.purchasePrice, unit.salePrice, unit.tradeInFromCustomerId, unit.tradeInValue]).toEqual(['1000.00', '1500.00', customer.id, '1000.00']);
    const detail = (await api.get(`/transactions/${tx.id}`)).body.data;
    expect(detail.tradeInUnit.tradeInFromCustomer.firstName).toBe('Walid');
    expect((await api.get('/phone-seller/sold-units/inventory')).body.data.units.map((u: any) => u.model)).toEqual(['Galaxy S21']);
  });

  it('returns: products back to stock, phones back to inventory, refund leaves the drawer', async () => {
    const { api, cable, phone, customer, caisse } = await setup();
    const sale = (
      await api.post('/checkout', {
        customerId: customer.id,
        items: [{ productId: cable.id, quantity: 3, unitPrice: 25 }, { soldUnitId: phone.id, quantity: 1, unitPrice: 2600 }],
        payments: [{ method: 'cash', amount: 2675 }],
      })
    ).body.data.transaction;
    const soldItems = (await api.get('/transactions/sold-items?query=V8')).body.data.items;
    expect(soldItems[0].quantity).toBe(3);
    const soldUnits = (await api.get('/phone-seller/sold-units/sold')).body.data.units;
    expect(soldUnits[0].paidAmount).toBe('2600.00');

    const ret = await api.post('/checkout/return', {
      customerId: customer.id,
      items: [
        { transactionItemId: soldItems[0].transactionItemId, productName: 'Câble V8', originalTransactionId: sale.id, originalAmount: 50, refundAmount: 50, quantity: 2 },
        { soldUnitId: phone.id, productName: 'iPhone 11', originalTransactionId: sale.id, originalAmount: 2600, refundAmount: 2000, quantity: 1 },
      ],
    });
    expect(ret.status).toBe(200);
    const rt = ret.body.data.transaction;
    expect([rt.type, rt.transactionNumber.slice(0, 4), rt.totalAmount]).toEqual(['return', 'RET-', '2050.00']);
    expect((await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(19);
    expect((await api.get(`/phone-seller/sold-units/${phone.id}`)).body.data.unit.soldAt).toBeNull();
    expect((await api.get('/transactions/sold-items?query=V8')).body.data.items[0].quantity).toBe(1);
    expect(await caisse()).toBe(2675 - 2050);
    const c = (await api.get(`/customers/${customer.id}`)).body.data.customer;
    expect([c.totalSpent, c.totalRefunded]).toEqual([625, 2050]);
    // Over-returning is refused.
    expect(
      (await api.post('/checkout/return', { items: [{ transactionItemId: soldItems[0].transactionItemId, productName: 'x', originalAmount: 50, refundAmount: 50, quantity: 2 }] })).status,
    ).toBe(400);
  });

  it('requires a seller when the shop has employees; cancel restores stock', async () => {
    const { api, cable } = await setup();
    const emp = (await api.post('/employees', { firstName: 'Youness' })).body.data.employee;
    const sellable = (await api.get('/employees/sellable')).body.data;
    expect(sellable.employees.map((e: any) => e.id)).toEqual([emp.id]);
    const noSeller = await api.post('/checkout', { items: [{ productId: cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'cash', amount: 25 }] });
    expect(noSeller.status).toBe(400);
    expect(noSeller.body.message).toMatch(/^Sélectionnez le vendeur/);
    const tx = (await api.post('/checkout', { employeeId: emp.id, items: [{ productId: cable.id, quantity: 5, unitPrice: 25 }], payments: [{ method: 'cash', amount: 125 }] })).body.data.transaction;
    expect(tx.employee.firstName).toBe('Youness');
    expect((await api.get('/transactions')).body.data.transactions[0].employee.firstName).toBe('Youness');
    const cancelled = await api.post(`/transactions/${tx.id}/cancel`, { reason: 'erreur' });
    expect(cancelled.body.data.transaction.status).toBe('cancelled');
    expect((await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(20);
    const csv = await api.get('/transactions/export');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(String(csv.body)).toContain(tx.transactionNumber);
  });
});

describe('POS: selling price changed at the till', () => {
  /** A cashier account of the same business (the price is set by whoever sells). */
  async function cashierOf(t: Awaited<ReturnType<typeof setup>>) {
    const email = `cashier-${t.tenant.id.slice(0, 6)}@test.local`;
    await prisma.user.create({
      data: { tenantId: t.tenant.id, email, passwordHash: await bcrypt.hash('secret123', 4), firstName: 'Caissier', roles: JSON.stringify(['cashier']), currentStoreId: t.store.id },
    });
    const app = await getApp();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'secret123' } });
    return client(app, login.json().data.tokens.accessToken);
  }

  it('records the edited price for this sale only, with profit from the product cost', async () => {
    const t = await setup();
    const cashier = await cashierOf(t);
    const r = await cashier.post('/checkout', {
      items: [
        { productId: t.cable.id, quantity: 3, unitPrice: 22.5 },
        { productId: `unit-${t.phone.id}`, soldUnitId: t.phone.id, quantity: 1, unitPrice: 2450 },
      ],
      payments: [{ method: 'cash', amount: 2517.5 }],
    });
    expect(r.status).toBe(200);
    const tx = r.body.data.transaction;
    const line = tx.items.find((i: any) => i.productId === t.cable.id);
    expect([line.unitPrice, line.totalPrice, line.costPrice, line.profit]).toEqual(['22.50', '67.50', '6.00', '49.50']);
    // (22.50 − 6) × 3 + (2450 − 2000)
    expect([tx.subtotal, tx.totalAmount, tx.totalCost, tx.totalProfit]).toEqual(['2517.50', '2517.50', '2018.00', '499.50']);

    // The products keep their own prices; stock moves as for any sale.
    const p = (await t.api.get(`/products/${t.cable.id}`)).body.data.product;
    expect([p.retailPrice, p.costPrice, p.stockQuantity]).toEqual(['25.00', '6.00', 17]);
    expect((await t.api.get(`/phone-seller/sold-units/${t.phone.id}`)).body.data.unit.salePrice).toBe('2600.00');
    // The next sale starts from the product price again.
    const next = (await cashier.post('/checkout', { items: [{ productId: t.cable.id, quantity: 1, unitPrice: 25 }], payments: [{ method: 'cash', amount: 25 }] })).body.data.transaction;
    expect(next.items[0].unitPrice).toBe('25.00');
  });

  it('refuses a negative price, and a cashier still cannot delete or cancel a sale', async () => {
    const t = await setup();
    const cashier = await cashierOf(t);
    expect((await cashier.post('/checkout', { items: [{ productId: t.cable.id, quantity: 1, unitPrice: -5 }], payments: [{ method: 'cash', amount: 0 }] })).status).toBe(400);
    const tx = (await cashier.post('/checkout', { items: [{ productId: t.cable.id, quantity: 1, unitPrice: 20 }], payments: [{ method: 'cash', amount: 20 }] })).body.data.transaction;
    const del = await cashier.delete(`/transactions/${tx.id}`);
    expect(del.status).toBeGreaterThanOrEqual(400);
    expect((await t.api.get(`/transactions/${tx.id}`)).body.data.transaction.status).toBe('completed');

    // Cancelling is for managers: the cashier is refused and nothing moves (sale, stock, drawer).
    const caisseBefore = (await t.api.get(`/stores/${t.store.id}/caisse/balance`)).body;
    const cancel = await cashier.post(`/transactions/${tx.id}/cancel`, { reason: 'test' });
    expect(cancel.status).toBe(403);
    expect((await t.api.get(`/transactions/${tx.id}`)).body.data.transaction.status).toBe('completed');
    expect((await t.api.get(`/products/${t.cable.id}`)).body.data.product.stockQuantity).toBe(19);
    expect((await t.api.get(`/stores/${t.store.id}/caisse/balance`)).body).toEqual(caisseBefore);

    // The admin can still cancel it: stock comes back.
    expect((await t.api.post(`/transactions/${tx.id}/cancel`, { reason: 'erreur' })).body.data.transaction.status).toBe('cancelled');
    expect((await t.api.get(`/products/${t.cable.id}`)).body.data.product.stockQuantity).toBe(20);
  });

  it('a manager (not admin) can still cancel a sale', async () => {
    const m = await newTenant({ roles: ['manager'] });
    const cable = (await m.api.post('/products', { name: 'Câble', costPrice: 6, retailPrice: 25, stockQuantity: 10 })).body.data.product;
    const tx = (await m.api.post('/checkout', { items: [{ productId: cable.id, quantity: 2, unitPrice: 25 }], payments: [{ method: 'cash', amount: 50 }] })).body.data.transaction;
    const r = await m.api.post(`/transactions/${tx.id}/cancel`, { reason: 'erreur' });
    expect(r.status).toBe(200);
    expect(r.body.data.transaction.status).toBe('cancelled');
    expect((await m.api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(10);
  });
});

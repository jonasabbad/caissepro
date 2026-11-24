import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { newTenant } from './helpers.js';

/** Valid 15-digit IMEIs (Luhn), unique per call. */
let imeiSeq = 35_000_000_000_000;
function nextImei() {
  const body = String(imeiSeq++).padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[13 - i]);
    if (i % 2 === 0) d *= 2;
    sum += d > 9 ? d - 9 : d;
  }
  return body + ((10 - (sum % 10)) % 10);
}

/**
 * Supplier → order PO with 4 lines (12 devices: 10 phones + 2 laptops), all received into stock with their own IMEI or
 * serial and cost. Total 3×2 500 + 4×3 200 + 3×1 200 + 2×4 500 = 32 900 DH.
 */
async function setup() {
  const t = await newTenant();
  const supplier = (await t.api.post('/suppliers', { name: 'Grossiste Tech', phone: '0522000000' })).body.data.supplier;
  const lines = [
    { brand: 'Apple', model: 'iPhone 13', deviceType: 'phone', qty: 3, cost: 2500 },
    { brand: 'Samsung', model: 'Galaxy S24', deviceType: 'phone', qty: 4, cost: 3200 },
    { brand: 'Xiaomi', model: 'Redmi Note 13', deviceType: 'phone', qty: 3, cost: 1200 },
    { brand: 'Lenovo', model: 'ThinkPad E14', deviceType: 'laptop', qty: 2, cost: 4500 },
  ];
  const order = (
    await t.api.post('/supplier-orders', {
      supplierId: supplier.id,
      items: lines.map((l) => ({ itemType: 'unit', productName: `${l.brand} ${l.model}`, quantityOrdered: l.qty, unitCost: l.cost, deviceType: l.deviceType, brand: l.brand, model: l.model })),
    })
  ).body.data.order;
  await t.api.post(`/supplier-orders/${order.id}/submit`);
  for (const [i, item] of order.items.entries()) {
    const l = lines.find((x) => x.brand === item.brand)!; // order lines have no fixed position
    const units = Array.from({ length: l.qty }, (_, k) =>
      l.deviceType === 'phone' ? { imei: nextImei(), storage: '128 GB', color: 'Noir', condition: 'new' } : { serialNumber: `PF-${i}${k}-${randomUUID().slice(0, 6)}`, condition: 'new' },
    );
    await t.api.patch(`/supplier-orders/${order.id}/items/${item.id}/units`, { units });
  }
  await t.api.post(`/supplier-orders/${order.id}/convert-all-units`);
  const drawer = async () => Number((await t.api.get(`/stores/${t.store.id}/caisse/balance`)).body.data.balance);
  const getOrder = async () => (await t.api.get(`/supplier-orders/${order.id}`)).body.data.order;
  const pay = (amount: unknown, extra: Record<string, unknown> = {}) => t.api.post(`/supplier-orders/${order.id}/payment`, { amount, ...extra });
  const balance = async () => (await t.api.get(`/suppliers/${supplier.id}`)).body.data.supplier.currentBalance;
  return { ...t, supplier, order, drawer, getOrder, pay, balance };
}

describe('purchasing: supplier order → devices → one invoice → several payments → left to pay', () => {
  it('pays an order in several parts; left to pay, status and history stay exact; overpaying and 0 are refused', async () => {
    const { getOrder, pay, drawer, balance } = await setup();
    let o = await getOrder();
    expect([o.status, o.totalAmount, o.amountPaid, o.amountRemaining, o.paymentStatus]).toEqual(['received', '32900.00', '0.00', '32900.00', 'unpaid']);

    expect((await pay(10000)).status).toBe(200);
    expect((await pay('2900.50')).status).toBe(200);
    o = await getOrder();
    expect([o.amountPaid, o.amountRemaining, o.paymentStatus]).toEqual(['12900.50', '19999.50', 'partial']);
    expect(o.payments.map((p: any) => p.amount)).toEqual([10000, 2900.5]);
    expect(o.payments.every((p: any) => !Number.isNaN(Date.parse(p.createdAt)))).toBe(true);

    for (const bad of [0, -1, 'abc', 0.001]) expect((await pay(bad)).status).toBe(400);
    const over = await pay(20000);
    expect([over.status, over.body.message]).toEqual([400, 'Le montant dépasse le reste à payer (19999.50 DH)']);

    expect((await pay(19999.5)).status).toBe(200);
    o = await getOrder();
    expect([o.amountPaid, o.amountRemaining, o.paymentStatus, o.payments.length]).toEqual(['32900.00', '0.00', 'paid', 3]);
    expect((await pay(1)).body.message).toBe('Cette commande est déjà payée');
    expect([await drawer(), await balance()]).toEqual([-32900, 0]);
  });

  it('a repeated submit is paid once, and two payments at the same time can never overpay', async () => {
    const { pay, getOrder, drawer } = await setup();
    const requestId = randomUUID();
    const twice = await Promise.all([pay(1000, { requestId }), pay(1000, { requestId })]);
    expect(twice.map((r) => r.status)).toContain(200);
    expect((await pay(1000, { requestId })).status).toBe(200); // retried later: nothing more
    expect((await getOrder()).amountPaid).toBe('1000.00');

    const both = await Promise.all([pay(20000), pay(20000)]);
    expect(both.filter((r) => r.status === 200)).toHaveLength(1);
    const o = await getOrder();
    expect([o.amountPaid, o.amountRemaining, await drawer()]).toEqual(['21000.00', '11900.00', -21000]);
  });

  it('one order = one invoice with every product line; its 12 devices all point to it', async () => {
    const { api, order, supplier, getOrder } = await setup();
    // Two clicks at the same moment: one invoice only.
    const made = await Promise.all([api.post(`/supplier-invoices/from-order/${order.id}`), api.post(`/supplier-invoices/from-order/${order.id}`)]);
    expect(made.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.supplierInvoice.count({ where: { supplierOrderId: order.id } })).toBe(1);
    const inv = made.find((r) => r.status === 201)!.body.data.invoice;

    expect(inv.items.map((i: any) => [i.productName, i.quantity, Number(i.unitCost), Number(i.lineTotal)]).sort()).toEqual([
      ['Apple iPhone 13', 3, 2500, 7500],
      ['Samsung Galaxy S24', 4, 3200, 12800],
      ['Xiaomi Redmi Note 13', 3, 1200, 3600],
      ['Lenovo ThinkPad E14', 2, 4500, 9000],
    ].sort());
    expect([Number(inv.total), inv.supplierOrder.orderNumber, inv.supplier.name]).toEqual([32900, order.orderNumber, supplier.name]);
    expect(inv.devices).toHaveLength(12);
    expect(inv.devices.filter((d: any) => d.imei)).toHaveLength(10);
    expect(inv.devices.filter((d: any) => d.deviceType === 'laptop' && d.serialNumber)).toHaveLength(2);
    expect((await getOrder()).invoice.number).toBe(inv.number);

    // Every phone and device of the order: its own IMEI / serial and cost, the same order and the same invoice.
    const units = await prisma.soldUnit.findMany({ where: { supplierOrderId: order.id } });
    expect(units).toHaveLength(12);
    const seen = new Set<string>();
    for (const u of units) {
      const p = (await api.get(`/phone-seller/sold-units/${u.id}/purchase`)).body.data.purchase;
      expect([p.supplier.name, p.order.orderNumber, p.invoice.id, p.purchasePrice]).toEqual([supplier.name, order.orderNumber, inv.id, u.purchasePrice.toFixed(2)]);
      seen.add(p.invoice.id);
    }
    expect(seen.size).toBe(1);
    expect(await prisma.supplierInvoice.count({ where: { tenantId: inv.tenantId } })).toBe(1); // never one per device

    // Invoice history stays when devices are sold, and the sold device still traces back to its purchase.
    await prisma.soldUnit.update({ where: { id: units[0].id }, data: { soldAt: new Date() } });
    const again = (await api.get(`/supplier-invoices/${inv.id}`)).body.data.invoice;
    expect([again.devices.length, again.devices.filter((d: any) => d.soldAt).length, Number(again.total)]).toEqual([12, 1, 32900]);
    const sold = (await api.get(`/phone-seller/sold-units/${units[0].id}/purchase`)).body.data.purchase;
    expect([sold.supplier.name, sold.order.orderNumber, sold.invoice.number, sold.purchasePrice]).toEqual([supplier.name, order.orderNumber, inv.number, units[0].purchasePrice.toFixed(2)]);
    // Purchase date = when the order was received into stock.
    const received = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(sold.purchaseDate).toBe(received.receivedAt!.toISOString());
  });

  it('a device added by an older client (no source sent) keeps working; nothing is invented', async () => {
    const t = await newTenant();
    const unit = (await t.api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 12', imei: nextImei(), purchasePrice: 2000, salePrice: 2600 })).body.data.unit;
    const p = (await t.api.get(`/phone-seller/sold-units/${unit.id}/purchase`)).body.data.purchase;
    expect([p.source, p.supplier, p.order, p.invoice, p.purchaseDate, p.purchasePrice]).toEqual(['other', null, null, null, null, '2000.00']);
    expect(await prisma.supplierInvoice.count({ where: { tenantId: t.tenant.id } })).toBe(0);
  });
  it('left to pay can always be paid: before, during (draft) and after its invoice; the debt never disappears', async () => {
    const { api, order, getOrder, pay, balance, drawer } = await setup();
    await pay(2900);
    expect(await balance()).toBe(30000);

    // Draft invoice: the order still carries its debt and can still be paid.
    const inv = (await api.post(`/supplier-invoices/from-order/${order.id}`)).body.data.invoice;
    expect(await balance()).toBe(30000);
    expect((await pay(5000)).status).toBe(200);
    expect([await balance(), (await getOrder()).amountRemaining]).toEqual([25000, '25000.00']);

    // Confirmed: the invoice takes over the order's payments (no drawer movement), the order shows its figures.
    const confirmed = (await api.post(`/supplier-invoices/${inv.id}/confirm`)).body.data.invoice;
    expect([Number(confirmed.amountPaid), confirmed.remaining, await drawer()]).toEqual([7900, 25000, -7900]);
    let o = await getOrder();
    expect([o.amountPaid, o.amountRemaining, o.paymentStatus, o.payments.map((p: any) => p.amount)]).toEqual(['7900.00', '25000.00', 'partial', [2900, 5000]]);

    // Paid from the order: recorded on the invoice. Paid from the invoice: shown on the order.
    expect((await pay(10000)).status).toBe(200);
    await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 3000, method: 'bank_transfer', reference: 'VIR-1' });
    o = await getOrder();
    expect([o.amountPaid, o.amountRemaining, o.payments.length]).toEqual(['20900.00', '12000.00', 4]);
    expect((await api.get(`/supplier-invoices/${inv.id}`)).body.data.invoice.remaining).toBe(12000);
    expect([await balance(), await drawer()]).toEqual([12000, -17900]); // the transfer did not leave the drawer

    const over = await pay(12000.01);
    expect(over.status).toBe(400);
    expect((await pay(12000)).status).toBe(200);
    o = await getOrder();
    expect([o.amountRemaining, o.paymentStatus, await balance()]).toEqual(['0.00', 'paid', 0]);

    // Same figures on the order list and on the supplier's page.
    const listed = (await api.get('/supplier-orders')).body.data.orders.find((x: any) => x.id === order.id);
    const onSupplier = (await api.get(`/suppliers/${o.supplierId}/orders`)).body.data.orders.find((x: any) => x.id === order.id);
    expect([listed.amountRemaining, listed.paymentStatus, onSupplier.amountRemaining, onSupplier.paymentStatus]).toEqual(['0.00', 'paid', '0.00', 'paid']);
  });

  it('a mixed order (products and devices) also gets one invoice with all its lines', async () => {
    const t = await newTenant();
    const supplier = (await t.api.post('/suppliers', { name: 'Mix' })).body.data.supplier;
    const cable = (await t.api.post('/products', { name: 'Câble USB-C', costPrice: 10, retailPrice: 30, stockQuantity: 0 })).body.data.product;
    const order = (
      await t.api.post('/supplier-orders', {
        supplierId: supplier.id,
        items: [
          { productId: cable.id, productName: cable.name, quantityOrdered: 20, unitCost: 12 },
          { itemType: 'unit', productName: 'Apple iPhone 15', quantityOrdered: 2, unitCost: 6000, deviceType: 'phone', brand: 'Apple', model: 'iPhone 15' },
        ],
      })
    ).body.data.order;
    await t.api.post(`/supplier-orders/${order.id}/submit`);
    const inv = (await t.api.post(`/supplier-invoices/from-order/${order.id}`)).body.data.invoice;
    expect(inv.items.map((i: any) => [i.productName, i.quantity]).sort()).toEqual([
      ['Apple iPhone 15', 2],
      ['Câble USB-C', 20],
    ]);
    expect(Number(inv.total)).toBe(12240);
  });
});

describe('flexible purchase source: adding a phone or device never needs a supplier order', () => {
  const phone = (extra: Record<string, unknown>) => ({ brand: 'Samsung', model: 'Galaxy A55', imei: nextImei(), purchasePrice: 2100, salePrice: 2900, ...extra });
  const purchaseOf = async (api: any, id: string) => (await api.get(`/phone-seller/sold-units/${id}/purchase`)).body.data.purchase;

  it('supplier: an existing supplier and the cost, with an optional date; no order, no invoice', async () => {
    const t = await newTenant();
    const supplier = (await t.api.post('/suppliers', { name: 'Distri Phone' })).body.data.supplier;
    const res = await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierId: supplier.id, purchasedAt: '2026-11-20' }));
    expect(res.status).toBe(201);
    const p = await purchaseOf(t.api, res.body.data.unit.id);
    expect([p.source, p.supplier.name, p.order, p.invoice, p.purchaseDate.slice(0, 10), p.purchasePrice]).toEqual(['supplier', 'Distri Phone', null, null, '2026-11-20', '2100.00']);

    expect((await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier' }))).body.message).toBe('Choisissez le fournisseur');
    const other = await newTenant(); // another business's supplier cannot be used
    const foreign = (await other.api.post('/suppliers', { name: 'Ailleurs' })).body.data.supplier;
    expect((await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierId: foreign.id }))).body.message).toBe('Fournisseur introuvable');
    expect(await prisma.supplierInvoice.count({ where: { tenantId: t.tenant.id } })).toBe(0);
  });

  it('other source: the cost and an optional description; no supplier, order or invoice', async () => {
    const t = await newTenant();
    const res = await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'other', purchaseNote: 'Particulier — M. Alami', supplierId: 'ignored' }));
    expect(res.status).toBe(201);
    const p = await purchaseOf(t.api, res.body.data.unit.id);
    expect([p.source, p.note, p.supplier, p.order, p.invoice, p.purchaseDate, p.purchasePrice]).toEqual(['other', 'Particulier — M. Alami', null, null, null, null, '2100.00']);
    const bare = await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'other' }));
    expect((await purchaseOf(t.api, bare.body.data.unit.id)).note).toBeNull();
  });

  it('not recorded: no supplier, cost or date is stored or shown; the sale price stays', async () => {
    const t = await newTenant();
    const res = await t.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'unknown', purchasePrice: 999, purchasedAt: '2026-11-01' }));
    expect(res.status).toBe(201);
    const u = res.body.data.unit;
    expect([u.purchasePrice, u.salePrice, u.supplierId, u.purchasedAt]).toEqual(['0.00', '2900.00', null, null]);
    const p = await purchaseOf(t.api, u.id);
    expect([p.source, p.supplier, p.order, p.invoice, p.purchaseDate, p.purchasePrice]).toEqual(['unknown', null, null, null, null, null]);
  });

  it('linked to an existing order: supplier, date and invoice come from it; its own cost is kept; nothing duplicated', async () => {
    const { api, order, supplier, tenant } = await setup();
    const inv = (await api.post(`/supplier-invoices/from-order/${order.id}`)).body.data.invoice;
    const before = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });

    // The supplier is taken from the order (none sent); the date sent is ignored in favour of the order's.
    const res = await api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierOrderId: order.id, purchasePrice: 2750, purchasedAt: '2020-01-01' }));
    expect(res.status).toBe(201);
    const p = await purchaseOf(api, res.body.data.unit.id);
    expect([p.supplier.id, p.order.id, p.invoice.id, p.purchaseDate, p.purchasePrice]).toEqual([supplier.id, order.id, inv.id, before.receivedAt!.toISOString(), '2750.00']);
    // The order and its invoice are unchanged: same total, one invoice.
    const after = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect([Number(after.totalAmount), await prisma.supplierInvoice.count({ where: { tenantId: tenant.id } })]).toEqual([Number(before.totalAmount), 1]);

    // Wrong supplier, unknown, draft and cancelled orders are refused.
    const other = (await api.post('/suppliers', { name: 'Autre' })).body.data.supplier;
    expect((await api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierId: other.id, supplierOrderId: order.id }))).body.message).toBe('Cette commande n’est pas de ce fournisseur');
    expect((await api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierOrderId: 'nope' }))).body.message).toBe('Commande fournisseur introuvable');
    const draft = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productName: 'X', quantityOrdered: 1, unitCost: 1 }] })).body.data.order;
    expect((await api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierOrderId: draft.id }))).body.message).toBe('Cette commande fournisseur ne peut pas être liée (brouillon ou annulée)');
    const foreign = await newTenant();
    expect((await foreign.api.post('/phone-seller/sold-units', phone({ purchaseSource: 'supplier', supplierOrderId: order.id }))).body.message).toBe('Commande fournisseur introuvable');
  });

  it('an existing device can be linked to an order later; one received with its order keeps it; info stays after the sale', async () => {
    const { api, order, supplier } = await setup();
    const manual = (await api.post('/phone-seller/sold-units', phone({ purchaseSource: 'other' }))).body.data.unit;
    const linked = await api.put(`/phone-seller/sold-units/${manual.id}`, { purchaseSource: 'supplier', supplierOrderId: order.id });
    expect([linked.status, linked.body.data.unit.supplierId, linked.body.data.unit.purchasePrice]).toEqual([200, supplier.id, '2100.00']);

    const received = await prisma.soldUnit.findFirstOrThrow({ where: { supplierOrderId: order.id, id: { not: manual.id } } });
    const moved = await api.put(`/phone-seller/sold-units/${received.id}`, { purchaseSource: 'other' });
    expect([moved.status, moved.body.message]).toEqual([400, 'Cet appareil a été reçu avec sa commande fournisseur : son origine ne peut pas être changée']);
    // Editing anything else on it still works, and its purchase is untouched.
    expect((await api.put(`/phone-seller/sold-units/${received.id}`, { salePrice: 5000 })).status).toBe(200);

    await api.post(`/phone-seller/sold-units/${manual.id}/mark-sold`, {});
    const p = await purchaseOf(api, manual.id);
    expect([p.source, p.supplier.id, p.order.id, p.purchasePrice]).toEqual(['supplier', supplier.id, order.id, '2100.00']);
  });

});

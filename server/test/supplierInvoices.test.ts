import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { newTenant } from './helpers.js';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

async function setup() {
  const t = await newTenant();
  const supplier = (await t.api.post('/suppliers', { name: 'Atlas Distribution', phone: '0522000000', contactName: 'Karim' })).body.data.supplier;
  const cable = (await t.api.post('/products', { name: 'Câble USB-C', costPrice: 25, retailPrice: 60, stockQuantity: 2, barcode: '6110000000017' })).body.data.product;
  const drawer = async () => Number((await t.api.get(`/stores/${t.store.id}/caisse/balance`)).body.data.balance);
  const balanceOf = async () => (await t.api.get(`/suppliers/${supplier.id}`)).body.data.supplier;
  return { ...t, supplier, cable, drawer, balanceOf };
}

describe('supplier invoices', () => {
  it('5,000 DH invoice paid 2,000 + 1,000 + 2,000: balances, status, stock, drawer, statement and reports stay exact', async () => {
    const { api, supplier, cable, drawer, balanceOf, tenant } = await setup();
    const invoice = {
      supplierId: supplier.id,
      supplierRef: 'AD-7781',
      invoiceDate: today(),
      dueDate: daysAgo(-30),
      paymentTerms: '30 jours',
      items: [
        { productId: cable.id, productName: cable.name, reference: cable.barcode, quantity: 10, unitCost: 300 },
        { productName: 'Écouteurs BT X2', reference: '6119999999990', quantity: 20, unitCost: 100, newRetailPrice: 199 },
      ],
    };
    // Discount larger than the subtotal is refused.
    expect((await api.post('/supplier-invoices', { ...invoice, discount: 6000 })).status).toBe(400);

    let inv = (await api.post('/supplier-invoices', invoice)).body.data.invoice;
    expect(inv.number).toMatch(/^FF-\d{4}-0001$/);
    expect([inv.status, Number(inv.subtotal), Number(inv.total), inv.remaining, inv.paymentStatus]).toEqual(['draft', 5000, 5000, 5000, 'unpaid']);
    // A draft owes nothing and cannot be paid or received.
    expect((await balanceOf()).currentBalance).toBe(0);
    expect((await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 100, method: 'cash' })).status).toBe(400);
    expect((await api.post(`/supplier-invoices/${inv.id}/receive`, {})).status).toBe(400);

    inv = (await api.post(`/supplier-invoices/${inv.id}/confirm`)).body.data.invoice;
    expect(inv.status).toBe('confirmed');
    // Confirmed and unpaid: owed, but no money has moved and nothing is a business expense.
    expect((await balanceOf()).currentBalance).toBe(5000);
    expect(await drawer()).toBe(0);
    expect(await prisma.expense.count({ where: { tenantId: tenant.id } })).toBe(0);

    // Receiving: part, then the rest; a third time adds nothing.
    inv = (await api.post(`/supplier-invoices/${inv.id}/receive`, { items: [{ itemId: inv.items[0].id, quantity: 4 }] })).body.data.invoice;
    expect((await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(6);
    expect((await api.post(`/supplier-invoices/${inv.id}/receive`, { items: [{ itemId: inv.items[0].id, quantity: 7 }] })).status).toBe(400);
    inv = (await api.post(`/supplier-invoices/${inv.id}/receive`, {})).body.data.invoice;
    expect((await api.post(`/supplier-invoices/${inv.id}/receive`, {})).status).toBe(400);
    const cableAfter = (await api.get(`/products/${cable.id}`)).body.data.product;
    expect([cableAfter.stockQuantity, cableAfter.costPrice]).toEqual([12, '300.00']);
    // The new product was created once, with its barcode, cost and selling price.
    const created = await prisma.product.findFirstOrThrow({ where: { tenantId: tenant.id, barcode: '6119999999990' } });
    expect([created.name, created.stockQuantity, Number(created.costPrice), Number(created.retailPrice)]).toEqual(['Écouteurs BT X2', 20, 100, 199]);
    expect(inv.items.map((i: any) => [i.quantityReceived, i.productId != null])).toEqual([[10, true], [20, true]]);
    expect(await prisma.inventoryMovement.count({ where: { tenantId: tenant.id, reference: inv.number } })).toBe(3);

    // Payments: 2,000 cash → 3,000 left; 1,000 transfer → 2,000; overpaying refused; 2,000 card → paid.
    inv = (await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 2000, method: 'cash', paidAt: today() })).body.data.invoice;
    expect([inv.remaining, inv.paymentStatus, await drawer()]).toEqual([3000, 'partial', -2000]);
    inv = (await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 1000, method: 'bank_transfer', reference: 'VIR-55' })).body.data.invoice;
    expect([inv.remaining, inv.paymentStatus, await drawer()]).toEqual([2000, 'partial', -2000]);
    expect((await balanceOf()).currentBalance).toBe(2000);
    expect((await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 2500, method: 'cash' })).status).toBe(400);
    inv = (await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 2000, method: 'card' })).body.data.invoice;
    expect([inv.remaining, inv.paymentStatus, Number(inv.amountPaid), await drawer()]).toEqual([0, 'paid', 5000, -2000]);
    expect((await api.post(`/supplier-invoices/${inv.id}/payments`, { amount: 1, method: 'cash' })).status).toBe(400);
    expect(inv.payments.map((p: any) => [Number(p.amount), p.method])).toEqual([[2000, 'cash'], [1000, 'bank_transfer'], [2000, 'card']]);

    // Editing cannot bring the total under what was paid, nor a received line under its received quantity.
    const edit = { ...invoice, items: inv.items.map((i: any) => ({ id: i.id, productId: i.productId, productName: i.productName, reference: i.reference, quantity: i.quantity, unitCost: Number(i.unitCost) })) };
    expect((await api.put(`/supplier-invoices/${inv.id}`, { ...edit, discount: 100 })).status).toBe(400);
    expect((await api.put(`/supplier-invoices/${inv.id}`, { ...edit, items: [{ ...edit.items[0], quantity: 5 }, edit.items[1]], extraCharges: 2000 })).status).toBe(400);
    // Changing the notes and terms of a paid invoice does not touch stock or money.
    inv = (await api.put(`/supplier-invoices/${inv.id}`, { ...edit, notes: 'Livré complet' })).body.data.invoice;
    expect([inv.notes, inv.remaining, (await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity, await drawer()]).toEqual(['Livré complet', 0, 12, -2000]);

    // Supplier totals, statement, dashboard and report.
    const s = await balanceOf();
    expect([s.totalPurchased, s.totalPaid, s.currentBalance]).toEqual([5000, 5000, 0]);
    const st = (await api.get(`/suppliers/${supplier.id}/statement`)).body.data;
    expect(st.entries.map((e: any) => [e.kind, e.debit, e.credit, e.balance])).toEqual([
      ['invoice', 5000, 0, 5000],
      ['payment', 0, 2000, 3000],
      ['payment', 0, 1000, 2000],
      ['payment', 0, 2000, 0],
    ]);
    expect(st.totals).toEqual({ purchases: 5000, paid: 5000, outstanding: 0, overdue: 0 });
    expect((await api.get('/dashboard/kpis')).body.data.kpis.supplierDebt.total).toBe(0);
    const rep = (await api.get(`/reports?type=suppliers&startDate=${today()}&endDate=${today()}`)).body.data.report;
    expect([rep.summary.totalSpent, rep.summary.totalDebt]).toEqual([5000, 0]);
    // Purchases are not expenses: net profit untouched.
    expect((await api.get('/dashboard/kpis')).body.data.kpis.profitBreakdown.totals.directExpenses).toBe(0);

    // Voiding the cash payment puts the money back and reopens the balance; the history keeps it.
    const cashPay = inv.payments.find((p: any) => p.method === 'cash');
    inv = (await api.post(`/supplier-invoices/${inv.id}/payments/${cashPay.id}/void`, { reason: 'Erreur de saisie' })).body.data.invoice;
    expect([inv.remaining, inv.paymentStatus, await drawer(), inv.payments.length]).toEqual([2000, 'partial', 0, 3]);
    expect((await api.post(`/supplier-invoices/${inv.id}/payments/${cashPay.id}/void`)).status).toBe(400);
    expect((await balanceOf()).currentBalance).toBe(2000);
    const moves = (await api.get(`/stores/${(await prisma.store.findFirstOrThrow({ where: { tenantId: tenant.id } })).id}/caisse`)).body.data.movements;
    expect(moves.map((m: any) => [m.type, Number(m.amount), m.reason])).toEqual([
      ['cash_in', 2000, `Annulation paiement fournisseur - ${inv.number}`],
      ['cash_out', 2000, `Paiement fournisseur - ${inv.number}`],
    ]);
    // Cancelling is refused while payments remain.
    expect((await api.post(`/supplier-invoices/${inv.id}/cancel`)).status).toBe(400);
  });

  it('lists, filters and flags overdue invoices; drafts can be deleted, confirmed ones cancelled', async () => {
    const { api, supplier, cable } = await setup();
    const other = (await api.post('/suppliers', { name: 'Casa Tech' })).body.data.supplier;
    const line = { productId: cable.id, productName: cable.name, quantity: 1, unitCost: 100 };
    const late = (await api.post('/supplier-invoices', { supplierId: supplier.id, invoiceDate: daysAgo(40), dueDate: daysAgo(10), items: [line], confirm: true })).body.data.invoice;
    const current = (await api.post('/supplier-invoices', { supplierId: supplier.id, invoiceDate: today(), dueDate: daysAgo(-10), items: [{ ...line, quantity: 3 }], taxRate: 20, extraCharges: 40, confirm: true })).body.data.invoice;
    expect([Number(current.subtotal), Number(current.taxAmount), Number(current.total)]).toEqual([300, 60, 400]);
    const draft = (await api.post('/supplier-invoices', { supplierId: other.id, invoiceDate: today(), items: [line] })).body.data.invoice;
    expect(late.overdue).toBe(true);

    const list = async (qs: string) => (await api.get(`/supplier-invoices?${qs}`)).body.data;
    expect((await list('paymentStatus=overdue')).invoices.map((i: any) => i.id)).toEqual([late.id]);
    expect((await list(`supplierId=${other.id}`)).invoices.map((i: any) => i.id)).toEqual([draft.id]);
    expect((await list('status=draft')).meta.total).toBe(1);
    expect((await list(`dateFrom=${today()}&dateTo=${today()}`)).meta.total).toBe(2);
    expect((await list('query=Casa')).invoices.map((i: any) => i.id)).toEqual([draft.id]);
    expect((await list('')).totals).toEqual({ count: 2, total: 500, paid: 0, remaining: 500, overdue: 100 });

    const st = (await api.get(`/suppliers/${supplier.id}/statement?dateFrom=${today()}&dateTo=${today()}`)).body.data;
    expect([st.openingBalance, st.period.purchases, st.period.closingBalance, st.totals.overdue]).toEqual([100, 400, 500, 100]);
    expect(st.overdueInvoices.map((i: any) => i.number)).toEqual([late.number]);
    expect((await api.get(`/suppliers/${supplier.id}`)).body.data.supplier).toMatchObject({ currentBalance: 500, overdue: 100, overdueCount: 1 });

    expect((await api.delete(`/supplier-invoices/${late.id}`)).status).toBe(400);
    expect((await api.delete(`/supplier-invoices/${draft.id}`)).status).toBe(200);
    const cancelled = (await api.post(`/supplier-invoices/${late.id}/cancel`, { reason: 'Doublon' })).body.data.invoice;
    expect([cancelled.status, cancelled.cancelReason]).toEqual(['cancelled', 'Doublon']);
    expect((await api.get(`/suppliers/${supplier.id}`)).body.data.supplier.currentBalance).toBe(400);
    expect((await api.post(`/supplier-invoices/${late.id}/payments`, { amount: 1, method: 'cash' })).status).toBe(400);
  });

  it('invoicing a purchase order moves its debt and payments to the invoice without counting them twice', async () => {
    const { api, supplier, cable, drawer, balanceOf } = await setup();
    const order = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: cable.id, productName: cable.name, quantityOrdered: 5, unitCost: 200 }] })).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);
    await api.post(`/supplier-orders/${order.id}/receive`, { items: [{ itemId: order.items[0].id, quantityReceived: 5 }], paymentAmount: 300 });
    expect([(await balanceOf()).currentBalance, await drawer()]).toEqual([700, -300]);

    let inv = (await api.post(`/supplier-invoices/from-order/${order.id}`)).body.data.invoice;
    expect([Number(inv.total), inv.supplierOrder.orderNumber, inv.items[0].quantity]).toEqual([1000, order.orderNumber, 5]);
    expect((await api.post(`/supplier-invoices/from-order/${order.id}`)).status).toBe(409);
    // Delivery charges added by the supplier on the invoice.
    const items = inv.items.map((i: any) => ({ id: i.id, productId: i.productId, productName: i.productName, reference: i.reference, quantity: i.quantity, unitCost: Number(i.unitCost) }));
    inv = (await api.put(`/supplier-invoices/${inv.id}`, { supplierId: supplier.id, invoiceDate: today(), items, extraCharges: 50, extraChargesLabel: 'Livraison' })).body.data.invoice;
    inv = (await api.post(`/supplier-invoices/${inv.id}/confirm`)).body.data.invoice;
    // The 300 already paid on the order is on the invoice (no new drawer movement); stock is not received again.
    expect([Number(inv.total), Number(inv.amountPaid), inv.remaining, await drawer()]).toEqual([1050, 300, 750, -300]);
    expect(inv.payments.map((p: any) => [Number(p.amount), p.fromOrder])).toEqual([[300, true]]);
    expect((await api.post(`/supplier-invoices/${inv.id}/receive`, {})).status).toBe(400);
    expect((await api.get(`/products/${cable.id}`)).body.data.product.stockQuantity).toBe(7);
    const s = await balanceOf();
    expect([s.totalPurchased, s.totalPaid, s.currentBalance]).toEqual([1050, 300, 750]);
    // The order is now paid through its invoice.
    expect((await api.post(`/supplier-orders/${order.id}/payment`, { amount: 100 })).status).toBe(400);
    expect((await api.get(`/supplier-orders/${order.id}`)).body.data.order.invoice.number).toBe(inv.number);
    const st = (await api.get(`/suppliers/${supplier.id}/statement`)).body.data;
    expect(st.entries.map((e: any) => [e.kind, e.debit, e.credit])).toEqual([['invoice', 1050, 0], ['payment', 0, 300]]);

    // Cancelling the invoice gives the debt back to the order.
    await api.post(`/supplier-invoices/${inv.id}/cancel`);
    const back = await balanceOf();
    expect([back.totalPurchased, back.currentBalance, await drawer()]).toEqual([1000, 700, -300]);
  });
});

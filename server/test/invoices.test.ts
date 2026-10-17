import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { formatInvoiceNumber, numbering } from '../src/lib/invoices.js';
import { newTenant } from './helpers.js';

const year = new Date().getFullYear();
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function setup(legalStatus: string | null = 'auto_entrepreneur') {
  const t = await newTenant();
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { legalStatus } });
  const product = (await t.api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 100 })).body.data.product;
  const customer = (await t.api.post('/customers', { firstName: 'Walid', lastName: 'A', ice: '001234567000089', address: 'Rue 1' })).body.data.customer;
  const sell = (body: Record<string, unknown> = {}) =>
    t.api.post('/checkout', { items: [{ productId: product.id, quantity: 2, unitPrice: 50 }], payments: [{ method: 'cash', amount: 100 }], ...body });
  return { ...t, product, customer, sell };
}

describe('invoices', () => {
  it('formats numbers from the tenant settings', () => {
    expect(formatInvoiceNumber(numbering('{}'), 7, new Date(2026, 0, 1))).toBe('FAC-2026-0007');
    expect(formatInvoiceNumber(numbering('{"invoicePrefix":"F","invoiceYearFormat":"YY","invoiceSeparator":"/","invoiceDigits":3}'), 12, new Date(2026, 0, 1))).toBe('F/26/012');
  });

  it('is off for shops without a legal status: no invoices from sales', async () => {
    const { api, sell } = await setup(null);
    await sell();
    expect((await api.get('/invoices')).body.data.invoices).toHaveLength(0);
  });

  it('generates one numbered invoice per sale, flags walk-in sales and follows cancellations', async () => {
    const { api, sell, customer } = await setup();
    const a = (await sell({ customerId: customer.id })).body.data.transaction;
    const b = (await sell()).body.data.transaction;
    let list = (await api.get('/invoices')).body.data;
    expect(list.total).toBe(2);
    const [second, first] = list.invoices;
    expect(first.invoiceNumber).toBe(`FAC-${year}-0001`);
    expect(second.invoiceNumber).toBe(`FAC-${year}-0002`);
    expect([first.type, first.transactionNumber, first.customer.fullName, first.customerTaxId, first.totalAmount]).toEqual([
      'transaction', a.transactionNumber, 'Walid A', '001234567000089', '100.00',
    ]);
    expect(first.items).toEqual([expect.objectContaining({ description: 'Coque', quantity: 2, unitPrice: 50, subtotal: 100 })]);
    expect(second.customer).toBeNull();
    // Listing again does not duplicate.
    expect((await api.get('/invoices')).body.data.total).toBe(2);

    // Fix the walk-in sale's customer, reset its invoice: it comes back with the customer and a new number.
    await api.patch(`/transactions/${b.id}/correct`, { customerId: customer.id });
    await api.delete(`/invoices/${second.id}`);
    list = (await api.get('/invoices')).body.data;
    const regenerated = list.invoices.find((i: any) => i.transactionId === b.id);
    expect([regenerated.invoiceNumber, regenerated.customer?.fullName]).toEqual([`FAC-${year}-0003`, 'Walid A']);

    await api.post(`/transactions/${a.id}/cancel`, { reason: 'test' });
    expect((await api.get('/invoices')).body.data.invoices.map((i: any) => i.transactionId)).toEqual([b.id]);
  });

  it('standalone invoices: create, edit, search, delete', async () => {
    const { api, customer } = await setup();
    expect((await api.post('/invoices/standalone', { items: [] })).status).toBe(400);
    const r = await api.post('/invoices/standalone', {
      customerId: customer.id,
      items: [{ description: 'Réparation écran', quantity: 1, unitPrice: 400 }, { description: 'Verre trempé', quantity: 2, unitPrice: 50 }],
      discountAmount: 25,
      notes: 'Merci',
    });
    expect(r.status).toBe(201);
    let inv = r.body.data.invoice;
    expect([inv.type, inv.subtotal, inv.discountAmount, inv.totalAmount, inv.taxAmount]).toEqual(['standalone', '500.00', '25.00', '475.00', '0.00']);
    inv = (await api.patch(`/invoices/standalone/${inv.id}`, { items: [{ description: 'Réparation écran', quantity: 1, unitPrice: 300 }] })).body.data.invoice;
    expect([inv.totalAmount, inv.customer, inv.notes]).toEqual(['300.00', null, null]);
    expect((await api.get('/invoices?query=walid')).body.data.total).toBe(0);
    expect((await api.get(`/invoices?query=${inv.invoiceNumber}`)).body.data.total).toBe(1);
    expect((await api.get('/invoices?type=standalone')).body.data.total).toBe(1);
    expect((await api.get(`/invoices/${inv.id}`)).body.data.invoice.items).toHaveLength(1);
    expect((await api.delete(`/invoices/standalone/${inv.id}`)).status).toBe(200);
    expect((await api.get(`/invoices/${inv.id}`)).status).toBe(404);
  });

  it('archived invoices leave the list and every tax summary', async () => {
    const { api, sell } = await setup();
    await sell();
    await sell();
    const today = localDay();
    const [x] = (await api.get('/invoices')).body.data.invoices;
    let ir = (await api.post('/invoices/ir/calculate-period', { dateFrom: today, dateTo: today })).body.data;
    expect([ir.totalRevenue, ir.invoiceCount, ir.flatTaxRate, ir.irAmount]).toEqual([200, 2, 1, 2]);
    await api.patch(`/invoices/${x.id}/archive`);
    expect((await api.get('/invoices')).body.data.total).toBe(1);
    expect((await api.get('/invoices?isArchived=true')).body.data.invoices[0].id).toBe(x.id);
    ir = (await api.post('/invoices/ir/calculate-period', { dateFrom: today, dateTo: today })).body.data;
    expect([ir.totalRevenue, ir.invoiceCount]).toEqual([100, 1]);
    const q = (await api.get(`/invoices/quarterly-totals?year=${year}`)).body.data;
    expect([q.year, q.quarters.length, q.totalTTC, q.invoiceCount]).toEqual([year, 4, 100, 1]);
    expect(q.quarters[Math.floor(new Date().getMonth() / 3)]).toEqual(expect.objectContaining({ totalTTC: 100, totalHT: 100, totalTax: 0, invoiceCount: 1 }));
    await api.patch(`/invoices/${x.id}/unarchive`);
    expect((await api.get('/invoices')).body.data.total).toBe(2);
    expect((await api.post('/invoices/tva/calculate-period', { dateFrom: today, dateTo: '2000-01-01' })).status).toBe(400);
  });

  it('TVA summary uses the tax charged on sales', async () => {
    const { api, sell, tenant } = await setup('sarl');
    await prisma.tenant.update({ where: { id: tenant.id }, data: { applyTva: true } });
    await sell({ taxRate: 20, payments: [{ method: 'cash', amount: 120 }] });
    const today = localDay();
    const tva = (await api.post('/invoices/tva/calculate-period', { dateFrom: today, dateTo: today })).body.data;
    expect([tva.totalSales, tva.totalTax, tva.invoiceCount, tva.breakdown[0].rate]).toEqual([100, 20, 1, 20]);
  });
});

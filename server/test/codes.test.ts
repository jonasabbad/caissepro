import { describe, expect, it } from 'vitest';
import { categoryId, getApp, newTenant } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';
import { backfillCodes, isEan13 } from '../src/lib/codes.js';

const base = async () => ({ categoryId: await categoryId('coques-protections'), costPrice: 10, retailPrice: 30 });

describe('product barcodes', () => {
  it('generates a unique EAN-13 for new products and keeps a given one', async () => {
    const { api } = await newTenant();
    const a = (await api.post('/products', { ...(await base()), name: 'Coque A' })).body.data.product;
    const b = (await api.post('/products', { ...(await base()), name: 'Coque B' })).body.data.product;
    expect(isEan13(a.barcode)).toBe(true);
    expect(a.barcode.startsWith('20')).toBe(true);
    expect(a.barcode).not.toBe(b.barcode);
    const own = (await api.post('/products', { ...(await base()), name: 'Coque C', barcode: '6111234567890' })).body.data.product;
    expect(own.barcode).toBe('6111234567890');
    // Bulk creation (size/colour variants) gets one barcode per variant.
    const bulk = (await api.post('/products/bulk', { products: [{ ...(await base()), name: 'T-shirt S' }, { ...(await base()), name: 'T-shirt M' }] })).body.data.products;
    expect(new Set(bulk.map((p: any) => p.barcode)).size).toBe(2);
    // Scanning finds the product.
    expect((await api.get(`/products/barcode/${a.barcode}`)).body.data.product.id).toBe(a.id);
  });

  it('refuses duplicates, including archived products and within a bulk batch', async () => {
    const { api } = await newTenant();
    const p = (await api.post('/products', { ...(await base()), name: 'Câble', barcode: '6110000000001' })).body.data.product;
    expect((await api.post('/products', { ...(await base()), name: 'Autre', barcode: '6110000000001' })).status).toBe(409);
    await api.post(`/products/${p.id}/archive`);
    expect((await api.post('/products', { ...(await base()), name: 'Encore', barcode: '6110000000001' })).status).toBe(409);
    const other = (await api.post('/products', { ...(await base()), name: 'X' })).body.data.product;
    expect((await api.put(`/products/${other.id}`, { barcode: '6110000000001' })).status).toBe(409);
    const bulk = await api.post('/products/bulk', { products: [{ ...(await base()), name: 'B1', barcode: '6110000000002' }, { ...(await base()), name: 'B2', barcode: '6110000000002' }] });
    expect(bulk.status).toBe(409);
    // Clearing a barcode gives a new generated one.
    const cleared = (await api.put(`/products/${other.id}`, { barcode: '' })).body.data.product;
    expect(isEan13(cleared.barcode)).toBe(true);
    expect(cleared.barcode).not.toBe(other.barcode);
    // Another business may use the same code.
    const second = await newTenant();
    expect((await second.api.post('/products', { ...(await base()), name: 'Same', barcode: '6110000000001' })).status).toBe(200);
  });

  it('backfills products without a barcode', async () => {
    const { api, tenant } = await newTenant();
    const p = (await api.post('/products', { ...(await base()), name: 'Old' })).body.data.product;
    await prisma.product.update({ where: { id: p.id }, data: { barcode: null } });
    await backfillCodes();
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(isEan13(after.barcode!)).toBe(true);
    expect(after.tenantId).toBe(tenant.id);
  });
});

describe('repair tracking', () => {
  it('gives each repair a tracking token and a public status page without personal data', async () => {
    const { api } = await newTenant();
    const customer = (await api.post('/customers', { firstName: 'Sara', lastName: 'B', phone: '0611223344' })).body.data.customer;
    const eta = '2026-10-20T12:00:00.000Z';
    const r = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'iPhone 12 - écran', fixedPrice: 500, estimatedCompletionAt: eta })).body.data.repair;
    expect(r.trackingToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const r2 = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'Galaxy', fixedPrice: 0 })).body.data.repair;
    expect(r2.trackingToken).not.toBe(r.trackingToken);

    const app = await getApp();
    const pub = await app.inject({ method: 'GET', url: `/api/v1/public/repairs/${r.trackingToken}` });
    expect(pub.statusCode).toBe(200);
    const body = pub.json().data;
    expect(body.repair).toMatchObject({ repairNumber: r.repairNumber, status: 'pending', estimatedCompletionAt: eta });
    const text = JSON.stringify(body);
    for (const secret of ['Sara', '0611223344', '500', customer.id]) expect(text).not.toContain(secret);

    await api.patch(`/repairs/${r.id}/status`, { status: 'in_progress' });
    const moved = await app.inject({ method: 'GET', url: `/api/v1/public/repairs/${r.trackingToken}` });
    expect(moved.json().data.repair.status).toBe('in_progress');
    // Changing the estimate is reflected.
    await api.put(`/repairs/${r.id}`, { estimatedCompletionAt: '2026-10-22T12:00:00.000Z' });
    expect((await app.inject({ method: 'GET', url: `/api/v1/public/repairs/${r.trackingToken}` })).json().data.repair.estimatedCompletionAt).toBe('2026-10-22T12:00:00.000Z');

    expect((await app.inject({ method: 'GET', url: '/api/v1/public/repairs/not-a-real-token-123456' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/v1/public/repairs/${r.id}` })).statusCode).toBe(404);
  });
});

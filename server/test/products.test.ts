import { describe, expect, it } from 'vitest';
import { categoryId, newTenant } from './helpers.js';

describe('products & stock', () => {
  it('creates a product with initial stock and records an INITIAL movement', async () => {
    const { api } = await newTenant();
    const res = await api.post('/products', {
      name: 'Câble USB-C 1m',
      categoryId: await categoryId('chargeurs-cables'),
      costPrice: 6,
      retailPrice: 25,
      stockQuantity: 20,
      minStockLevel: 5,
      barcode: '6001',
    });
    expect(res.status).toBe(200);
    const p = res.body.data.product;
    expect(p.sku).toMatch(/^PRD-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect(p.costPrice).toBe('6.00');
    expect(p.stockQuantity).toBe(20);
    expect(p.status).toBe('available');
    expect(p.category.slug).toBe('chargeurs-cables');

    const mv = await api.get('/inventory-movements');
    const m = mv.body.data.movements[0];
    expect([m.type, m.quantity, m.previousQuantity, m.newQuantity, m.reference, m.notes]).toEqual([
      'adjustment', 20, 0, 20, 'INITIAL', 'Initial stock entry',
    ]);
    expect(m.creator.firstName).toBe('Test');
    expect(m.creator.passwordHash).toBeUndefined();
  });

  it('computes status from stock vs minimum and filters by status/search', async () => {
    const { api } = await newTenant();
    const cat = await categoryId('chargeurs-cables');
    await api.post('/products', { name: 'Zero', categoryId: cat, costPrice: 1, retailPrice: 2, stockQuantity: 0 });
    await api.post('/products', { name: 'Low', categoryId: cat, costPrice: 1, retailPrice: 2, stockQuantity: 3, minStockLevel: 5 });
    await api.post('/products', { name: 'Plenty', categoryId: cat, costPrice: 1, retailPrice: 2, stockQuantity: 30, sku: 'MYSKU-1' });

    const all = await api.get('/products');
    const byName = Object.fromEntries(all.body.data.products.map((p: any) => [p.name, p.status]));
    expect(byName).toEqual({ Zero: 'out_of_stock', Low: 'low_stock', Plenty: 'available' });

    expect((await api.get('/products?status=low_stock')).body.data.products.map((p: any) => p.name)).toEqual(['Low']);
    expect((await api.get('/products?query=mysku')).body.data.products.map((p: any) => p.name)).toEqual(['Plenty']);
    expect((await api.get('/products/low-stock?limit=5')).body.data.products).toHaveLength(2);
  });

  it('adjusts stock (add/remove/set) and refuses to go negative', async () => {
    const { api } = await newTenant();
    const p = (await api.post('/products', { name: 'P', costPrice: 1, retailPrice: 2, stockQuantity: 10 })).body.data.product;

    let r = await api.post(`/products/${p.id}/adjust-stock`, { quantity: 5, reason: 'Inventaire', type: 'adjustment' });
    expect(r.body.data.product.stockQuantity).toBe(15);
    r = await api.post(`/products/${p.id}/adjust-stock`, { quantity: -15, reason: 'Vol/Perte' });
    expect(r.body.data.product.stockQuantity).toBe(0);
    expect(r.body.data.product.status).toBe('out_of_stock');
    r = await api.post(`/products/${p.id}/adjust-stock`, { quantity: -1, reason: 'x' });
    expect(r.status).toBe(400);

    const mv = (await api.get(`/inventory-movements?productId=${p.id}`)).body.data.movements;
    expect(mv.map((m: any) => m.quantity)).toEqual([-15, 5, 10]);
  });

  it('receiving boxes updates pack cost and unit cost', async () => {
    const { api } = await newTenant();
    const p = (
      await api.post('/products', { name: 'Verre trempé', costPrice: 2, retailPrice: 10, stockQuantity: 0, packSize: 10, packCostPrice: 20 })
    ).body.data.product;
    const r = await api.post(`/products/${p.id}/adjust-stock`, {
      quantity: 30,
      reason: 'Réception commande (3 boîtes de 10)',
      type: 'purchase',
      packCostPrice: 25,
    });
    const after = r.body.data.product;
    expect(after.stockQuantity).toBe(30);
    expect(after.packCostPrice).toBe('25.00');
    expect(after.costPrice).toBe('2.50');
    const mv = (await api.get('/inventory-movements?type=purchase')).body.data.movements;
    expect(mv[0].notes).toBe('Réception commande (3 boîtes de 10)');
  });

  it('rejects duplicate barcodes and unknown products; isolates tenants', async () => {
    const a = await newTenant();
    const b = await newTenant();
    const p = (await a.api.post('/products', { name: 'A', costPrice: 1, retailPrice: 2, barcode: 'DUP' })).body.data.product;
    expect((await a.api.post('/products', { name: 'B', costPrice: 1, retailPrice: 2, barcode: 'DUP' })).status).toBe(409);
    expect((await b.api.post('/products', { name: 'B', costPrice: 1, retailPrice: 2, barcode: 'DUP' })).status).toBe(200);
    expect((await b.api.get(`/products/${p.id}`)).status).toBe(404);
    expect((await a.api.get('/products/barcode/DUP')).body.data.product.id).toBe(p.id);
  });

  it('bulk creates variants and archives / deletes', async () => {
    const { api } = await newTenant();
    const res = await api.post('/products/bulk', {
      products: [
        { name: 'T-shirt – Noir – M', costPrice: 30, retailPrice: 80, stockQuantity: 2, variants: { color: 'Noir', size: 'M', group: 'g1' } },
        { name: 'T-shirt – Noir – L', costPrice: 30, retailPrice: 80, stockQuantity: 0, variants: { color: 'Noir', size: 'L', group: 'g1' } },
      ],
    });
    expect(res.body.data.products).toHaveLength(2);
    const id = res.body.data.products[0].id;
    expect((await api.post(`/products/${id}/archive`)).body.data.product.status).toBe('archived');
    expect((await api.get('/products')).body.data.products).toHaveLength(1);
    expect((await api.get('/products?status=archived')).body.data.products).toHaveLength(1);
    expect((await api.delete(`/products/${res.body.data.products[1].id}`)).body.data.deleted).toBe(true);
  });

  it('edits keep stock unchanged (stock only moves through adjustments)', async () => {
    const { api } = await newTenant();
    const p = (await api.post('/products', { name: 'P', costPrice: 1, retailPrice: 2, stockQuantity: 4 })).body.data.product;
    const r = await api.put(`/products/${p.id}`, { name: 'P2', costPrice: 1, retailPrice: 3, stockQuantity: 999, minStockLevel: 10 });
    expect(r.body.data.product.name).toBe('P2');
    expect(r.body.data.product.stockQuantity).toBe(4);
    expect(r.body.data.product.status).toBe('low_stock');
  });
});

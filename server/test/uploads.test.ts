import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryId, getApp, newTenant } from './helpers.js';
import { UPLOAD_DIR } from '../src/lib/uploads.js';

// Smallest valid images of each kind.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const fileOf = (url: string) => path.join(UPLOAD_DIR, ...url.replace('/uploads/', '').split('/'));

describe('product images', () => {
  it('stores an image, serves it with long caching, links it to a product and cleans up on replace', async () => {
    const { api, tenant } = await newTenant();
    const up = await api.post('/uploads/images', { dataUrl: PNG });
    expect(up.status).toBe(200);
    const url = up.body.data.url as string;
    expect(url).toMatch(new RegExp(`^/uploads/${tenant.id}/[0-9a-f-]+\\.png$`));

    const app = await getApp();
    const served = await app.inject({ method: 'GET', url });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(String(served.headers['cache-control'])).toContain('immutable');

    const created = await api.post('/products', {
      name: 'Coque iPhone 15',
      categoryId: await categoryId('coques-protections'),
      costPrice: 20,
      retailPrice: 60,
      imageUrl: url,
    });
    expect(created.status).toBe(200);
    const product = created.body.data.product;
    expect(product.imageUrl).toBe(url);
    expect((await api.get('/products')).body.data.products[0].imageUrl).toBe(url);

    // Replacing the image deletes the old file.
    const next = (await api.post('/uploads/images', { dataUrl: WEBP })).body.data.url as string;
    expect(next).toMatch(/\.webp$/);
    await api.put(`/products/${product.id}`, { imageUrl: next });
    expect(existsSync(fileOf(url))).toBe(false);
    expect(existsSync(fileOf(next))).toBe(true);

    // Removing it too; a product without an image is fine.
    const cleared = await api.put(`/products/${product.id}`, { imageUrl: null });
    expect(cleared.body.data.product.imageUrl).toBeNull();
    expect(existsSync(fileOf(next))).toBe(false);
    expect((await app.inject({ method: 'GET', url: next })).statusCode).toBe(404);
  });

  it('rejects non-images, mislabelled files and other tenants’ files', async () => {
    const { api } = await newTenant();
    const other = await newTenant();
    expect((await api.post('/uploads/images', { dataUrl: 'data:text/html;base64,PGgxPg==' })).status).toBe(400);
    // Claims to be PNG but is not.
    expect((await api.post('/uploads/images', { dataUrl: 'data:image/png;base64,PGgxPmhpPC9oMT4=' })).status).toBe(400);
    const theirs = (await other.api.post('/uploads/images', { dataUrl: PNG })).body.data.url;
    const res = await api.post('/products', { name: 'X', categoryId: await categoryId('coques-protections'), costPrice: 1, retailPrice: 2, imageUrl: theirs });
    expect(res.status).toBe(400);
    const js = await api.post('/products', { name: 'Y', categoryId: await categoryId('coques-protections'), costPrice: 1, retailPrice: 2, imageUrl: 'javascript:alert(1)' });
    expect(js.status).toBe(400);
  });
});

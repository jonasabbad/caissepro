import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

const phone = (over: Record<string, unknown> = {}) => ({
  deviceType: 'phone',
  brand: 'Apple',
  model: 'iPhone 11',
  storage: '64 GB',
  color: 'Black',
  condition: 'grade_a',
  imei: '490154203237518',
  batteryHealth: 87,
  purchasePrice: 2000,
  salePrice: 2600,
  hasWarranty: true,
  warrantyDays: 90,
  ...over,
});

describe('device catalogue', () => {
  it('lists brands, models and device specs per type', async () => {
    const { api } = await newTenant();
    const brands = (await api.get('/phone-seller/catalog/brands?deviceType=phone')).body.data.brands;
    expect(brands).toContain('Apple');
    expect(brands).toContain('Samsung');
    const models = (await api.get('/phone-seller/catalog/models?brand=Apple&deviceType=phone')).body.data.models;
    expect(models).toContain('iPhone 15');
    const dev = (await api.get('/phone-seller/catalog/device?brand=Apple&model=iPhone%2015&deviceType=phone')).body.data;
    expect(dev.device.year).toBe(2023);
    expect(dev.storageOptions).toEqual(['128 GB', '256 GB', '512 GB']);
    expect((await api.get('/phone-seller/catalog/brands?deviceType=macbook')).body.data.brands).toEqual(['Apple']);
    const unknown = (await api.get('/phone-seller/catalog/device?brand=Apple&model=Nope')).body.data;
    expect(unknown.device).toBeNull();
    expect((await api.get('/phone-seller/catalog/search?q=galaxy%20s24')).body.data.devices.length).toBeGreaterThan(0);
  });
});

describe('sold units (phones)', () => {
  it('creates a unit with an 8-char ref and computed profit; rejects duplicate IMEI', async () => {
    const { api } = await newTenant();
    const r = await api.post('/phone-seller/sold-units', phone());
    expect(r.status).toBe(201);
    const u = r.body.data.unit;
    expect(u.ref).toMatch(/^[A-Z0-9]{8}$/);
    expect(u.profit).toBe('600.00');
    expect(u.soldAt).toBeNull();
    const dup = await api.post('/phone-seller/sold-units', phone());
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Device with IMEI 490154203237518 already exists');
  });

  it('searches by ref, IMEI and multi-word brand/model; filters and filter options', async () => {
    const { api } = await newTenant();
    const a = (await api.post('/phone-seller/sold-units', phone())).body.data.unit;
    await api.post('/phone-seller/sold-units', phone({ imei: null, serialNumber: 'SN-1', model: 'iPhone 13', storage: '128 GB' }));
    await api.post('/phone-seller/sold-units', phone({ imei: null, serialNumber: 'SN-2', brand: 'Samsung', model: 'Galaxy S24', storage: '256 GB' }));

    const q = async (s: string) => (await api.get(`/phone-seller/sold-units?${s}`)).body.data.units.map((u: any) => u.model);
    expect(await q(`query=${a.ref}`)).toEqual(['iPhone 11']);
    expect(await q('query=49015420')).toEqual(['iPhone 11']);
    expect(await q('query=iphone%2013')).toEqual(['iPhone 13']);
    expect((await q('brand=Apple')).sort()).toEqual(['iPhone 11', 'iPhone 13']);
    expect(await q('storage=256%20GB')).toEqual(['Galaxy S24']);

    const fo = (await api.get('/phone-seller/sold-units/filter-options?brand=Apple')).body.data;
    expect(fo.models).toEqual(['iPhone 11', 'iPhone 13']);
    expect(fo.storage.sort()).toEqual(['128 GB', '64 GB']);
  });

  it('marks sold / returned, separates stock views, and blocks deleting sold units', async () => {
    const { api } = await newTenant();
    const u = (await api.post('/phone-seller/sold-units', phone())).body.data.unit;
    const sold = await api.post(`/phone-seller/sold-units/${u.id}/mark-sold`, {});
    expect(sold.body.data.unit.soldAt).not.toBeNull();
    expect(sold.body.data.unit.warrantyExpiresAt).not.toBeNull();
    expect((await api.get('/phone-seller/sold-units?sold=true')).body.data.units).toHaveLength(1);
    expect((await api.get('/phone-seller/sold-units?sold=false')).body.data.units).toHaveLength(0);
    expect((await api.get('/phone-seller/sold-units/inventory')).body.data.units).toHaveLength(0);
    expect((await api.get('/phone-seller/sold-units/sold')).body.data.meta.total).toBe(1);
    expect((await api.delete(`/phone-seller/sold-units/${u.id}`)).status).toBe(400);

    await api.post(`/phone-seller/sold-units/${u.id}/mark-returned`, {});
    expect((await api.get('/phone-seller/sold-units/available?brand=Apple&model=iPhone%2011&storage=64%20GB')).body.data.units).toHaveLength(1);
    expect((await api.delete(`/phone-seller/sold-units/${u.id}`)).body.data.deleted).toBe(true);
  });

  it('updates prices and recomputes profit', async () => {
    const { api } = await newTenant();
    const u = (await api.post('/phone-seller/sold-units', phone())).body.data.unit;
    const r = await api.put(`/phone-seller/sold-units/${u.id}`, { salePrice: 3000 });
    expect(r.body.data.unit.profit).toBe('1000.00');
    expect(r.body.data.unit.salePrice).toBe('3000.00');
  });
});

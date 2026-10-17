import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

describe('label templates', () => {
  it('creates defaults lazily, saves per category, resolves device variants and resets', async () => {
    const { api } = await newTenant();
    const su = (await api.get('/label-templates/__sold_units__')).body.data.template;
    expect([su.categoryId, su.isDefault, su.includeImei, su.template.width, su.template.barcodeType]).toEqual(['__sold_units__', true, true, 50, 'code128']);
    expect((await api.get('/label-templates')).body.data.templates).toHaveLength(0);

    const cat = 'cat-123';
    let tpl = (await api.put(`/label-templates/${cat}`, { includePrice: false, includeCompany: false, fontSize: 9, junk: 'x' })).body.data.template;
    expect([tpl.includePrice, tpl.includeCompany, tpl.fontSize, tpl.junk, tpl.isDefault]).toEqual([false, false, 9, undefined, false]);
    expect((await api.get('/label-templates')).body.data.templates.map((t: any) => t.categoryId)).toEqual([cat]);

    await api.put('/label-templates/sold-units/variants', { brand: 'Apple', includeBatteryHealth: true });
    await api.put('/label-templates/sold-units/variants', { brand: 'Apple', deviceType: 'laptop', includeImei: false });
    const variants = (await api.get('/label-templates/sold-units/variants')).body.data.variants;
    expect(variants).toHaveLength(2);
    const resolve = async (q: string) => (await api.get(`/label-templates/sold-units/resolve?${q}`)).body.data.template;
    expect((await resolve('brand=Apple&deviceType=laptop')).includeImei).toBe(false);
    expect((await resolve('brand=Apple&deviceType=phone')).includeBatteryHealth).toBe(true);
    expect((await resolve('brand=Samsung')).id).toBe(su.id);

    expect((await api.delete(`/label-templates/sold-units/variants/${variants[0].id}`)).status).toBe(200);
    expect((await api.delete(`/label-templates/sold-units/variants/${su.id}`)).status).toBe(404);
    tpl = (await api.post(`/label-templates/${cat}/reset`)).body.data.template;
    expect([tpl.includePrice, tpl.isDefault]).toEqual([true, true]);
  });
});

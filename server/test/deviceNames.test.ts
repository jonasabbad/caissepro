import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

type Api = Awaited<ReturnType<typeof newTenant>>['api'];

const brands = async (api: Api, deviceType = 'phone') => (await api.get(`/phone-seller/catalog/brands?deviceType=${deviceType}`)).body.data.brands as string[];
const models = async (api: Api, brand: string, deviceType = 'phone') =>
  (await api.get(`/phone-seller/catalog/models?brand=${encodeURIComponent(brand)}&deviceType=${deviceType}`)).body.data.models as string[];
const addDevice = async (api: Api, brand: string, model: string, deviceType = 'phone') => {
  const res = await api.post('/phone-seller/sold-units', { deviceType, brand, model, purchasePrice: 1000, salePrice: 1500 });
  expect(res.status).toBe(201);
  return res.body.data.unit as { id: string; brand: string; model: string };
};
const count = (list: string[], name: string) => list.filter((x) => x.toLowerCase().replace(/[\s-]+/g, '') === name.toLowerCase().replace(/[\s-]+/g, '')).length;

describe('brands and models: entered once, offered again, never duplicated', () => {
  it('a new model typed under an existing brand is saved under that brand and offered in the next forms', async () => {
    const { api } = await newTenant();
    expect(await models(api, 'Samsung')).not.toContain('Galaxy Z Demo 9');

    const unit = await addDevice(api, 'Samsung', 'Galaxy  Z Demo 9 ');
    expect([unit.brand, unit.model]).toEqual(['Samsung', 'Galaxy Z Demo 9']); // spaces tidied

    const list = await models(api, 'Samsung');
    expect(list).toContain('Galaxy Z Demo 9');
    expect(list).toContain('Galaxy S24'); // built-in models still there
    expect(await models(api, 'samsung')).toContain('Galaxy Z Demo 9'); // brand looked up in any case
    expect(await models(api, 'Samsung', 'tablet')).not.toContain('Galaxy Z Demo 9'); // only for its device type
    expect(await models(api, 'Apple')).not.toContain('Galaxy Z Demo 9'); // only under its brand
  });

  it('an existing model is reused: other case, spacing or dashes keep the known spelling, so no duplicate', async () => {
    const { api } = await newTenant();
    // Built-in model
    const a = await addDevice(api, 'apple', 'IPHONE 15-PRO');
    expect([a.brand, a.model]).toEqual(['Apple', 'iPhone 15 Pro']);
    expect(count(await models(api, 'Apple'), 'iPhone 15 Pro')).toBe(1);

    // Own model
    await addDevice(api, 'Samsung', 'Galaxy Demo X1');
    const b = await addDevice(api, 'SAMSUNG', 'galaxy demo-x1');
    expect([b.brand, b.model]).toEqual(['Samsung', 'Galaxy Demo X1']);
    expect(count(await models(api, 'Samsung'), 'Galaxy Demo X1')).toBe(1);

    // Editing a device to a spelling variant of a known model reuses it too
    const c = await addDevice(api, 'Samsung', 'Galaxy S24');
    const edited = (await api.put(`/phone-seller/sold-units/${c.id}`, { model: 'galaxy demo x1' })).body.data.unit;
    expect(edited.model).toBe('Galaxy Demo X1');
  });

  it('the same model name under two brands stays two models, each under its own brand', async () => {
    const { api } = await newTenant();
    const x = await addDevice(api, 'Demobrand', 'Note 7');
    const y = await addDevice(api, 'Otherbrand', 'NOTE 7');
    expect([x.brand, x.model, y.brand, y.model]).toEqual(['Demobrand', 'Note 7', 'Otherbrand', 'NOTE 7']); // not merged across brands
    expect(await models(api, 'Demobrand')).toEqual(['Note 7']);
    expect(await models(api, 'Otherbrand')).toEqual(['NOTE 7']);
  });

  it('a new brand is added once, offered for its device type, and reused whatever its spelling', async () => {
    const { api } = await newTenant();
    expect(await brands(api)).not.toContain('Zentro');
    await addDevice(api, 'Zentro', 'Z1');
    const again = await addDevice(api, ' zentro ', 'Z2');
    expect(again.brand).toBe('Zentro');

    const list = await brands(api);
    expect(count(list, 'Zentro')).toBe(1);
    expect(list).toContain('Apple'); // built-in brands kept
    expect(count(list, 'Apple')).toBe(1);
    expect(await models(api, 'Zentro')).toEqual(['Z1', 'Z2']);
    expect(await brands(api, 'laptop')).not.toContain('Zentro');
  });

  it("supplier order lines use and feed the same list; another business's names stay private", async () => {
    const t = await newTenant();
    const supplier = (await t.api.post('/suppliers', { name: 'Grossiste' })).body.data.supplier;
    const order = (
      await t.api.post('/supplier-orders', {
        supplierId: supplier.id,
        items: [{ itemType: 'unit', productName: 'Lot', quantityOrdered: 2, unitCost: 900, deviceType: 'phone', brand: 'xiaomi', model: 'redmi demo 5' }],
      })
    ).body.data.order;
    expect([order.items[0].brand, order.items[0].deviceModel]).toEqual(['Xiaomi', 'redmi demo 5']); // built-in brand spelling
    expect(await models(t.api, 'Xiaomi')).toContain('redmi demo 5'); // offered before any device is received

    const unit = await addDevice(t.api, 'Xiaomi', 'Redmi Demo-5');
    expect(unit.model).toBe('redmi demo 5'); // reuses the order line's model

    const other = await newTenant();
    expect(await models(other.api, 'Xiaomi')).not.toContain('redmi demo 5');
    expect(await brands(other.api)).toEqual(await brands((await newTenant()).api));
  });
});

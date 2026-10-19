import { describe, expect, it } from 'vitest';
import { isValidImei } from '../src/lib/tac.js';
import { newTenant } from './helpers.js';

function imeiFor(prefix14: string) {
  for (let c = 0; c <= 9; c++) if (isValidImei(prefix14 + c)) return prefix14 + c;
  throw new Error('no check digit');
}

describe('scan lookup', () => {
  it('finds products by barcode / SKU, devices by IMEI / serial / reference, and learned box barcodes', async () => {
    const { api } = await newTenant();
    const other = await newTenant();
    const product = (await api.post('/products', { name: 'Chargeur 25W', costPrice: 60, retailPrice: 149, stockQuantity: 7, barcode: '6111234567890' })).body.data.product;
    const imei = imeiFor('35846512345678');
    const unit = (
      await api.post('/phone-seller/sold-units', {
        brand: 'Apple', model: 'iPhone 15', storage: '128 GB', color: 'Black', imei, purchasePrice: 6000, salePrice: 7200, boxBarcode: '0195949038327',
      })
    ).body.data.unit;
    expect(unit).not.toHaveProperty('boxBarcode');

    const scan = async (code: string, a = api) => (await a.get(`/scan/${encodeURIComponent(code)}`)).body.data;

    // A product: its stored name, price and stock.
    let r = await scan('6111234567890');
    expect([r.found, r.products.map((p: any) => [p.id, p.retailPrice, p.stockQuantity]), r.units]).toEqual([true, [[product.id, '149.00', 7]], []]);
    expect((await scan(product.sku)).products[0].id).toBe(product.id);

    // An individual phone by IMEI, serial number or its printed reference: its own price, no identification needed.
    r = await scan(imei);
    expect([r.units.map((u: any) => [u.id, u.brand, u.model, u.salePrice]), r.imei]).toEqual([[[unit.id, 'Apple', 'iPhone 15', '7200.00']], null]);
    expect((await scan(unit.ref.toLowerCase())).units[0].id).toBe(unit.id);

    // The box barcode identifies the model (with storage / colour), learned from the device added with it — no price.
    r = await scan('0195949038327');
    expect(r.modelBarcode).toMatchObject({ brand: 'Apple', model: 'iPhone 15', storage: '128 GB', color: 'Black' });
    expect(r.modelBarcode).not.toHaveProperty('salePrice');

    // An IMEI that is not in stock: identification only (here: the model learned from the first iPhone 15).
    r = await scan(imeiFor('35846512999999'));
    expect([r.found, r.looksLikeImei, r.imei.device.model, r.imei.device.source]).toEqual([false, true, 'iPhone 15', 'own']);

    // Unknown code: nothing invented.
    r = await scan('4006381333931');
    expect([r.found, r.products, r.units, r.modelBarcode, r.imei]).toEqual([false, [], [], null, null]);
    expect((await api.get('/scan/%20%20')).status).toBe(400);

    // Another business sees none of it.
    r = await scan('0195949038327', other.api);
    expect([r.found, r.modelBarcode]).toEqual([false, null]);
    expect((await scan(imei, other.api)).units).toEqual([]);

    // Linking a box barcode by hand.
    await api.put('/scan/model-barcodes', { code: '8806095299000', brand: 'Samsung', model: 'Galaxy S24', storage: '256 GB' });
    expect((await scan('8806095299000')).modelBarcode).toMatchObject({ brand: 'Samsung', model: 'Galaxy S24', storage: '256 GB' });
  });

  it('a scanned product sold twice in the POS leaves exact stock', async () => {
    const { api } = await newTenant();
    const p = (await api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 5, barcode: '6119990001112' })).body.data.product;
    const found = (await api.get('/scan/6119990001112')).body.data.products[0];
    await api.post('/checkout', { items: [{ productId: found.id, quantity: 2, unitPrice: Number(found.retailPrice) }], payments: [{ method: 'cash', amount: 100 }] });
    const after = (await api.get('/scan/6119990001112')).body.data.products[0];
    expect([after.id, after.stockQuantity]).toEqual([p.id, 3]);
  });
});

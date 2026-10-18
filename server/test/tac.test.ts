import { describe, expect, it } from 'vitest';
import { importTacRows, isValidImei, matchCatalog, parseTacCsv } from '../src/lib/tac.js';
import { newTenant } from './helpers.js';

/** A valid IMEI for a TAC: 6 serial digits + Luhn check digit. */
function imeiFor(tac: string, serial = '123456') {
  const body = tac + serial;
  for (let c = 0; c <= 9; c++) if (isValidImei(body + c)) return body + c;
  throw new Error('no check digit');
}
// Unique TACs per run (the test database is shared between files).
const uniq = () => String(10000000 + Math.floor(Math.random() * 89999999)).slice(0, 8);

describe('IMEI → device identification (TAC)', () => {
  it('validates the IMEI check digit', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false);
    expect(isValidImei('49015420323751')).toBe(false);
    expect(isValidImei('49015420323751a')).toBe(false);
  });

  it('learns from the devices a business saves, privately, and never needs the full IMEI', async () => {
    const { api } = await newTenant();
    const other = await newTenant();
    const tac = uniq();
    expect((await api.get(`/phone-seller/sold-units/tac/${tac}`)).body.data).toEqual({ found: false, device: null });
    expect((await api.get('/phone-seller/sold-units/tac/1234')).status).toBe(400);

    await api.post('/phone-seller/sold-units', { brand: 'Samsung', model: 'Galaxy S24 Ultra', imei: imeiFor(tac), purchasePrice: 8000, salePrice: 9500, storage: '512 GB' });
    const found = (await api.get(`/phone-seller/sold-units/tac/${tac}`)).body.data;
    expect(found.found).toBe(true);
    expect(found.device).toMatchObject({ brand: 'Samsung', model: 'Galaxy S24 Ultra', source: 'own', inCatalog: true });
    // Nothing that a TAC does not determine, and never the IMEI.
    expect(JSON.stringify(found)).not.toMatch(/imei|storage|512/i);
    // Another business does not see it.
    expect((await other.api.get(`/phone-seller/sold-units/tac/${tac}`)).body.data.found).toBe(false);

    // A correction on the device updates what is remembered.
    const tac2 = uniq();
    const u = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 14', imei: imeiFor(tac2), purchasePrice: 1, salePrice: 2 })).body.data.unit;
    await api.put(`/phone-seller/sold-units/${u.id}`, { model: 'iPhone 14 Plus' });
    expect((await api.get(`/phone-seller/sold-units/tac/${tac2}`)).body.data.device.model).toBe('iPhone 14 Plus');
  });

  it('imports reference TAC files, maps names to the catalogue and lets own records win', async () => {
    const { api } = await newTenant();
    const [t1, t2, t3, t4] = [uniq(), uniq(), uniq(), uniq()];
    const csv = [
      '"tac","name1","name2","contributor"',
      `"${t1}","Apple","iPhone 15 Pro (A2848)","x"`,
      `"${t2}","Samsung Korea","SM-S921B Galaxy S24","x"`,
      `"${t3}","Samsung","Galaxy Z Phone 99","x"`,
      `"bad","Apple","iPhone","x"`,
      `"${t4}","Nokia","3310","x"`,
    ].join('\n');
    const rows = parseTacCsv(csv);
    expect(rows.map((r) => [r.brand, r.modelNumber])).toEqual([['Apple', 'A2848'], ['Samsung', 'SM-S921B'], ['Samsung', null], ['Nokia', null]]);
    expect(await importTacRows(rows, 'Test TAC file (fixture)')).toBe(4);

    const look = async (t: string) => (await api.get(`/phone-seller/sold-units/tac/${t}`)).body.data.device;
    expect(await look(t1)).toMatchObject({ brand: 'Apple', model: 'iPhone 15 Pro', modelNumber: 'A2848', inCatalog: true, source: 'reference', sourceName: 'Test TAC file (fixture)' });
    expect(await look(t2)).toMatchObject({ brand: 'Samsung', model: 'Galaxy S24', modelNumber: 'SM-S921B', inCatalog: true });
    // Not in the catalogue: the source's own name, flagged.
    expect(await look(t3)).toMatchObject({ brand: 'Samsung', model: 'Galaxy Z Phone 99', inCatalog: false });

    // The business's own device for that TAC takes precedence over the reference file.
    await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 15 Pro Max', imei: imeiFor(t1), purchasePrice: 1, salePrice: 2 });
    expect(await look(t1)).toMatchObject({ model: 'iPhone 15 Pro Max', source: 'own' });

    // Importing the same source again replaces its rows.
    await importTacRows(parseTacCsv(`tac,brand,model\n${t2},Samsung,Galaxy S24+`), 'Test TAC file (fixture)');
    expect([(await look(t2)).model, await look(t4)]).toEqual(['Galaxy S24+', null]);
  });

  it('matches names from TAC sources to catalogue models', () => {
    expect(matchCatalog('Samsung', 'Galaxy S24 Ultra 5G (SM-S928B/DS)')?.model).toBe('Galaxy S24 Ultra');
    expect(matchCatalog('Apple', 'iPhone 15')?.model).toBe('iPhone 15');
    expect(matchCatalog('Apple', 'iPhone 99')).toBeNull();
  });
});

describe('TAC files', () => {
  it('reads the CSV and JSON shapes, with or without known headers, and reports coverage', async () => {
    const { parseTacFile, tacCoverage } = await import('../src/lib/tac.js');
    // Unknown header names: columns found from the contents.
    const csv = 'code;maker;device;extra\n35395010;Apple;iPhone 15 Pro (A2848);x\n35000011;Samsung;Galaxy S24 Ultra 5G (SM-S928B);y\nbad;Nokia;3310;z';
    expect(parseTacFile(csv, 'x.csv').map((r) => [r.tac, r.brand, r.model])).toEqual([
      ['35395010', 'Apple', 'iPhone 15 Pro (A2848)'],
      ['35000011', 'Samsung', 'Galaxy S24 Ultra 5G (SM-S928B)'],
    ]);
    // No header line at all.
    expect(parseTacFile('35395010,Apple,iPhone 15\n35395011,Apple,iPhone 15', 'x.csv')).toHaveLength(2);
    // Records.
    expect(parseTacFile(JSON.stringify([{ tac: '35395012', manufacturer: 'Apple Inc', marketing_name: 'iPhone 14' }]), 'x.json')[0]).toMatchObject({ brand: 'Apple', model: 'iPhone 14' });
    // Brand → models → tacs tree.
    const tree = { brands: { Apple: { models: [{ 'iPhone 13': { tacs: ['35395013', '35395014'] } }] }, Samsung: { models: [{ 'Galaxy S23': { tacs: ['35000012'] } }] } } };
    expect(parseTacFile(JSON.stringify(tree), 'x.json').map((r) => [r.tac, r.brand, r.model])).toEqual([
      ['35395013', 'Apple', 'iPhone 13'],
      ['35395014', 'Apple', 'iPhone 13'],
      ['35000012', 'Samsung', 'Galaxy S23'],
    ]);
    const cov = tacCoverage(parseTacFile(csv, 'x.csv'));
    expect([cov.tacs, cov.apple.tacs, cov.apple.mappedToCatalog, cov.samsung.catalogModelsCovered]).toEqual([2, 1, 1, 1]);
    expect(cov.apple.missing).toContain('iPhone 14');
    expect(() => parseTacFile('a,b\nx,y', 'x.csv')).toThrow(/Unrecognised/);
  });
});

describe('Osmocom TAC export', () => {
  it('reads the real export layout and resolves only what the records support', async () => {
    const { parseTacFile, resolveModel } = await import('../src/lib/tac.js');
    const file = [
      'Osmocom TAC database under CC-BY-SA v3.0 (c) Harald Welte 2016',
      'tac,name,name,contributor,comment,gsmarena,gsmarena,aka',
      '01242200,Apple,iPhone 4,,,http://x,http://y,"iPhone 4 16GB,iPhone 4 32GB"',
      '35915207,Apple,iPhone 7 A1778 TD-LTE 32GB,Ryd,,,,',
      '35067889,Samsung,SM-A515F/DSN,tacdb submission,,,,Galaxy A51',
      '35603310,Samsung,SM-G970U,OsmoTACDB client,,,,',
      '35753906,Samsung,SM-J100H,,,,,',
      '49013920,Nokia,1610,OsmoDevCon 2014,,,,"1610+,1611"',
    ].join('\n');
    const rows = parseTacFile(file, 'tacdb.csv');
    // Banner skipped, both "name" columns read as brand / model, leading zeros and empty contributors kept.
    expect(rows.map((r) => [r.tac, r.brand, r.model])).toEqual([
      ['01242200', 'Apple', 'iPhone 4'],
      ['35915207', 'Apple', 'iPhone 7 A1778 TD-LTE 32GB'],
      ['35067889', 'Samsung', 'SM-A515F/DSN'],
      ['35603310', 'Samsung', 'SM-G970U'],
      ['35753906', 'Samsung', 'SM-J100H'],
      ['49013920', 'Nokia', '1610'],
    ]);
    expect(rows[2].aliases).toBe('Galaxy A51');
    const res = (i: number) => resolveModel(rows[i].brand, rows[i].model, rows[i].aliases, 'phone');
    expect(res(1)).toEqual({ model: 'iPhone 7', inCatalog: true, via: 'name' });
    expect(res(2)).toEqual({ model: 'Galaxy A51', inCatalog: true, via: 'name' }); // from "aka"
    expect(res(3)).toEqual({ model: 'Galaxy S10e', inCatalog: true, via: 'modelNumber' });
    expect(res(0)).toEqual({ model: 'iPhone 4', inCatalog: false, via: 'name' }); // real name, not in the catalogue
    expect(res(4)).toEqual({ model: null, inCatalog: false, via: null }); // only a model number: brand only
  });
});

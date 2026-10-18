import { prisma, type Tx } from './prisma.js';
import { catalogFor } from './catalog.js';

/**
 * IMEI → device identification through the TAC (Type Allocation Code = the first 8 digits of the IMEI).
 * The TAC identifies a manufacturer and model, never an individual phone, so only those 8 digits are ever looked up.
 *
 * Sources, in order:
 * 1. "own": the devices this business already saved with that TAC (brand / model as they entered them). Private to
 *    the business.
 * 2. Reference data imported from a TAC file (Osmocom's community database, or a licensed GSMA / vendor export), with
 *    its source kept on every row. Nothing is looked up on external services at request time.
 * Only what the source contains is returned: brand, model, model number and type when present — never storage,
 * colour or condition (a TAC does not determine them).
 */

/** 15 digits with a valid Luhn check digit (the last digit). */
export function isValidImei(imei: string) {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export const tacOf = (imei: string) => imei.slice(0, 8);

const BRAND_ALIASES: Record<string, string> = {
  apple: 'Apple',
  'apple inc': 'Apple',
  samsung: 'Samsung',
  'samsung korea': 'Samsung',
  'samsung electronics': 'Samsung',
  'samsung electronics co ltd': 'Samsung',
  xiaomi: 'Xiaomi',
  'xiaomi communications co ltd': 'Xiaomi',
  google: 'Google',
  huawei: 'Huawei',
  'huawei technologies co ltd': 'Huawei',
  oppo: 'Oppo',
  oneplus: 'OnePlus',
  honor: 'Honor',
  realme: 'Realme',
  vivo: 'Vivo',
  motorola: 'Motorola',
  nokia: 'Nokia',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "(A2848)", "(SM-S921B)"
    .replace(/\bsm-[a-z0-9]+\b/g, ' ') // Samsung model numbers
    .replace(/\b(apple|samsung|5g|4g|lte|dual sim|ds)\b/g, ' ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function normalizeBrand(raw: string) {
  const k = raw.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  return BRAND_ALIASES[k] ?? BRAND_ALIASES[k.split(' ')[0]] ?? raw.trim();
}

/** Model number written in the source, e.g. "SM-S921B" or "A2848". */
export function modelNumberOf(raw: string) {
  return /\b(SM-[A-Z0-9]+)\b/i.exec(raw)?.[1]?.toUpperCase() ?? /\b(A\d{4})\b/.exec(raw)?.[1] ?? null;
}

/**
 * The catalogue entry for a brand / model name from a TAC source: same name once codes and suffixes are removed,
 * else the longest catalogue model contained in it ("Galaxy S24 Ultra (SM-S928B)" → "Galaxy S24 Ultra").
 */
export function matchCatalog(brand: string, model: string, deviceType?: string | null) {
  const b = brand.toLowerCase();
  const n = ` ${norm(model)} `;
  const candidates = catalogFor(deviceType || undefined).filter((d) => d.brand.toLowerCase() === b);
  const exact = candidates.find((d) => ` ${norm(d.model)} ` === n);
  if (exact) return exact;
  return candidates.filter((d) => n.includes(` ${norm(d.model)} `)).sort((x, y) => y.model.length - x.model.length)[0] ?? null;
}

/**
 * Samsung model-number families → marketing names (Samsung's own naming, e.g. SM-G991B / SM-G991U = Galaxy S21).
 * Used only when a TAC record gives a model number without a marketing name.
 */
const SAMSUNG_CODES: Record<string, string> = {
  G950: 'Galaxy S8', G955: 'Galaxy S8+', N950: 'Galaxy Note 8', G960: 'Galaxy S9', G965: 'Galaxy S9+', N960: 'Galaxy Note 9',
  G970: 'Galaxy S10e', G973: 'Galaxy S10', G975: 'Galaxy S10+', N970: 'Galaxy Note 10', N975: 'Galaxy Note 10+',
  G980: 'Galaxy S20', G981: 'Galaxy S20', G985: 'Galaxy S20+', G986: 'Galaxy S20+', G988: 'Galaxy S20 Ultra', G780: 'Galaxy S20 FE', G781: 'Galaxy S20 FE',
  N980: 'Galaxy Note 20', N981: 'Galaxy Note 20', N985: 'Galaxy Note 20 Ultra', N986: 'Galaxy Note 20 Ultra',
  G990: 'Galaxy S21 FE', G991: 'Galaxy S21', G996: 'Galaxy S21+', G998: 'Galaxy S21 Ultra',
  S901: 'Galaxy S22', S906: 'Galaxy S22+', S908: 'Galaxy S22 Ultra', S711: 'Galaxy S23 FE', S911: 'Galaxy S23', S916: 'Galaxy S23+', S918: 'Galaxy S23 Ultra',
  S721: 'Galaxy S24 FE', S921: 'Galaxy S24', S926: 'Galaxy S24+', S928: 'Galaxy S24 Ultra', S931: 'Galaxy S25', S936: 'Galaxy S25+', S938: 'Galaxy S25 Ultra',
  F711: 'Galaxy Z Flip3', F721: 'Galaxy Z Flip4', F731: 'Galaxy Z Flip5', F741: 'Galaxy Z Flip6', F926: 'Galaxy Z Fold3', F936: 'Galaxy Z Fold4', F946: 'Galaxy Z Fold5', F956: 'Galaxy Z Fold6',
  A505: 'Galaxy A50', A515: 'Galaxy A51', A705: 'Galaxy A70', A715: 'Galaxy A71', A125: 'Galaxy A12', A325: 'Galaxy A32', A326: 'Galaxy A32', A525: 'Galaxy A52', A526: 'Galaxy A52',
  A528: 'Galaxy A52s', A135: 'Galaxy A13', A136: 'Galaxy A13', A235: 'Galaxy A23', A236: 'Galaxy A23', A336: 'Galaxy A33', A536: 'Galaxy A53', A145: 'Galaxy A14', A146: 'Galaxy A14',
  A245: 'Galaxy A24', A346: 'Galaxy A34', A546: 'Galaxy A54', A155: 'Galaxy A15', A156: 'Galaxy A15', A256: 'Galaxy A25', A356: 'Galaxy A35', A556: 'Galaxy A55',
};

/** True when a name is only a reference (SM-G970U, GT-I9100, A2221, MLML3LL/A), not a marketing name. */
const isCodeOnly = (s: string) => /^(SM-|GT-|SGH-|SCH-)?[A-Z]{0,3}\d{3,5}[A-Z0-9/-]*$/i.test(s.trim()) || /^[A-Z0-9]{5,}\/[A-Z]$/i.test(s.trim());

/**
 * The model a TAC record supports, from what the source actually says:
 * 1. a catalogue model found in its model name or its other names ("aka") — verified and fully usable;
 * 2. a Samsung model number from the record mapped to its marketing name, when that model is in the catalogue;
 * 3. the source's own marketing name when it is not just a code (not in the catalogue: storage / colour by hand);
 * 4. nothing — the record only names the manufacturer, or only a model number: brand only.
 */
export function resolveModel(brand: string, model: string, aliases?: string | null, deviceType?: string | null) {
  const names = [model, ...(aliases ? aliases.split(',') : [])].map((s) => s.trim()).filter(Boolean);
  for (const n of names) {
    const m = matchCatalog(brand, n, deviceType);
    if (m) return { model: m.model, inCatalog: true, via: 'name' as const };
  }
  if (brand === 'Samsung') {
    for (const n of names) {
      const code = /SM-([A-Z]\d{3})/i.exec(n)?.[1]?.toUpperCase();
      const m = code && SAMSUNG_CODES[code] ? matchCatalog('Samsung', SAMSUNG_CODES[code], deviceType) : null;
      if (m) return { model: m.model, inCatalog: true, via: 'modelNumber' as const };
    }
  }
  const marketing = names.find((n) => !isCodeOnly(n) && /[a-z]/i.test(n));
  if (marketing) return { model: marketing.replace(/\s+/g, ' '), inCatalog: false, via: 'name' as const };
  return { model: null, inCatalog: false, via: null };
}

export async function lookupTac(tenantId: string, tac: string) {
  if (!/^\d{8}$/.test(tac)) return null;
  const rows = await prisma.tacModel.findMany({ where: { tac, tenantId: { in: [tenantId, ''] } } });
  const row = rows.find((r) => r.tenantId === tenantId) ?? rows.find((r) => r.tenantId === '');
  if (!row) return null;
  const resolved = resolveModel(row.brand, row.model, row.aliases, row.deviceType);
  const brandInCatalog = catalogFor().some((d) => d.brand.toLowerCase() === row.brand.toLowerCase());
  return {
    brand: row.brand,
    brandInCatalog,
    model: resolved.model, // null = the record does not name a usable model: brand only
    modelVia: resolved.via,
    inCatalog: resolved.inCatalog,
    sourceModelName: row.model || null,
    aliases: row.aliases ? row.aliases.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6) : [],
    modelNumber: row.modelNumber ?? modelNumberOf([row.model, row.aliases].filter(Boolean).join(' ')),
    deviceType: row.deviceType,
    source: row.tenantId ? 'own' : 'reference',
    sourceName: row.tenantId ? null : row.source,
    seenCount: row.seenCount,
  };
}

/** Remembers TAC → brand / model from a device this business saved (its own data; the IMEI itself is not stored here). */
export async function learnTac(tx: Tx, tenantId: string, unit: { imei?: string | null; brand: string; model: string; deviceType?: string | null }) {
  if (!unit.imei || !isValidImei(unit.imei) || !unit.brand?.trim() || !unit.model?.trim()) return;
  const tac = tacOf(unit.imei);
  const existing = await tx.tacModel.findUnique({ where: { tenantId_tac: { tenantId, tac } } });
  const data = { brand: unit.brand.trim(), model: unit.model.trim(), deviceType: unit.deviceType ?? 'phone', source: 'own' };
  if (existing) await tx.tacModel.update({ where: { id: existing.id }, data: { ...data, seenCount: existing.seenCount + 1 } });
  else await tx.tacModel.create({ data: { ...data, tenantId, tac } });
}

export interface TacRow {
  tac: string;
  brand: string;
  model: string; // "" when the record names only the manufacturer
  aliases: string | null;
  modelNumber: string | null;
  deviceType: string | null;
}

function toRow(tacRaw: unknown, brand: unknown, model: unknown, type?: unknown, aliases?: unknown): TacRow | null {
  const tac = String(tacRaw ?? '').trim();
  const b = String(brand ?? '').trim();
  const m = String(model ?? '').replace(/\s+/g, ' ').trim();
  const aka = String(aliases ?? '').replace(/\s+/g, ' ').trim();
  // A TAC is exactly 8 digits (leading zeros included: "01242200" is an iPhone 4). A record needs at least a brand.
  if (!/^\d{8}$/.test(tac) || !b) return null;
  const t = String(type ?? '').toLowerCase();
  return {
    tac,
    brand: normalizeBrand(b),
    model: m,
    aliases: aka || null,
    modelNumber: modelNumberOf(`${m} ${aka}`),
    deviceType: /tablet/.test(t) ? 'tablet' : /watch|wearable/.test(t) ? 'watch' : /phone|handheld|mobile|feature/.test(t) ? 'phone' : null,
  };
}

const TAC_COLS = ['tac'];
const BRAND_COLS = ['brand', 'manufacturer', 'vendor', 'name1', 'brand_name', 'make'];
const MODEL_COLS = ['model', 'marketing_name', 'model_name', 'name2', 'device', 'device_name'];
const ALIAS_COLS = ['aka', 'alias', 'aliases', 'other_names'];
const TYPE_COLS = ['type', 'device_type', 'equipment_type'];

function splitCsvLine(l: string) {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"' && l[i + 1] === '"' && q) (cur += '"'), i++;
    else if (c === '"') q = !q;
    else if ((c === ',' || c === ';' || c === '\t') && !q) out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * CSV TAC file.
 * - Lines before the header are skipped (the Osmocom export starts with a licence banner line).
 * - The header is the first line with a "tac" column. Brand: brand / manufacturer / vendor / name1; model: model /
 *   marketing_name / model_name / name2. Osmocom names both columns "name": the first is the brand, the second the
 *   model. Other names: aka / alias. Optional type.
 * - Without a recognisable header, columns are positional: the column of 8-digit codes, then brand, then model.
 */
export function parseTacCsv(text: string): TacRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const norm = (h: string) => h.toLowerCase().replace(/[\s-]+/g, '_');
  const headerAt = lines.slice(0, 10).findIndex((l) => splitCsvLine(l).map(norm).includes('tac'));
  let iTac = -1;
  let iBrand = -1;
  let iModel = -1;
  let iAka = -1;
  let iType = -1;
  let body: string[];
  if (headerAt >= 0) {
    const head = splitCsvLine(lines[headerAt]).map(norm);
    const find = (names: string[], from = 0) => head.findIndex((h, i) => i >= from && names.includes(h));
    iTac = find(TAC_COLS);
    iBrand = find(BRAND_COLS);
    iModel = find(MODEL_COLS);
    const names = head.map((h, i) => (h === 'name' ? i : -1)).filter((i) => i >= 0);
    if (iBrand < 0 && names.length >= 2) [iBrand, iModel] = [names[0], iModel < 0 ? names[1] : iModel];
    else if (iModel < 0 && names.length) iModel = names.find((i) => i !== iBrand) ?? -1;
    else if (iBrand < 0 && names.length) iBrand = names[0];
    iAka = find(ALIAS_COLS);
    iType = find(TYPE_COLS);
    body = lines.slice(headerAt + 1);
  } else {
    body = lines;
    const sample = body.slice(0, 200).map(splitCsvLine);
    const width = Math.max(...sample.map((r) => r.length));
    const share = (i: number) => sample.filter((r) => /^\d{8}$/.test(r[i] ?? '')).length / sample.length;
    iTac = [...Array(width).keys()].find((i) => share(i) >= 0.5) ?? -1;
    if (iTac >= 0) [iBrand, iModel] = [iTac + 1, iTac + 2];
  }
  if (iTac < 0 || iBrand < 0) throw new Error(`Unrecognised TAC file: no TAC / brand columns in "${(lines[headerAt] ?? lines[0]).slice(0, 120)}"`);
  return body
    .map(splitCsvLine)
    .map((c) => toRow(c[iTac], c[iBrand], iModel >= 0 ? c[iModel] : '', iType >= 0 ? c[iType] : '', iAka >= 0 ? c[iAka] : ''))
    .filter((r): r is TacRow => !!r);
}

const CONTAINER_KEYS = new Set(['brands', 'brand', 'models', 'model', 'tacs', 'tac', 'data', 'devices', 'items', 'manufacturers']);

/**
 * JSON TAC file: either records with the same field names as the CSV, or a tree such as
 * { brands: { Apple: { models: [ { "iPhone 6": { tacs: ["35…", …] } } ] } } } or { Apple: { "iPhone 6": ["35…"] } }:
 * every list of 8-digit codes is attributed to the first and last names on its path (brand, model).
 */
export function parseTacJson(text: string): TacRow[] {
  const data = JSON.parse(text.replace(/^﻿/, ''));
  const rows: TacRow[] = [];
  const pick = (o: Record<string, unknown>, names: string[]) => {
    const k = Object.keys(o).find((x) => names.includes(x.toLowerCase().replace(/[\s-]+/g, '_')));
    return k ? o[k] : undefined;
  };
  const isTac = (v: unknown) => /^\d{8}$/.test(String(v));
  const walk = (node: unknown, names: string[]) => {
    if (Array.isArray(node)) {
      if (node.length && node.every(isTac)) {
        if (names.length >= 2) for (const t of node) {
          const r = toRow(t, names[0], names[names.length - 1]);
          if (r) rows.push(r);
        }
        return;
      }
      for (const x of node) walk(x, names);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const tac = pick(o, TAC_COLS);
    if (tac !== undefined && (typeof tac === 'string' || typeof tac === 'number')) {
      const r = toRow(tac, pick(o, BRAND_COLS) ?? names[0], pick(o, [...MODEL_COLS, 'name']) ?? names[names.length - 1], pick(o, TYPE_COLS), pick(o, ALIAS_COLS));
      if (r) rows.push(r);
      return;
    }
    for (const [k, v] of Object.entries(o)) walk(v, CONTAINER_KEYS.has(k.toLowerCase()) ? names : [...names, k]);
  };
  walk(data, []);
  return rows;
}

export function parseTacFile(text: string, fileName = '') {
  const t = text.replace(/^﻿/, '').trimStart();
  return /\.json$/i.test(fileName) || t.startsWith('{') || t.startsWith('[') ? parseTacJson(text) : parseTacCsv(text);
}

/**
 * What a TAC file actually covers, before importing it: codes per brand and, for Apple and Samsung phones, how many
 * codes map to models of the app's catalogue and which catalogue models have no code at all.
 */
export function tacCoverage(rows: TacRow[]) {
  const unique = [...new Map(rows.map((r) => [r.tac, r])).values()];
  const brands = new Map<string, number>();
  for (const r of unique) brands.set(r.brand, (brands.get(r.brand) ?? 0) + 1);
  const focus = (brand: string) => {
    const mine = unique.filter((r) => r.brand === brand);
    const matched = mine.map((r) => resolveModel(r.brand, r.model, r.aliases, 'phone')).filter((m) => m.inCatalog);
    const covered = new Set(matched.map((m) => m.model!));
    const brandOnly = mine.filter((r) => !resolveModel(r.brand, r.model, r.aliases, 'phone').model).length;
    const catalogModels = catalogFor('phone').filter((d) => d.brand === brand).map((d) => d.model);
    return {
      tacs: mine.length,
      mappedToCatalog: matched.length,
      catalogModelsCovered: covered.size,
      catalogModels: catalogModels.length,
      brandOnly,
      missing: catalogModels.filter((m) => !covered.has(m)),
    };
  };
  return { tacs: unique.length, brands: [...brands.entries()].sort((a, b) => b[1] - a[1]), apple: focus('Apple'), samsung: focus('Samsung') };
}

/** Replaces the reference rows of one source by the rows of a TAC file. Returns the number of distinct TACs. */
export async function importTacRows(rows: TacRow[], source: string) {
  const unique = [...new Map(rows.map((r) => [r.tac, r])).values()];
  await prisma.$transaction(
    async (tx) => {
      await tx.tacModel.deleteMany({ where: { tenantId: '', source } });
      // A TAC already provided by another reference source is updated; the others are inserted in batches.
      const existing = new Set((await tx.tacModel.findMany({ where: { tenantId: '' }, select: { tac: true } })).map((r) => r.tac));
      const fresh = unique.filter((r) => !existing.has(r.tac));
      for (let i = 0; i < fresh.length; i += 500) {
        await tx.tacModel.createMany({ data: fresh.slice(i, i + 500).map((r) => ({ ...r, tenantId: '', source })) });
      }
      for (const r of unique.filter((r) => existing.has(r.tac))) {
        await tx.tacModel.update({ where: { tenantId_tac: { tenantId: '', tac: r.tac } }, data: { ...r, source } });
      }
    },
    { timeout: 600_000 },
  );
  return unique.length;
}

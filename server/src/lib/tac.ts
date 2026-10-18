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
  return /\b(SM-[A-Z0-9]+)\b/i.exec(raw)?.[1]?.toUpperCase() ?? /\((A\d{4})\)/.exec(raw)?.[1] ?? null;
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

export async function lookupTac(tenantId: string, tac: string) {
  if (!/^\d{8}$/.test(tac)) return null;
  const rows = await prisma.tacModel.findMany({ where: { tac, tenantId: { in: [tenantId, ''] } } });
  const row = rows.find((r) => r.tenantId === tenantId) ?? rows.find((r) => r.tenantId === '');
  if (!row) return null;
  const match = matchCatalog(row.brand, row.model, row.deviceType);
  return {
    brand: match?.brand ?? row.brand,
    model: match?.model ?? row.model,
    sourceModelName: row.model,
    modelNumber: row.modelNumber,
    deviceType: row.deviceType,
    inCatalog: !!match,
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
  model: string;
  modelNumber: string | null;
  deviceType: string | null;
}

function toRow(tacRaw: unknown, brand: unknown, model: unknown, type?: unknown): TacRow | null {
  const tac = String(tacRaw ?? '').replace(/\D/g, '');
  const b = String(brand ?? '').trim();
  const m = String(model ?? '').replace(/\s+/g, ' ').trim();
  if (!/^\d{8}$/.test(tac) || !b || !m) return null;
  const t = String(type ?? '').toLowerCase();
  return {
    tac,
    brand: normalizeBrand(b),
    model: m,
    modelNumber: modelNumberOf(m),
    deviceType: /tablet/.test(t) ? 'tablet' : /watch|wearable/.test(t) ? 'watch' : /phone|handheld|mobile|feature/.test(t) ? 'phone' : null,
  };
}

const TAC_COLS = ['tac'];
const BRAND_COLS = ['brand', 'manufacturer', 'vendor', 'name1', 'brand_name', 'make'];
const MODEL_COLS = ['model', 'marketing_name', 'model_name', 'name2', 'name', 'device', 'device_name'];
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
 * CSV TAC file. Columns are found by header name (tac; brand / manufacturer / vendor / name1; model / marketing_name /
 * model_name / name2 / name; optional type). When the header uses other names (or there is none), they are found from
 * the contents: the column of 8-digit numbers is the TAC, the next two text columns are brand then model.
 */
export function parseTacCsv(text: string): TacRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = splitCsvLine(lines[0]);
  const head = first.map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  let iTac = col(TAC_COLS);
  let iBrand = col(BRAND_COLS);
  let iModel = col(MODEL_COLS);
  const iType = col(TYPE_COLS);
  let body = lines.slice(1);
  if (iTac < 0 || iBrand < 0 || iModel < 0) {
    if (first.some((c) => /^\d{8}$/.test(c))) body = lines; // no header line
    const sample = body.slice(0, 200).map(splitCsvLine);
    const width = Math.max(...sample.map((r) => r.length));
    const share = (i: number, test: (v: string) => boolean) => sample.filter((r) => test(r[i] ?? '')).length / sample.length;
    const cols = [...Array(width).keys()];
    iTac = cols.find((i) => share(i, (v) => /^\d{8}$/.test(v)) > 0.5) ?? -1;
    const textCols = cols.filter((i) => i !== iTac && share(i, (v) => /[A-Za-z]/.test(v)) > 0.5);
    iBrand = textCols[0] ?? -1;
    iModel = textCols[1] ?? -1;
    if (iTac < 0 || iBrand < 0 || iModel < 0) throw new Error(`Unrecognised TAC file: no TAC / brand / model columns in "${lines[0].slice(0, 120)}"`);
  }
  return body
    .map(splitCsvLine)
    .map((c) => toRow(c[iTac], c[iBrand], c[iModel], iType >= 0 ? c[iType] : ''))
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
      const r = toRow(tac, pick(o, BRAND_COLS) ?? names[0], pick(o, MODEL_COLS) ?? names[names.length - 1], pick(o, TYPE_COLS));
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
    const matched = mine.map((r) => matchCatalog(r.brand, r.model, 'phone')).filter((m) => !!m);
    const covered = new Set(matched.map((m) => m!.model));
    const catalogModels = catalogFor('phone').filter((d) => d.brand === brand).map((d) => d.model);
    return {
      tacs: mine.length,
      mappedToCatalog: matched.length,
      catalogModelsCovered: covered.size,
      catalogModels: catalogModels.length,
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

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

/**
 * Parses a TAC file (CSV with a header). Recognised columns (case-insensitive): tac; brand / manufacturer / vendor /
 * name1; model / marketing_name / model_name / name2 / name; optional type / device_type.
 */
export function parseTacCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (l: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && l[i + 1] === '"' && q) (cur += '"'), i++;
      else if (c === '"') q = !q;
      else if ((c === ',' || c === ';') && !q) out.push(cur), (cur = '');
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iTac = col('tac');
  const iBrand = col('brand', 'manufacturer', 'vendor', 'name1', 'brand_name');
  const iModel = col('model', 'marketing_name', 'model_name', 'name2', 'name');
  const iType = col('type', 'device_type');
  if (iTac < 0 || iBrand < 0 || iModel < 0) throw new Error(`Unrecognised TAC file header: ${lines[0]}`);
  const rows = [];
  for (const l of lines.slice(1)) {
    const c = split(l);
    const tac = (c[iTac] || '').replace(/\D/g, '');
    const brand = c[iBrand] || '';
    const model = c[iModel] || '';
    if (!/^\d{8}$/.test(tac) || !brand || !model) continue;
    const type = iType >= 0 ? (c[iType] || '').toLowerCase() : '';
    rows.push({
      tac,
      brand: normalizeBrand(brand),
      model: model.replace(/\s+/g, ' '),
      modelNumber: modelNumberOf(model),
      deviceType: /tablet/.test(type) ? 'tablet' : /watch|wearable/.test(type) ? 'watch' : /phone|handheld|mobile/.test(type) ? 'phone' : null,
    });
  }
  return rows;
}

/** Replaces the reference rows of one source by the rows of a TAC file. Returns the number imported. */
export async function importTacRows(rows: ReturnType<typeof parseTacCsv>, source: string) {
  await prisma.$transaction(async (tx) => {
    await tx.tacModel.deleteMany({ where: { tenantId: '', source } });
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.tac)) continue;
      seen.add(r.tac);
      await tx.tacModel.upsert({
        where: { tenantId_tac: { tenantId: '', tac: r.tac } },
        create: { ...r, tenantId: '', source },
        update: { ...r, source },
      });
    }
  });
  return new Set(rows.map((r) => r.tac)).size;
}

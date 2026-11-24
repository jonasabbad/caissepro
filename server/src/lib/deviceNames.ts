import { catalog } from './catalog.js';
import { prisma, type Prisma } from './prisma.js';

/**
 * Brands and models offered by the device forms (Add phone / device, trade-in, supplier order lines):
 * the built-in catalogue plus every brand / model this business has already entered on a device or a supplier order
 * line. Nothing extra is stored: a model typed once is "saved" by the device or order line that carries it, and is
 * offered again from then on, under its own brand only.
 *
 * Duplicates are prevented by spelling: a brand or model typed with another case, spacing or dashes
 * ("iphone 15  pro", "IPHONE-15 PRO") is stored with the spelling already known (catalogue first, then this
 * business's own). Models are matched within their brand only, so the same model name under two brands stays two models.
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Name = { deviceType: string; brand: string; model: string };

/** Comparison key: case, spaces, dashes and underscores ignored. */
export const nameKey = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-_]+/g, '');
/** Trims and collapses inner spaces. */
export const tidyName = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** Brand / model pairs this business has entered (devices + supplier order lines), most used first. */
async function ownNames(db: Db, tenantId: string, deviceType?: string): Promise<Name[]> {
  const [units, lines] = await Promise.all([
    db.soldUnit.groupBy({
      by: ['deviceType', 'brand', 'model'],
      where: { tenantId, ...(deviceType ? { deviceType } : {}) },
      _count: { _all: true },
    }),
    db.supplierOrderItem.groupBy({
      by: ['deviceType', 'brand', 'deviceModel'],
      where: { order: { tenantId }, brand: { not: null }, deviceModel: { not: null }, ...(deviceType ? { deviceType } : {}) },
      _count: { _all: true },
    }),
  ]);
  const all = [
    ...units.map((u) => ({ deviceType: u.deviceType, brand: u.brand, model: u.model, n: u._count._all })),
    ...lines.map((l) => ({ deviceType: l.deviceType ?? 'phone', brand: l.brand!, model: l.deviceModel!, n: l._count._all })),
  ].filter((x) => x.brand.trim() && x.model.trim());
  return all.sort((a, b) => b.n - a.n).map(({ n: _n, ...x }) => x);
}

const catalogFor = (deviceType?: string): Name[] => (deviceType ? catalog.filter((d) => d.deviceType === deviceType) : catalog);

/** One spelling per key: the first one met wins (callers list the catalogue first, then the most used). */
function uniqueBy(values: string[]) {
  const seen = new Map<string, string>();
  for (const v of values) {
    const k = nameKey(v);
    if (k && !seen.has(k)) seen.set(k, tidyName(v));
  }
  return [...seen.values()];
}

/** Brands for a device type: the catalogue's and this business's own, without duplicates, A → Z. */
export async function brandsFor(tenantId: string, deviceType?: string) {
  const own = await ownNames(prisma, tenantId, deviceType);
  // Spelling of a brand known anywhere in the catalogue wins (e.g. a tablet brand typed in lower case).
  const catalogSpelling = new Map(catalog.map((d) => [nameKey(d.brand), d.brand]));
  return uniqueBy([...catalogFor(deviceType).map((d) => d.brand), ...own.map((o) => catalogSpelling.get(nameKey(o.brand)) ?? o.brand)]).sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Models of one brand for a device type: the catalogue's (in its order), then this business's own (A → Z). */
export async function modelsFor(tenantId: string, brand: string, deviceType?: string) {
  const b = nameKey(brand);
  if (!b) return [];
  const fromCatalog = catalogFor(deviceType).filter((d) => nameKey(d.brand) === b).map((d) => d.model);
  const known = new Set(fromCatalog.map(nameKey));
  const own = uniqueBy((await ownNames(prisma, tenantId, deviceType)).filter((o) => nameKey(o.brand) === b).map((o) => o.model))
    .filter((m) => !known.has(nameKey(m)))
    .sort((x, y) => x.localeCompare(y));
  return [...uniqueBy(fromCatalog), ...own];
}

/**
 * The spelling to store for a brand / model just entered: the one already known for the same key (brand among all
 * brands; model among that brand's models only), else the entry tidied. A new brand or model is thereby "created".
 */
export async function canonicalName(db: Db, tenantId: string, brand: string, model: string) {
  const own = await ownNames(db, tenantId);
  const names: Name[] = [...catalog, ...own];
  const b = nameKey(brand);
  const knownBrand = names.find((n) => nameKey(n.brand) === b)?.brand;
  const m = nameKey(model);
  const knownModel = names.find((n) => nameKey(n.brand) === b && nameKey(n.model) === m)?.model;
  return { brand: tidyName(knownBrand ?? brand), model: tidyName(knownModel ?? model) };
}

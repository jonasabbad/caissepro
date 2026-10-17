import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { parseJson, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { qStr } from '../lib/pagination.js';

export const SOLD_UNITS = '__sold_units__';

/** Layout defaults of a 50 × 25 mm thermal label (observed on the original). */
const BASE_LAYOUT = {
  width: 50,
  height: 25,
  fontSize: 10,
  showBarcode: true,
  showPrice: true,
  showName: true,
  showSku: false,
  showCategory: false,
  barcodeType: 'code128', // products and devices use barcodes; QR codes are reserved for repair tracking
  orientation: 'landscape',
};
const PRODUCT_FLAGS = { includeQr: false, includeName: true, includeImei: false, includePrice: true, includeCondition: false, includeSpecs: false, includeCompany: false, includeBarcode: true };
const UNIT_FLAGS = { includeQr: false, includeName: true, includeImei: true, includePrice: true, includeCondition: true, includeSpecs: true, includeCompany: true, includeBarcode: true };
const defaults = (categoryId: string) => ({ ...BASE_LAYOUT, ...(categoryId === SOLD_UNITS ? UNIT_FLAGS : PRODUCT_FLAGS) });

/** Only layout settings and the include/hide/show switches are stored. */
function pickConfig(body: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (/^(include|hide|show)[A-Z]/.test(k) && typeof v === 'boolean') out[k] = v;
    else if (k in BASE_LAYOUT && (typeof v === 'number' || typeof v === 'string')) out[k] = v;
  }
  return out;
}

type Row = Awaited<ReturnType<typeof prisma.labelTemplate.findFirstOrThrow>>;
/** The row with its config both nested under `template` and spread at the top level, as the original returns it. */
const present = (r: Row) => {
  const cfg = parseJson<Record<string, unknown>>(r.template, {});
  const { template: _t, ...rest } = r;
  return serialize({ ...rest, template: cfg, ...cfg });
};

export default async function labelTemplateRoutes(app: FastifyInstance) {
  authed(app);

  const findBase = (tenantId: string, categoryId: string) => prisma.labelTemplate.findFirst({ where: { tenantId, categoryId, brand: null, deviceType: null } });
  /** Lazily creates the default template of a category (the original does the same on first read). */
  async function getOrCreate(tenantId: string, categoryId: string) {
    const existing = await findBase(tenantId, categoryId);
    if (existing) return existing;
    return prisma.labelTemplate.create({
      data: {
        tenantId,
        categoryId,
        name: categoryId === SOLD_UNITS ? 'Sold Units Template' : 'Product Template',
        template: JSON.stringify(defaults(categoryId)),
        isDefault: true,
      },
    });
  }

  app.get('/label-templates', async (req) => {
    const rows = await prisma.labelTemplate.findMany({ where: { tenantId: req.auth.tenantId, categoryId: { not: SOLD_UNITS }, isDefault: false }, orderBy: { createdAt: 'asc' } });
    return ok({ templates: rows.map(present) });
  });

  // ── Device labels: one default plus optional variants per brand and/or device type ──
  app.get('/label-templates/sold-units/variants', async (req) => {
    const rows = await prisma.labelTemplate.findMany({
      where: { tenantId: req.auth.tenantId, categoryId: SOLD_UNITS, OR: [{ brand: { not: null } }, { deviceType: { not: null } }] },
      orderBy: [{ brand: 'asc' }, { deviceType: 'asc' }],
    });
    return ok({ variants: rows.map(present) });
  });

  /** Most specific match wins: brand + type, then brand, then type, then the default. */
  app.get('/label-templates/sold-units/resolve', async (req: Req<unknown, Record<string, string>>) => {
    const brand = qStr(req.query.brand);
    const deviceType = qStr(req.query.deviceType);
    const variants = await prisma.labelTemplate.findMany({ where: { tenantId: req.auth.tenantId, categoryId: SOLD_UNITS } });
    const pick =
      (brand && deviceType && variants.find((v) => v.brand === brand && v.deviceType === deviceType)) ||
      (brand && variants.find((v) => v.brand === brand && !v.deviceType)) ||
      (deviceType && variants.find((v) => !v.brand && v.deviceType === deviceType)) ||
      (await getOrCreate(req.auth.tenantId, SOLD_UNITS));
    return ok({ template: present(pick) });
  });

  app.put('/label-templates/sold-units/variants', async (req: Req<Record<string, unknown>>) => {
    const brand = qStr(req.body?.brand as string) ?? null;
    const deviceType = qStr(req.body?.deviceType as string) ?? null;
    const base = await getOrCreate(req.auth.tenantId, SOLD_UNITS);
    const config = { ...parseJson<Record<string, unknown>>(base.template, {}), ...pickConfig(req.body) };
    const existing = await prisma.labelTemplate.findFirst({ where: { tenantId: req.auth.tenantId, categoryId: SOLD_UNITS, brand, deviceType } });
    const row = existing
      ? await prisma.labelTemplate.update({ where: { id: existing.id }, data: { template: JSON.stringify(config) } })
      : await prisma.labelTemplate.create({
          data: { tenantId: req.auth.tenantId, categoryId: SOLD_UNITS, brand, deviceType, name: [brand, deviceType].filter(Boolean).join(' · ') || 'Sold Units Template', template: JSON.stringify(config) },
        });
    return ok({ template: present(row) });
  });

  app.delete('/label-templates/sold-units/variants/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const row = await prisma.labelTemplate.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId, categoryId: SOLD_UNITS, isDefault: false } });
    if (!row) throw notFound('Label template', req.params.id);
    await prisma.labelTemplate.delete({ where: { id: row.id } });
    return ok({ deleted: true });
  });

  // ── Per category (and the device default under "__sold_units__") ──
  app.get('/label-templates/:categoryId', async (req: Req<unknown, unknown, { categoryId: string }>) => ok({ template: present(await getOrCreate(req.auth.tenantId, req.params.categoryId)) }));

  app.put('/label-templates/:categoryId', async (req: Req<Record<string, unknown>, unknown, { categoryId: string }>) => {
    const row = await getOrCreate(req.auth.tenantId, req.params.categoryId);
    const config = { ...parseJson<Record<string, unknown>>(row.template, {}), ...pickConfig(req.body) };
    const updated = await prisma.labelTemplate.update({ where: { id: row.id }, data: { template: JSON.stringify(config), isDefault: false } });
    return ok({ template: present(updated) });
  });

  app.post('/label-templates/:categoryId/reset', async (req: Req<unknown, unknown, { categoryId: string }>) => {
    const row = await getOrCreate(req.auth.tenantId, req.params.categoryId);
    const updated = await prisma.labelTemplate.update({ where: { id: row.id }, data: { template: JSON.stringify(defaults(req.params.categoryId)), isDefault: true } });
    return ok({ template: present(updated) });
  });
}

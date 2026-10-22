import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Tx } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { isValidImei, lookupTac, tacOf } from '../lib/tac.js';
import { getTenant, tenantSettings } from '../lib/tenant.js';

/**
 * Scan lookup: one scanned code (camera, USB / Bluetooth scanner or typed) → what CaissePro knows about it.
 * Everything comes from this business's own data; nothing is sent to outside services.
 * 1. products — exact barcode or SKU (price and stock as stored);
 * 2. devices — exact IMEI, serial number or device reference (an individual phone, with its own price);
 * 3. box barcodes — a retail EAN / UPC learned when a device of that model was added with it (model, not a phone);
 * 4. a valid IMEI that is not in stock — the separate IMEI identification (TAC → brand / model, no price).
 */

export const CODE = /^[\x21-\x7e]{3,64}$/;

/** Remembers box barcode → model from a device added with it (this business's own data). */
export async function learnModelBarcode(
  tx: Tx,
  tenantId: string,
  code: string | null | undefined,
  unit: { brand: string; model: string; deviceType?: string | null; storage?: string | null; color?: string | null },
) {
  const c = (code ?? '').trim();
  if (!c || !CODE.test(c) || !unit.brand?.trim() || !unit.model?.trim()) return;
  const data = { brand: unit.brand.trim(), model: unit.model.trim(), deviceType: unit.deviceType || 'phone', storage: unit.storage || null, color: unit.color || null };
  const existing = await tx.modelBarcode.findUnique({ where: { tenantId_code: { tenantId, code: c } } });
  if (existing) await tx.modelBarcode.update({ where: { id: existing.id }, data: { ...data, seenCount: existing.seenCount + 1 } });
  else await tx.modelBarcode.create({ data: { ...data, tenantId, code: c } });
}

/** What CaissePro knows about one code (see the order above). */
export async function lookupCode(tenantId: string, code: string) {
  const upper = code.toUpperCase();
  const [products, units, modelBarcode] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, status: { not: 'archived' }, OR: [{ barcode: code }, { sku: code }, { sku: upper }] },
      include: { category: true },
      take: 5,
    }),
    prisma.soldUnit.findMany({
      where: { tenantId, OR: [{ imei: code }, { serialNumber: code }, { serialNumber: upper }, { ref: upper }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.modelBarcode.findUnique({ where: { tenantId_code: { tenantId, code } } }),
  ]);
  const validImei = /^\d{15}$/.test(code) && isValidImei(code);
  // IMEI identification only for a valid IMEI that is not a stored device: a model, never a price.
  const imei = validImei && !units.length ? { tac: tacOf(code), device: await lookupTac(tenantId, tacOf(code)) } : null;
  const found = products.length > 0 || units.length > 0 || !!modelBarcode;
  return {
    code,
    found,
    looksLikeImei: validImei,
    products: serialize(products),
    units: serialize(
      units.map((u) => ({
        id: u.id,
        ref: u.ref,
        deviceType: u.deviceType,
        brand: u.brand,
        model: u.model,
        storage: u.storage,
        color: u.color,
        condition: u.condition,
        imei: u.imei,
        serialNumber: u.serialNumber,
        salePrice: u.salePrice,
        purchasePrice: u.purchasePrice,
        imageUrl: u.imageUrl,
        soldAt: u.soldAt,
        reservedAt: u.reservedAt,
      })),
    ),
    modelBarcode: modelBarcode ? serialize(modelBarcode) : null,
    imei,
  };
}

export default async function scanRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/scan/:code', async (req: Req<unknown, unknown, { code: string }>) => {
    const code = decodeURIComponent(req.params.code ?? '').trim();
    if (!CODE.test(code)) throw badRequest('Code invalide');
    const [result, tenant] = await Promise.all([lookupCode(req.auth.tenantId, code), getTenant(req.auth.tenantId)]);
    return ok({ ...result, showCost: tenantSettings(tenant).scannerShowCost });
  });

  /** Links a box barcode to a model by hand (e.g. after identifying an unknown box). */
  app.put('/scan/model-barcodes', async (req: Req<Record<string, unknown>>) => {
    const body = z
      .object({
        code: z.string().trim().regex(CODE, 'Code invalide'),
        brand: z.string().trim().min(1, 'La marque est obligatoire'),
        model: z.string().trim().min(1, 'Le modèle est obligatoire'),
        deviceType: z.string().optional().nullable(),
        storage: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
      })
      .parse(req.body);
    await prisma.$transaction((tx) => learnModelBarcode(tx, req.auth.tenantId, body.code, body));
    const row = await prisma.modelBarcode.findUnique({ where: { tenantId_code: { tenantId: req.auth.tenantId, code: body.code } } });
    return ok({ modelBarcode: serialize(row) });
  });
}

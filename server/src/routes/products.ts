import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { serialize, toJson, r2 } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { pageMeta, pageParams, qBool, qStr } from '../lib/pagination.js';
import { makeRef } from '../lib/refs.js';
import { moveStock, stockStatus } from '../lib/stock.js';
import { resolveStoreId } from '../lib/tenant.js';

const money = z.coerce.number().min(0);
const optMoney = z.union([z.coerce.number().min(0), z.null()]).optional();

const productSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  costPrice: money,
  retailPrice: money,
  stockQuantity: z.coerce.number().int().min(0).optional(),
  minStockLevel: z.coerce.number().int().min(0).optional(),
  packSize: z.union([z.coerce.number().int().min(2), z.null()]).optional(),
  packCostPrice: optMoney,
  packRetailPrice: optMoney,
  variants: z.record(z.any()).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isTracked: z.boolean().optional(),
});
type ProductInput = z.infer<typeof productSchema>;

const include = { category: true } as const;

async function assertUniqueBarcode(tenantId: string, barcode: string | null | undefined, exceptId?: string) {
  if (!barcode) return;
  const clash = await prisma.product.findFirst({
    where: { tenantId, barcode, status: { not: 'archived' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash) throw conflict(`Le code-barres ${barcode} est déjà utilisé par « ${clash.name} »`);
}

async function createProduct(tx: Prisma.TransactionClient, tenantId: string, storeId: string | null, userId: string, input: ProductInput) {
  const stock = input.stockQuantity ?? 0;
  const minStock = input.minStockLevel ?? 5;
  const product = await tx.product.create({
    data: {
      tenantId,
      storeId,
      name: input.name,
      sku: input.sku || makeRef('PRD'),
      barcode: input.barcode || null,
      description: input.description ?? null,
      categoryId: input.categoryId || null,
      costPrice: r2(input.costPrice),
      retailPrice: r2(input.retailPrice),
      stockQuantity: 0,
      minStockLevel: minStock,
      packSize: input.packSize ?? null,
      packCostPrice: input.packCostPrice ?? null,
      packRetailPrice: input.packRetailPrice ?? null,
      variants: toJson(input.variants),
      imageUrl: input.imageUrl ?? null,
      isTracked: input.isTracked ?? true,
      status: stockStatus(0, minStock),
    },
  });
  if (stock > 0) {
    return moveStock(tx, {
      tenantId,
      productId: product.id,
      delta: stock,
      type: 'adjustment',
      reference: 'INITIAL',
      notes: 'Initial stock entry',
      storeId,
      userId,
    });
  }
  return product;
}

export default async function productRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/products', async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const p = pageParams(q, 50);
    const query = qStr(q.query);
    const status = qStr(q.status);
    const where: Prisma.ProductWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.categoryId) ? { categoryId: q.categoryId } : {}),
      ...(status ? { status } : { status: { not: 'archived' } }),
      ...(query
        ? { OR: [{ name: { contains: query } }, { sku: { contains: query } }, { barcode: { contains: query } }] }
        : {}),
    };
    if (qBool(q.lowStock)) where.status = { in: ['low_stock', 'out_of_stock'] };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      q.sort === 'name' ? { name: 'asc' } : q.sort === 'stock' ? { stockQuantity: 'asc' } : { createdAt: 'desc' };
    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, include, orderBy, skip: p.skip, take: p.limit }),
    ]);
    return ok({ products: serialize(products), meta: pageMeta(total, p) });
  });

  app.get('/products/low-stock', async (req: Req<unknown, { limit?: string }>) => {
    const limit = Math.min(100, parseInt(req.query.limit ?? '10', 10) || 10);
    const products = await prisma.product.findMany({
      where: { tenantId: req.auth.tenantId, status: { in: ['low_stock', 'out_of_stock'] }, isTracked: true },
      orderBy: { stockQuantity: 'asc' },
      take: limit,
    });
    return ok({ products: serialize(products) });
  });

  app.get('/products/barcode/:code', async (req: Req<unknown, unknown, { code: string }>) => {
    const code = req.params.code;
    const product = await prisma.product.findFirst({
      where: { tenantId: req.auth.tenantId, status: { not: 'archived' }, OR: [{ barcode: code }, { sku: code }] },
      include,
    });
    if (!product) throw notFound('Product with barcode', code);
    return ok({ product: serialize(product) });
  });

  app.get('/products/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId }, include });
    if (!product) throw notFound('Product', req.params.id);
    return ok({ product: serialize(product) });
  });

  app.post('/products', async (req: Req<ProductInput>) => {
    const input = productSchema.parse(req.body);
    await assertUniqueBarcode(req.auth.tenantId, input.barcode);
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const product = await prisma.$transaction((tx) => createProduct(tx, req.auth.tenantId, storeId, req.auth.userId, input));
    const full = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include });
    return ok({ product: serialize(full) });
  });

  app.post('/products/bulk', async (req: Req<{ products: ProductInput[] }>) => {
    const list = z.array(productSchema).min(1).max(500).parse(req.body?.products);
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const input of list) out.push(await createProduct(tx, req.auth.tenantId, storeId, req.auth.userId, input));
      return out;
    });
    return ok({ products: serialize(created) });
  });

  app.put('/products/:id', async (req: Req<ProductInput, unknown, { id: string }>) => {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Product', req.params.id);
    // Stock is changed through adjustments only; a quantity sent here is ignored.
    const input = productSchema.partial().parse(req.body);
    await assertUniqueBarcode(req.auth.tenantId, input.barcode, existing.id);
    const minStock = input.minStockLevel ?? existing.minStockLevel;
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sku !== undefined && { sku: input.sku || existing.sku }),
        ...(input.barcode !== undefined && { barcode: input.barcode || null }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId || null }),
        ...(input.costPrice !== undefined && { costPrice: r2(input.costPrice) }),
        ...(input.retailPrice !== undefined && { retailPrice: r2(input.retailPrice) }),
        ...(input.packSize !== undefined && { packSize: input.packSize }),
        ...(input.packCostPrice !== undefined && { packCostPrice: input.packCostPrice }),
        ...(input.packRetailPrice !== undefined && { packRetailPrice: input.packRetailPrice }),
        ...(input.variants !== undefined && { variants: toJson(input.variants) }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        minStockLevel: minStock,
        status: stockStatus(existing.stockQuantity, minStock, existing.status),
      },
      include,
    });
    return ok({ product: serialize(product) });
  });

  const adjustSchema = z.object({
    quantity: z.coerce.number().int(),
    reason: z.string().optional().nullable(),
    type: z.enum(['purchase', 'adjustment', 'damage', 'loss', 'return']).optional(),
    packCostPrice: z.coerce.number().positive().optional(),
  });

  /** Signed stock delta. Receiving boxes can update the pack cost, which re-derives the unit cost. */
  app.post('/products/:id/adjust-stock', async (req: Req<z.infer<typeof adjustSchema>, unknown, { id: string }>) => {
    const body = adjustSchema.parse(req.body);
    if (body.quantity === 0) throw badRequest('La quantité doit être différente de zéro');
    const product = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
      if (!existing) throw notFound('Product', req.params.id);
      if (body.packCostPrice && existing.packSize && existing.packSize >= 2) {
        await tx.product.update({
          where: { id: existing.id },
          data: { packCostPrice: body.packCostPrice, costPrice: r2(body.packCostPrice / existing.packSize) },
        });
      }
      return moveStock(tx, {
        tenantId: req.auth.tenantId,
        productId: existing.id,
        delta: body.quantity,
        type: body.type ?? 'adjustment',
        notes: body.reason ?? null,
        userId: req.auth.userId,
        storeId: req.auth.storeId,
      });
    });
    const full = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include });
    return ok({ product: serialize(full) });
  });

  app.post('/products/:id/archive', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Product', req.params.id);
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { status: 'archived', archivedAt: new Date() },
      include,
    });
    return ok({ product: serialize(product) });
  });

  /** Products already sold keep their history: they are archived instead of deleted. */
  app.delete('/products/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Product', req.params.id);
    const used = await prisma.transactionItem.count({ where: { productId: existing.id } });
    if (used > 0) {
      await prisma.product.update({ where: { id: existing.id }, data: { status: 'archived', archivedAt: new Date() } });
      return ok({ archived: true });
    }
    await prisma.product.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });
}

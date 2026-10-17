import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { parseJson, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { isManager } from '../lib/auth.js';
import { qBool } from '../lib/pagination.js';
import { getTenant } from '../lib/tenant.js';

/**
 * Product categories. Built-in categories (tenantId null) are shared by every business of the same activity and
 * cannot be renamed or deleted; a business can hide the ones it does not use. Categories a business creates are its
 * own (tenantId set) and can be renamed or deleted — never while products still point to them, unless those products
 * are moved to another category in the same operation.
 */
const nameSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'categorie';
const sameName = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'fr', { sensitivity: 'base' }) === 0;

async function hiddenIds(tenantId: string): Promise<string[]> {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  return parseJson<{ hiddenCategoryIds?: string[] }>(t.settings, {}).hiddenCategoryIds ?? [];
}
async function setHidden(tenantId: string, ids: string[]) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const settings = parseJson<Record<string, unknown>>(t.settings, {});
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: JSON.stringify({ ...settings, hiddenCategoryIds: [...new Set(ids)] }) } });
}

/** Categories this business can use: built-ins of its activity plus its own. */
async function visibleTo(tenantId: string, { includeHidden = false } = {}) {
  const tenant = await getTenant(tenantId);
  const [rows, hidden] = await Promise.all([
    prisma.category.findMany({
      where: { activityType: tenant.activityType, isActive: true, OR: [{ tenantId: null }, { tenantId }] },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    hiddenIds(tenantId),
  ]);
  const list = rows.map((c) => ({ ...c, builtIn: c.tenantId === null, hidden: hidden.includes(c.id), parent: null, children: [] }));
  return includeHidden ? list : list.filter((c) => !c.hidden);
}

export async function assertCategoryUsable(tenantId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const c = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!c || (c.tenantId && c.tenantId !== tenantId)) throw badRequest('Catégorie introuvable');
}

export default async function categoryRoutes(app: FastifyInstance) {
  authed(app);
  const managersOnly = (req: Req) => {
    if (!isManager(req.auth.roles)) throw forbidden('Accès refusé');
  };

  app.get('/categories', async (req: Req<unknown, Record<string, string>>) => {
    const includeHidden = qBool(req.query.all) === true;
    const list = await visibleTo(req.auth.tenantId, { includeHidden });
    // Product counts help decide what can be deleted or hidden (archived products included: they keep history).
    const counts = await prisma.product.groupBy({ by: ['categoryId'], where: { tenantId: req.auth.tenantId }, _count: true });
    const byId = new Map(counts.map((c) => [c.categoryId, c._count]));
    return ok({ categories: serialize(list.map((c) => ({ ...c, productCount: byId.get(c.id) ?? 0 }))) });
  });

  app.get('/categories/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const c = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!c || (c.tenantId && c.tenantId !== req.auth.tenantId)) throw notFound('Category', req.params.id);
    return ok({ category: serialize({ ...c, builtIn: c.tenantId === null }) });
  });

  app.post('/categories', async (req: Req<z.infer<typeof nameSchema>>, reply) => {
    managersOnly(req);
    const body = nameSchema.parse(req.body);
    const tenant = await getTenant(req.auth.tenantId);
    const existing = await visibleTo(req.auth.tenantId, { includeHidden: true });
    const clash = existing.find((c) => sameName(c.name, body.name));
    if (clash) throw conflict(`La catégorie « ${clash.name} » existe déjà`);
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    const created = await prisma.category.create({
      data: {
        tenantId: req.auth.tenantId,
        activityType: tenant.activityType,
        name: body.name,
        // Slugs are unique per activity across all businesses, so custom ones carry a random suffix.
        slug: `${slugify(body.name)}-${Math.random().toString(36).slice(2, 8)}`,
        sortOrder: body.sortOrder ?? maxOrder + 1,
      },
    });
    reply.status(201);
    return ok({ category: serialize({ ...created, builtIn: false, hidden: false, productCount: 0 }) });
  });

  app.put('/categories/:id', async (req: Req<z.infer<typeof nameSchema>, unknown, { id: string }>) => {
    managersOnly(req);
    const c = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!c || (c.tenantId && c.tenantId !== req.auth.tenantId)) throw notFound('Category', req.params.id);
    if (!c.tenantId) throw badRequest('Les catégories intégrées ne peuvent pas être modifiées');
    const body = nameSchema.parse(req.body);
    const clash = (await visibleTo(req.auth.tenantId, { includeHidden: true })).find((x) => x.id !== c.id && sameName(x.name, body.name));
    if (clash) throw conflict(`La catégorie « ${clash.name} » existe déjà`);
    const updated = await prisma.category.update({ where: { id: c.id }, data: { name: body.name, ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }) } });
    return ok({ category: serialize({ ...updated, builtIn: false }) });
  });

  /** Hide / show a built-in category for this business (only when no live product uses it). */
  app.patch('/categories/:id/visibility', async (req: Req<{ hidden: boolean }, unknown, { id: string }>) => {
    managersOnly(req);
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    const c = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!c || c.tenantId) throw notFound('Category', req.params.id);
    if (hidden) {
      const used = await prisma.product.count({ where: { tenantId: req.auth.tenantId, categoryId: c.id, status: { not: 'archived' } } });
      if (used) throw conflict(`Catégorie utilisée par ${used} produit(s)`);
    }
    const ids = await hiddenIds(req.auth.tenantId);
    await setHidden(req.auth.tenantId, hidden ? [...ids, c.id] : ids.filter((x) => x !== c.id));
    return ok({ id: c.id, hidden });
  });

  /**
   * Deletes one of the business's own categories. Products using it (archived ones included) must be moved:
   * pass `reassignTo` (another usable category) to move them in the same transaction, otherwise the request is refused.
   */
  app.delete('/categories/:id', async (req: Req<unknown, Record<string, string>, { id: string }>) => {
    managersOnly(req);
    const c = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!c || (c.tenantId && c.tenantId !== req.auth.tenantId)) throw notFound('Category', req.params.id);
    if (!c.tenantId) throw badRequest('Les catégories intégrées ne peuvent pas être supprimées');
    const used = await prisma.product.count({ where: { categoryId: c.id } });
    const reassignTo = req.query.reassignTo || null;
    if (used && !reassignTo) throw conflict(`Catégorie utilisée par ${used} produit(s)`);
    if (reassignTo) {
      if (reassignTo === c.id) throw badRequest('Catégorie introuvable');
      await assertCategoryUsable(req.auth.tenantId, reassignTo);
    }
    await prisma.$transaction(async (tx) => {
      if (used) await tx.product.updateMany({ where: { categoryId: c.id }, data: { categoryId: reassignTo } });
      await tx.labelTemplate.deleteMany({ where: { tenantId: req.auth.tenantId, categoryId: c.id } });
      await tx.category.delete({ where: { id: c.id } });
    });
    return ok({ deleted: true, moved: used });
  });
}

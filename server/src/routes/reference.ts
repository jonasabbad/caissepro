import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { getTenant } from '../lib/tenant.js';

const accessoryCatalog = JSON.parse(
  readFileSync(new URL('../data/accessory-catalog.json', import.meta.url), 'utf8'),
);

/** Read-only reference data: product categories and accessory quick-add templates. */
export default async function referenceRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/categories', async (req) => {
    const tenant = await getTenant(req.auth.tenantId);
    const categories = await prisma.category.findMany({
      where: { activityType: tenant.activityType, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return ok({ categories: serialize(categories.map((c) => ({ ...c, parent: null, children: [] }))) });
  });

  app.get('/categories/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!category) throw notFound('Category', req.params.id);
    return ok({ category: serialize(category) });
  });

  app.get('/accessory-catalog', async () => ok({ templates: accessoryCatalog }));
}

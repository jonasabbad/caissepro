import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { authed, ok } from '../lib/route.js';

const accessoryCatalog = JSON.parse(
  readFileSync(new URL('../data/accessory-catalog.json', import.meta.url), 'utf8'),
);

/** Read-only reference data: accessory quick-add templates (categories: routes/categories.ts). */
export default async function referenceRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/accessory-catalog', async () => ok({ templates: accessoryCatalog }));
}

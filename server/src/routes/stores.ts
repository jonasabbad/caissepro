import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok } from '../lib/route.js';

export default async function storesRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/stores', async (req) => {
    const stores = await prisma.store.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    return ok({ stores: serialize(stores) });
  });

  app.get('/stores/active', async (req) => {
    const stores = await prisma.store.findMany({
      where: { tenantId: req.auth.tenantId, isActive: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
    return ok({ stores: serialize(stores) });
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';

/** Tenant-facing platform features: announcements and thermal-paper orders. */
export default async function platformRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/tenant/announcements/active', async () => {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ announcements: serialize(announcements) });
  });

  const paperOrderSchema = z.object({
    paperType: z.enum(['caisse', 'produits']),
    quantity: z.coerce.number().int().min(1).max(1000),
    note: z.string().trim().max(1000).optional(),
  });

  app.post('/paper-orders', async (req: Req<z.infer<typeof paperOrderSchema>>) => {
    const body = paperOrderSchema.parse(req.body);
    const order = await prisma.paperOrder.create({ data: { tenantId: req.auth.tenantId, ...body } });
    return ok({ order: serialize(order) });
  });

  app.get('/paper-orders/mine', async (req) => {
    const orders = await prisma.paperOrder.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return ok({ orders: serialize(orders) });
  });
}

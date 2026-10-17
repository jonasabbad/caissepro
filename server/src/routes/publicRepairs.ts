import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { ok, type Req } from '../lib/route.js';

/**
 * Public repair status, reached by scanning the QR code on the repair ticket. No sign-in: the token in the link
 * is the only key, and the answer holds no customer data and no prices.
 */
export default async function publicRepairRoutes(app: FastifyInstance) {
  app.get('/public/repairs/:token', async (req: Req<unknown, unknown, { token: string }>) => {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('Repair');
    const r = await prisma.repair.findUnique({ where: { trackingToken: token } });
    if (!r) throw notFound('Repair');
    const store = r.storeId ? await prisma.store.findUnique({ where: { id: r.storeId } }) : null;
    const tenant = await prisma.tenant.findUnique({ where: { id: r.tenantId } });
    return ok({
      repair: {
        repairNumber: r.repairNumber,
        deviceDescription: r.deviceDescription,
        status: r.status,
        receivedAt: r.receivedAt,
        estimatedCompletionAt: r.estimatedCompletionAt,
        completedAt: r.completedAt,
        deliveredAt: r.deliveredAt,
        updatedAt: r.updatedAt,
      },
      store: { name: store?.name ?? tenant?.name ?? '', phone: store?.phone ?? null, address: store?.address ?? null, city: store?.city ?? null },
    });
  });
}

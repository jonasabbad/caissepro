import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '../lib/prisma.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { dateRange, qStr } from '../lib/pagination.js';

const USER_SELECT = { id: true, email: true, firstName: true, lastName: true } as const;

export default async function inventoryRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/inventory-movements', async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const type = qStr(q.type);
    const where: Prisma.InventoryMovementWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.productId) ? { productId: q.productId } : {}),
      // "transfer" in the filter covers both directions.
      ...(type ? { type: type === 'transfer' ? { in: ['transfer', 'transfer_in', 'transfer_out'] } : type } : {}),
      ...(dateRange(q.dateFrom ?? q.startDate, q.dateTo ?? q.endDate) ? { createdAt: dateRange(q.dateFrom ?? q.startDate, q.dateTo ?? q.endDate) } : {}),
    };
    const movements = await prisma.inventoryMovement.findMany({
      where,
      // The list shows only the product's name and SKU (the full product made each row several times larger).
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(2000, parseInt(q.limit ?? '1000', 10) || 1000),
    });
    const creatorIds = [...new Set(movements.map((m) => m.createdBy).filter(Boolean))] as string[];
    const creators = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: USER_SELECT });
    const byId = new Map(creators.map((u) => [u.id, u]));
    return ok({
      movements: serialize(movements.map((m) => ({ ...m, creator: m.createdBy ? (byId.get(m.createdBy) ?? null) : null }))),
    });
  });
}

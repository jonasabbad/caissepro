import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { isManager } from '../lib/auth.js';
import { forbidden } from '../lib/errors.js';
import { resolveStoreId } from '../lib/tenant.js';

const employeeSchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire'),
  lastName: z.string().trim().optional().default(''),
  phone: z.string().optional().nullable(),
  storeId: z.string().optional().nullable(),
  role: z.string().optional(),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

/** Sellers: people credited with sales at the till (they don't need a user account). */
export default async function employeeRoutes(app: FastifyInstance) {
  authed(app);

  const withStores = async <T extends { storeId: string | null; userId: string | null }>(rows: T[]) => {
    const stores = await prisma.store.findMany({ where: { id: { in: rows.map((r) => r.storeId).filter(Boolean) as string[] } } });
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId).filter(Boolean) as string[] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const s = new Map(stores.map((x) => [x.id, x]));
    const u = new Map(users.map((x) => [x.id, x]));
    return rows.map((r) => ({ ...r, store: r.storeId ? (s.get(r.storeId) ?? null) : null, user: r.userId ? (u.get(r.userId) ?? null) : null }));
  };

  app.get('/employees', async (req: Req<unknown, { activeOnly?: string }>) => {
    const rows = await prisma.employee.findMany({
      where: { tenantId: req.auth.tenantId, ...(req.query.activeOnly === 'true' ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    });
    return ok({ employees: serialize(await withStores(rows)) });
  });

  /** Sellers selectable at the till for the current store, plus the one linked to the logged-in user. */
  app.get('/employees/sellable', async (req) => {
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const rows = await prisma.employee.findMany({
      where: { tenantId: req.auth.tenantId, isActive: true, OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])] },
      orderBy: { firstName: 'asc' },
    });
    const self = rows.find((r) => r.userId === req.auth.userId);
    return ok({ employees: serialize(rows), selfEmployeeId: self?.id ?? null });
  });

  app.get('/employees/linkable-users', async (req) => {
    const linked = (await prisma.employee.findMany({ where: { tenantId: req.auth.tenantId, userId: { not: null } }, select: { userId: true } })).map((e) => e.userId!);
    const users = await prisma.user.findMany({
      where: { tenantId: req.auth.tenantId, isActive: true, id: { notIn: linked } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return ok({ users });
  });

  app.post('/employees', async (req: Req<z.infer<typeof employeeSchema>>, reply) => {
    if (!isManager(req.auth.roles)) throw forbidden();
    const body = employeeSchema.parse(req.body);
    const e = await prisma.employee.create({ data: { tenantId: req.auth.tenantId, ...body, storeId: body.storeId || null } });
    reply.status(201);
    return ok({ employee: serialize((await withStores([e]))[0]) });
  });

  app.put('/employees/:id', async (req: Req<z.infer<typeof employeeSchema>, unknown, { id: string }>) => {
    if (!isManager(req.auth.roles)) throw forbidden();
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Employee', req.params.id);
    const body = employeeSchema.partial().parse(req.body);
    const e = await prisma.employee.update({
      where: { id: existing.id },
      data: { ...body, ...(body.storeId !== undefined && { storeId: body.storeId || null }) },
    });
    return ok({ employee: serialize((await withStores([e]))[0]) });
  });

  /** Deactivation keeps the seller's sales history. */
  app.delete('/employees/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    if (!isManager(req.auth.roles)) throw forbidden();
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Employee', req.params.id);
    const e = await prisma.employee.update({ where: { id: existing.id }, data: { isActive: false } });
    return ok({ employee: serialize(e) });
  });

  app.post('/employees/:id/link-user', async (req: Req<{ userId: string }, unknown, { id: string }>) => {
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Employee', req.params.id);
    const user = await prisma.user.findFirst({ where: { id: req.body?.userId, tenantId: req.auth.tenantId } });
    if (!user) throw badRequest('Compte introuvable');
    const e = await prisma.employee.update({ where: { id: existing.id }, data: { userId: user.id } });
    return ok({ employee: serialize(e) });
  });

  app.delete('/employees/:id/link-user', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!existing) throw notFound('Employee', req.params.id);
    const e = await prisma.employee.update({ where: { id: existing.id }, data: { userId: null } });
    return ok({ employee: serialize(e) });
  });
}

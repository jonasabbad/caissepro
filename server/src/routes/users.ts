import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { hashPassword, requireRoles, revokeUserTokens } from '../lib/auth.js';
import { tenantLimits, tenantUsage } from './subscriptions.js';

const ROLES = ['admin', 'manager', 'cashier'] as const;
const userSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères').optional(),
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire'),
  roles: z.array(z.enum(ROLES)).min(1).default(['cashier']),
  currentStoreId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const publicUser = { id: true, tenantId: true, email: true, firstName: true, lastName: true, roles: true, isActive: true, currentStoreId: true, lastLoginAt: true, createdAt: true, updatedAt: true } as const;

/** Team accounts (cashiers and managers) of the tenant; only the owner manages them, within the plan's user limit. */
export default async function userRoutes(app: FastifyInstance) {
  authed(app);
  app.addHook('preHandler', requireRoles('admin'));

  const load = async (tenantId: string, id: string) => {
    const u = await prisma.user.findFirst({ where: { id, tenantId }, select: publicUser });
    if (!u) throw notFound('User', id);
    return u;
  };
  const assertStore = async (tenantId: string, storeId?: string | null) => {
    if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, tenantId } }))) throw badRequest('Magasin introuvable');
  };

  app.get('/users', async (req) => {
    const users = await prisma.user.findMany({ where: { tenantId: req.auth.tenantId }, select: publicUser, orderBy: { createdAt: 'asc' } });
    return ok({ users: serialize(users) });
  });

  app.get('/users/:id', async (req: Req<unknown, unknown, { id: string }>) => ok({ user: serialize(await load(req.auth.tenantId, req.params.id)) }));

  app.post('/users', async (req: Req<z.infer<typeof userSchema>>, reply) => {
    const body = userSchema.parse(req.body);
    if (!body.password) throw badRequest('Le mot de passe est requis pour créer un nouvel utilisateur');
    const [usage, limits] = await Promise.all([tenantUsage(req.auth.tenantId), tenantLimits(req.auth.tenantId)]);
    if (limits.maxUsers != null && usage.users >= limits.maxUsers) throw forbidden(`Limite d'utilisateurs atteinte pour votre plan (${limits.maxUsers})`, 'PLAN_LIMIT');
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Un utilisateur avec cet email existe déjà');
    await assertStore(req.auth.tenantId, body.currentStoreId);
    const user = await prisma.user.create({
      data: {
        tenantId: req.auth.tenantId,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        firstName: body.firstName,
        lastName: body.lastName,
        roles: JSON.stringify(body.roles),
        currentStoreId: body.currentStoreId || null,
      },
      select: publicUser,
    });
    reply.status(201);
    return ok({ user: serialize(user) });
  });

  app.put('/users/:id', async (req: Req<Partial<z.infer<typeof userSchema>>, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    const body = userSchema.partial().parse(req.body);
    if (body.email && body.email !== existing.email && (await prisma.user.findUnique({ where: { email: body.email } }))) throw conflict('Un utilisateur avec cet email existe déjà');
    if (existing.id === req.auth.userId && body.roles && !body.roles.includes('admin')) throw badRequest('Vous ne pouvez pas retirer votre propre rôle de propriétaire');
    await assertStore(req.auth.tenantId, body.currentStoreId);
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(body.email && { email: body.email }),
        ...(body.firstName && { firstName: body.firstName }),
        ...(body.lastName && { lastName: body.lastName }),
        ...(body.roles && { roles: JSON.stringify(body.roles) }),
        ...(body.currentStoreId !== undefined && { currentStoreId: body.currentStoreId || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.password && { passwordHash: await hashPassword(body.password) }),
      },
      select: publicUser,
    });
    if (body.password || body.isActive === false) await revokeUserTokens(user.id);
    return ok({ user: serialize(user) });
  });

  /** Removes the account; its sales keep the cashier id for history. Employees linked to it are unlinked. */
  app.delete('/users/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const existing = await load(req.auth.tenantId, req.params.id);
    if (existing.id === req.auth.userId) throw badRequest('Vous ne pouvez pas supprimer votre propre compte ici');
    await prisma.$transaction([
      prisma.employee.updateMany({ where: { userId: existing.id }, data: { userId: null } }),
      prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
      prisma.user.delete({ where: { id: existing.id } }),
    ]);
    return ok({ deleted: true });
  });
}

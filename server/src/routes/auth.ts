import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  authenticate,
  issueTokens,
  revokeUserTokens,
  rotateRefreshToken,
  verifyPassword,
} from '../lib/auth.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { parseJson } from '../lib/serialize.js';
import { ok, type Req } from '../lib/route.js';

/** The user object returned by /auth/me: user fields merged with tenant/subscription flags. */
export async function buildProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true } });
  const t = user.tenant;
  const store = user.currentStoreId ? await prisma.store.findUnique({ where: { id: user.currentStoreId } }) : null;
  return {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    roles: parseJson<string[]>(user.roles, []),
    currentStoreId: user.currentStoreId,
    firstName: user.firstName,
    lastName: user.lastName,
    sellerMode: user.sellerMode,
    applyTva: t?.applyTva ?? false,
    activityType: t?.activityType ?? 'phone_seller',
    enabledModules: parseJson<string[]>(t?.enabledModules, ['core']),
    legalStatus: t?.legalStatus ?? null,
    tenantStatus: t?.status ?? null,
    subscriptionExpiresAt: t?.subscriptionExpiresAt?.toISOString() ?? null,
    subscriptionPlan: t?.plan ?? '',
    storeName: store?.name ?? t?.name ?? '',
  };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req: Req<z.infer<typeof loginSchema>>) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw unauthorized('Adresse email ou mot de passe invalide');
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Adresse email ou mot de passe invalide');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueTokens(user.id);
    return ok({ user: await buildProfile(user.id), tokens });
  });

  app.post('/auth/refresh', async (req: Req<{ refreshToken?: string }>) => {
    const token = req.body?.refreshToken;
    if (!token) throw badRequest('refreshToken requis');
    const { userId, tokens } = await rotateRefreshToken(token);
    return ok({ user: await buildProfile(userId), tokens });
  });

  app.register(async (r) => {
    r.addHook('preHandler', authenticate);

    r.get('/auth/me', async (req) => ok({ user: await buildProfile(req.auth.userId) }));

    r.post('/auth/logout', async (req) => {
      await revokeUserTokens(req.auth.userId);
      return ok({ loggedOut: true });
    });

    // Seller mode: lock the account so it can only sell; unlocking requires the password.
    r.post('/auth/lock', async (req) => {
      await prisma.user.update({ where: { id: req.auth.userId }, data: { sellerMode: true } });
      return ok({ sellerMode: true });
    });

    r.post('/auth/unlock', async (req: Req<{ password?: string }>) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
      if (!req.body?.password || !(await verifyPassword(req.body.password, user.passwordHash))) {
        throw unauthorized('Mot de passe incorrect');
      }
      await prisma.user.update({ where: { id: user.id }, data: { sellerMode: false } });
      return ok({ sellerMode: false });
    });

    r.post('/auth/impersonation/stop', async (req) => {
      if (!req.auth.impersonatorId) throw badRequest("Aucune session d'impersonation active");
      const tokens = await issueTokens(req.auth.impersonatorId);
      return ok({ user: await buildProfile(req.auth.impersonatorId), tokens });
    });

    // Account deletion request (processed by a platform admin).
    r.delete('/auth/me', async (req: Req<{ password?: string }>) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
      if (req.body?.password && !(await verifyPassword(req.body.password, user.passwordHash))) {
        throw unauthorized('Mot de passe incorrect');
      }
      await prisma.user.update({ where: { id: user.id }, data: { accountDeletionRequestedAt: new Date() } });
      await revokeUserTokens(user.id);
      return ok({ requested: true });
    });
  });
}

import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';
import { forbidden, unauthorized } from './errors.js';
import { parseJson } from './serialize.js';

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-access-secret';
const ACCESS_TTL_SECONDS = 60 * 60 * 8;
const REFRESH_TTL_DAYS = 30;

export type Role = 'super_admin' | 'admin' | 'manager' | 'cashier' | 'viewer';

export interface AuthContext {
  userId: string;
  tenantId: string;
  storeId: string | null;
  roles: Role[];
  impersonatorId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function issueTokens(userId: string, extra: { impersonatorId?: string } = {}) {
  const accessToken = jwt.sign({ sub: userId, ...extra }, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
  const refreshToken = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
    },
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

export async function rotateRefreshToken(refreshToken: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) throw unauthorized('Session expirée');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return { userId: row.userId, tokens: await issueTokens(row.userId) };
}

export async function revokeUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Fastify preHandler: verifies the bearer token and loads the user. */
export async function authenticate(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: { sub: string; impersonatorId?: string };
  try {
    payload = jwt.verify(header.slice(7), ACCESS_SECRET) as typeof payload;
  } catch {
    throw unauthorized('Token invalide ou expiré');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw unauthorized();
  req.auth = {
    userId: user.id,
    tenantId: user.tenantId ?? '',
    storeId: user.currentStoreId,
    roles: parseJson<Role[]>(user.roles, []),
    impersonatorId: payload.impersonatorId,
  };
  (req as any).user = user;
}

export const isManager = (roles: Role[]) => roles.some((r) => r === 'admin' || r === 'manager');

export function requireRoles(...allowed: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth.roles.some((r) => allowed.includes(r))) throw forbidden();
  };
}

/**
 * Seller mode ("Verrouiller"): while the account is locked only selling-related
 * operations are allowed. Anything else answers 403 { error: "SELLER_MODE" }.
 */
export function blockInSellerMode() {
  return async (req: FastifyRequest) => {
    const user = (req as any).user;
    if (user?.sellerMode) throw forbidden('Compte verrouillé en mode vendeur', 'SELLER_MODE');
  };
}

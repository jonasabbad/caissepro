import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

let appPromise: Promise<FastifyInstance> | null = null;
export const getApp = () => (appPromise ??= buildApp());

export async function seedCategories() {
  const slugs: [string, string][] = [
    ['Smartphones', 'smartphones'],
    ['Chargeurs & Câbles', 'chargeurs-cables'],
    ['Coques & Protections', 'coques-protections'],
  ];
  for (const [i, [name, slug]] of slugs.entries()) {
    await prisma.category.upsert({
      where: { activityType_slug: { activityType: 'phone_seller', slug } },
      update: {},
      create: { activityType: 'phone_seller', name, slug, sortOrder: i + 1 },
    });
  }
}

/** Creates an isolated tenant + main store + admin and returns an API client bound to its token. */
export async function newTenant(opts: { roles?: string[]; plan?: string } = {}) {
  await seedCategories();
  const id = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      name: `T-${id}`,
      slug: `t-${id}`,
      plan: opts.plan ?? '',
      subscriptionExpiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  const store = await prisma.store.create({ data: { tenantId: tenant.id, name: `Store ${id}`, code: id.toUpperCase(), isMain: true } });
  const email = `admin-${id}@test.local`;
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: await bcrypt.hash('secret123', 4),
      firstName: 'Test',
      lastName: 'Admin',
      roles: JSON.stringify(opts.roles ?? ['admin']),
      currentStoreId: store.id,
    },
  });
  const app = await getApp();
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'secret123' } });
  const token = login.json().data.tokens.accessToken as string;
  return { tenant, store, user, token, api: client(app, token) };
}

export function client(app: FastifyInstance, token: string) {
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload !== undefined ? { payload: payload as any } : {}),
    });
    let body: any = null;
    try {
      body = res.json();
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body, headers: res.headers };
  };
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload: unknown = {}) => call('POST', url, payload),
    put: (url: string, payload: unknown = {}) => call('PUT', url, payload),
    patch: (url: string, payload: unknown = {}) => call('PATCH', url, payload),
    delete: (url: string, payload?: unknown) => call('DELETE', url, payload),
  };
}

export async function categoryId(slug: string) {
  return (await prisma.category.findFirstOrThrow({ where: { slug } })).id;
}

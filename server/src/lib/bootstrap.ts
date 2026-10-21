import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { importTacRows } from './tac.js';

const data = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

/**
 * Categories, subscription plans and platform settings. On every start only what is missing is added (names edited in
 * the app are kept); the development seed passes `refreshNames` to reset category names and order.
 */
export async function seedReferenceData({ refreshNames = false } = {}) {
  const categories = data<Record<string, [string, string][]>>('categories.json');
  for (const [activityType, list] of Object.entries(categories)) {
    for (const [i, [name, slug]] of list.entries()) {
      await prisma.category.upsert({
        where: { activityType_slug: { activityType, slug } },
        update: refreshNames ? { name, sortOrder: i + 1 } : {},
        create: { activityType, name, slug, sortOrder: i + 1 },
      });
    }
  }
  // Subscription plans (prices are editable from the super-admin area).
  const featureLabels = data<[string, string][]>('plan-features.json');
  for (const p of data<any[]>('plans.json')) {
    const { included, ...rest } = p;
    const features = JSON.stringify(featureLabels.map(([key, label]) => ({ key, label, included: included.includes(key) })));
    await prisma.subscriptionPlan.upsert({ where: { code: p.code }, update: {}, create: { ...rest, features } });
  }
  await prisma.platformSettings.upsert({ where: { id: 'platform' }, update: {}, create: { id: 'platform' } });
}

/**
 * First start of a new installation: with no user yet, creates the business and its admin from ADMIN_EMAIL,
 * ADMIN_PASSWORD (12+ characters) and BUSINESS_NAME. Does nothing once any user exists, so the variables can be
 * removed afterwards. Returns the created email, or null.
 */
export async function bootstrapFirstAdmin(env = process.env) {
  if ((await prisma.user.count()) > 0) return null;
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? '';
  if (!email || !password) return null;
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must have at least 12 characters');
  const name = env.BUSINESS_NAME?.trim() || 'CaissePro';
  const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
  const tenant = await prisma.tenant.create({ data: { name, slug, activityType: 'phone_seller', status: 'active', subscriptionExpiresAt: null } });
  const store = await prisma.store.create({ data: { tenantId: tenant.id, name, code: 'MAIN', isMain: true } });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: env.ADMIN_FIRST_NAME?.trim() || 'Admin',
      lastName: '',
      roles: JSON.stringify(['admin']),
      currentStoreId: store.id,
    },
  });
  return email;
}

/**
 * Phone models for IMEI identification (TAC → brand / model), shipped with the app in data/tac-reference.json.gz
 * (Osmocom TAC database, CC BY-SA 3.0). Loaded only while no shared TAC row exists, so imports made later with
 * `npm run tac:import` are never overwritten. Returns the number of rows loaded.
 */
export async function seedTacReference() {
  if ((await prisma.tacModel.count({ where: { tenantId: '' } })) > 0) return 0;
  const file = JSON.parse(gunzipSync(readFileSync(new URL('../data/tac-reference.json.gz', import.meta.url))).toString('utf8')) as {
    sources: { source: string; rows: [string, string, string, string | null, string | null, string | null][] }[];
  };
  let n = 0;
  for (const { source, rows } of file.sources) {
    await importTacRows(rows.map(([tac, brand, model, modelNumber, aliases, deviceType]) => ({ tac, brand, model, modelNumber, aliases, deviceType })), source);
    n += rows.length;
  }
  return n;
}

/**
 * Development seed: categories, a demo tenant with one store and an admin account.
 *   admin@caissepro.local / demo1234
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const categories: Record<string, [string, string][]> = JSON.parse(
  readFileSync(new URL('../src/data/categories.json', import.meta.url), 'utf8'),
);

async function main() {
  for (const [activityType, list] of Object.entries(categories)) {
    for (const [i, [name, slug]] of list.entries()) {
      await prisma.category.upsert({
        where: { activityType_slug: { activityType, slug } },
        update: { name, sortOrder: i + 1 },
        create: { activityType, name, slug, sortOrder: i + 1 },
      });
    }
  }

  // Subscription plans (prices are editable from the super-admin area).
  const featureLabels: [string, string][] = JSON.parse(
    readFileSync(new URL('../src/data/plan-features.json', import.meta.url), 'utf8'),
  );
  const plans: any[] = JSON.parse(readFileSync(new URL('../src/data/plans.json', import.meta.url), 'utf8'));
  for (const p of plans) {
    const { included, ...rest } = p;
    const features = JSON.stringify(featureLabels.map(([key, label]) => ({ key, label, included: included.includes(key) })));
    await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      update: {},
      create: { ...rest, features },
    });
  }
  await prisma.platformSettings.upsert({ where: { id: 'platform' }, update: {}, create: { id: 'platform' } });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo',
      slug: 'demo',
      activityType: 'phone_seller',
      status: 'active',
      subscriptionExpiresAt: null,
    },
  });

  const store =
    (await prisma.store.findFirst({ where: { tenantId: tenant.id, isMain: true } })) ??
    (await prisma.store.create({ data: { tenantId: tenant.id, name: 'Demo Store', code: 'DEMO', isMain: true } }));

  await prisma.user.upsert({
    where: { email: 'admin@caissepro.local' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@caissepro.local',
      passwordHash: await bcrypt.hash('demo1234', 10),
      firstName: 'Demo',
      lastName: 'Admin',
      roles: JSON.stringify(['admin']),
      currentStoreId: store.id,
    },
  });

  console.log('Seed complete: admin@caissepro.local / demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

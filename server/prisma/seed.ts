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

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo',
      slug: 'demo',
      activityType: 'phone_seller',
      status: 'trial',
      subscriptionExpiresAt: new Date(Date.now() + 7 * 86400_000),
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

/**
 * Development seed: categories, a demo tenant with one store and an admin account.
 *   admin@caissepro.local / demo1234
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedReferenceData } from '../src/lib/bootstrap.js';

const prisma = new PrismaClient();

async function main() {
  await seedReferenceData({ refreshNames: true });

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

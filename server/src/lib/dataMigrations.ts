import { prisma } from './prisma.js';

/**
 * One-time data migrations, each recorded in DataMigration so it runs exactly once per database.
 *
 * 2026-10-17-repair-costs: repairs linked to a stock device used to add their costs to the device's cost instead of the
 * repair (and the device's sale then counted them). Those existing repairs keep that treatment so history is not
 * counted twice; every later repair keeps its costs in its own profit.
 */
const MIGRATIONS: { id: string; run: () => Promise<number> }[] = [
  {
    id: '2026-10-17-repair-costs',
    run: async () => (await prisma.repair.updateMany({ where: { soldUnitId: { not: null } }, data: { costsCapitalized: true } })).count,
  },
];

export async function runDataMigrations() {
  const done = new Set((await prisma.dataMigration.findMany({ select: { id: true } })).map((m) => m.id));
  const applied: Record<string, number> = {};
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    applied[m.id] = await m.run();
    await prisma.dataMigration.create({ data: { id: m.id } });
  }
  return applied;
}

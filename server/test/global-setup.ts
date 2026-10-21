import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Empties the test database (TEST_DATABASE_URL, whose name is checked in vitest.config.ts) and applies every
 * migration. Its name is checked again here, on the server's side, before anything is dropped.
 */
export default async function setup() {
  rmSync(path.resolve(__dirname, '../uploads-test'), { recursive: true, force: true });
  const url = process.env.TEST_DATABASE_URL!;
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const [{ name }] = await db.$queryRawUnsafe<{ name: string }[]>('SELECT DATABASE() AS name');
    if (!/test/i.test(name ?? '')) throw new Error(`Refusing to empty "${name}": a test database name must contain "test"`);
    const tables = await db.$queryRawUnsafe<{ t: string }[]>(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      for (const { t } of tables) await tx.$executeRawUnsafe(`DROP TABLE \`${t.replace(/`/g, '')}\``);
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    });
  } finally {
    await db.$disconnect();
  }
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}

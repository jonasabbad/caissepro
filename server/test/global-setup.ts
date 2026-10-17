import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

/** Creates a fresh SQLite database for the test run (server/prisma/test.db). */
export default function setup() {
  const db = path.resolve(__dirname, '../prisma/test.db');
  rmSync(db, { force: true });
  rmSync(`${db}-journal`, { force: true });
  rmSync(path.resolve(__dirname, '../uploads-test'), { recursive: true, force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
}

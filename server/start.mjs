// Production start (npm start, or a host that runs this file): brings the database schema up to date, then starts
// the server. `prisma db push` refuses changes that would lose data, so a risky schema change stops the start
// instead of deleting anything.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
process.chdir(here('.'));
await import('./dist/env.js'); // DATABASE_URL from the environment or server/.env
// CaissePro uses SQLite: say clearly what is wrong (the kind of address only, never the value itself).
const db = process.env.DATABASE_URL ?? '';
if (!db.startsWith('file:')) {
  const kind = db ? (db.match(/^([a-z0-9+]{1,12}):/i)?.[1] ?? 'unrecognised') : 'not set';
  console.error(`DATABASE_URL must be a SQLite file path such as file:/home/<user>/caissepro-data/caissepro.db (currently: ${kind})`);
  process.exit(1);
}
const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--schema', here('prisma/schema.prisma')], { stdio: 'inherit', env: process.env });
await import('./dist/index.js');

// Production start (npm start, or a host that runs this file): applies the database migrations that are not applied
// yet, then starts the server. `prisma migrate deploy` only runs the files in prisma/migrations, in order, once each;
// it never resets or drops a database, and it stops (instead of guessing) when the database does not match them.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
process.chdir(here('.'));
await import('./dist/env.js'); // DATABASE_URL from the environment or server/.env
// CaissePro uses MariaDB / MySQL: say clearly what is wrong (the kind of address only, never the value itself).
const db = process.env.DATABASE_URL ?? '';
if (!db.startsWith('mysql://')) {
  const kind = db ? (db.match(/^([a-z0-9+]{1,12}):/i)?.[1] ?? 'unrecognised') : 'not set';
  console.error(`DATABASE_URL must be a MariaDB/MySQL address such as mysql://user:password@127.0.0.1:3306/database (currently: ${kind})`);
  process.exit(1);
}
const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', here('prisma/schema.prisma')], { stdio: 'inherit', env: process.env });
await import('./dist/index.js');

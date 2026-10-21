// Production start (npm start, or a host that runs this file): brings the database schema up to date, then starts
// the server. `prisma db push` refuses changes that would lose data, so a risky schema change stops the start
// instead of deleting anything.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
process.chdir(here('.'));
await import('./dist/env.js'); // DATABASE_URL from the environment or server/.env
const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prisma, 'db', 'push', '--skip-generate', '--schema', here('prisma/schema.prisma')], { stdio: 'inherit', env: process.env });
await import('./dist/index.js');

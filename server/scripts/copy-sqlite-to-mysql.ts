/**
 * One-way copy of an old CaissePro SQLite database into an EMPTY MariaDB / MySQL database that already has the
 * migrations applied (npx prisma migrate deploy).
 *
 *   npx tsx --env-file=.env scripts/copy-sqlite-to-mysql.ts <path/to/old.db>
 *
 * - The SQLite file is opened read-only and never changed.
 * - The target is DATABASE_URL. The copy refuses to run when any table of the target already holds rows, so it
 *   can never overwrite or mix with existing data.
 * - Everything is copied in one transaction: on any error nothing is kept. Row counts are compared at the end.
 * Requires Node.js 22.13+ (node:sqlite).
 */
import { DatabaseSync } from 'node:sqlite';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx --env-file=.env scripts/copy-sqlite-to-mysql.ts <path/to/old.db>');
  process.exit(1);
}
if (!(process.env.DATABASE_URL ?? '').startsWith('mysql://')) {
  console.error('DATABASE_URL must point to the MariaDB / MySQL database to fill');
  process.exit(1);
}

const sqlite = new DatabaseSync(file, { readOnly: true });
const models = Prisma.dmmf.datamodel.models;
const delegate = (name: string) => (prisma as any)[name[0].toLowerCase() + name.slice(1)];

// Refuse a target that is not empty.
for (const m of models) {
  const n = await delegate(m.name).count();
  if (n > 0) {
    console.error(`The target database is not empty (${m.name}: ${n} rows). Nothing was copied.`);
    process.exit(1);
  }
}

function convert(type: string, v: unknown) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'DateTime':
      return new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : (v as string | number));
    case 'Boolean':
      return v === 1 || v === true || v === '1' || v === 'true';
    case 'Decimal':
      return new Prisma.Decimal(String(v));
    case 'Int':
      return Number(v);
    case 'BigInt':
      return BigInt(v as number);
    case 'Float':
      return Number(v);
    default:
      return v;
  }
}

const counts: [string, number][] = [];
await prisma.$transaction(
  async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const m of models) {
      const table = m.dbName ?? m.name;
      const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) {
        counts.push([m.name, 0]);
        continue;
      }
      const scalars = m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      const data = rows.map((r) => Object.fromEntries(scalars.filter((f) => (f.dbName ?? f.name) in r).map((f) => [f.name, convert(f.type, r[f.dbName ?? f.name])])));
      const d = (tx as any)[m.name[0].toLowerCase() + m.name.slice(1)];
      for (let i = 0; i < data.length; i += 500) await d.createMany({ data: data.slice(i, i + 500) });
      counts.push([m.name, rows.length]);
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  },
  { timeout: 30 * 60_000, maxWait: 60_000 },
);

// Check: every table holds as many rows as in SQLite.
let ok = true;
for (const [name, n] of counts) {
  const got = await delegate(name).count();
  if (got !== n) {
    ok = false;
    console.error(`${name}: ${n} in SQLite, ${got} copied`);
  }
}
const total = counts.reduce((s, [, n]) => s + n, 0);
console.log(ok ? `Copied ${total} rows in ${counts.length} tables; every table matches.` : 'Some tables do not match (see above).');
await prisma.$disconnect();
process.exit(ok ? 0 : 1);

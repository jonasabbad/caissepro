// Checks that every message the API can return (collected from server/src) has a translation pattern
// in src/i18n/fr/serverErrors.js. Usage: node scripts/server-messages-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSrc = path.resolve(web, '../server/src');
const fr = (await import(pathToFileURL(path.join(web, 'src/i18n/fr/serverErrors.js')).href)).default.serverErrors;
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const toRegex = (t) => new RegExp(`^${esc(t).replace(/\\?\{(\w+)\\?\}/g, '(?<$1>.+?)')}$`);
const patterns = [...Object.values(fr), 'Device with IMEI {imei} already exists', '{what} with ID {id} not found', '{what} not found'].map(toRegex);

const walk = (d) => fs.readdirSync(d).flatMap((f) => (fs.statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const messages = new Set();
for (const f of walk(serverSrc).filter((f) => f.endsWith('.ts'))) {
  const s = fs.readFileSync(f, 'utf8');
  // Error helpers and zod messages.
  for (const m of s.matchAll(/(?:badRequest|conflict|forbidden|unauthorized)\(\s*(['`])((?:(?!\1).)*)\1/g)) messages.add(m[2]);
  for (const m of s.matchAll(/\.(?:min|max|email|regex|refine|positive|nonempty|int)\([^)]*?(['`])((?:(?!\1).)*[a-zé](?:(?!\1).)*)\1\)/g)) messages.add(m[2]);
}
let missing = 0;
for (const raw of messages) {
  const sample = raw.replace(/\$\{(?:[^{}]|\{[^}]*\})*\}/g, 'X1');
  if (!patterns.some((p) => p.test(sample))) {
    missing++;
    console.log('no pattern:', raw);
  }
}
console.log(`${messages.size} server messages, ${missing} without a translation pattern`);
process.exit(missing ? 1 : 0);

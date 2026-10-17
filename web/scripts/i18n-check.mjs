// Compares translation keys across locales: every key in French (the reference) must exist in the others.
// Usage: node scripts/i18n-check.mjs [locale ...]   (default: en ar)
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
async function load(locale) {
  const merged = {};
  for (const f of readdirSync(path.join(dir, locale)).filter((f) => f.endsWith('.js'))) {
    const mod = (await import(pathToFileURL(path.join(dir, locale, f)).href)).default;
    Object.assign(merged, flatten(mod));
  }
  return merged;
}

const ref = await load('fr');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'ar'];
let failed = false;
for (const loc of targets) {
  const other = await load(loc);
  const missing = Object.keys(ref).filter((k) => !(k in other));
  const extra = Object.keys(other).filter((k) => !(k in ref));
  // Placeholders like {n} must survive translation.
  const ph = (s) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort().join() : '');
  const badPh = Object.keys(ref).filter((k) => k in other && ph(ref[k]) !== ph(other[k]));
  console.log(`${loc}: ${Object.keys(other).length}/${Object.keys(ref).length} keys, ${missing.length} missing, ${extra.length} extra, ${badPh.length} placeholder mismatches`);
  for (const k of missing.slice(0, 40)) console.log(`  missing ${k}`);
  for (const k of badPh.slice(0, 20)) console.log(`  placeholders ${k}: fr=${ph(ref[k])} ${loc}=${ph(other[k])}`);
  if (missing.length || badPh.length) failed = true;
}
process.exit(failed ? 1 : 0);

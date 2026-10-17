// Strict check: template lines that still contain accented (French) letters outside translation calls.
// Usage: node scripts/i18n-accents.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
let n = 0;
for (const f of walk(src).filter((f) => f.endsWith('.vue'))) {
  const text = readFileSync(f, 'utf8');
  const start = text.indexOf('<template>');
  if (start < 0) continue;
  const offset = text.slice(0, start).split('\n').length;
  text
    .slice(start)
    .split('\n')
    .forEach((line, i) => {
      const stripped = line
        .replace(/<!--.*?-->/g, '')
        .replace(/\$?d?t\('[^']*'(,[^)]*)?\)/g, '')
        .replace(/\bt\(`[^`]*`\)/g, '');
      if (/[éèêàùçôÉÈÀ]/.test(stripped) && !/i18n-ignore/.test(line)) {
        n++;
        console.log(`${path.relative(src, f).replace(/\\/g, '/')}:${offset + i}: ${line.trim().slice(0, 120)}`);
      }
    });
}
console.log(`\n${n} lines`);

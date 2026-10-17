// Lists user-visible French text that bypasses the translation files: template text, plain attributes, and string literals.
// Usage: node scripts/i18n-scan.mjs [--count]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? (f === 'i18n' ? [] : walk(path.join(d, f))) : [path.join(d, f)]));

// French-looking: accented letters, or common French words.
const FRENCH = /[éèêàâùûçôîœÉÈÀÇ]|\b(le|la|les|des|du|un|une|et|ou|pour|sur|avec|aucun|aucune|ajouter|supprimer|annuler|enregistrer|client|produit|vente|caisse|prix|total|réparation|facture|stock|montant|date|statut|erreur|impossible|veuillez|choisir|sélectionner|rechercher|nouveau|nouvelle|modifier|payé|reste|remise|appareil|magasin|boîte|pièces?|jours?|mois|année)\b/i;
const IGNORE_LINE = /i18n-ignore|console\.(log|error|warn)|^\s*\/\/|^\s*\*|^\s*\/\*/;

const hits = [];
for (const file of walk(src).filter((f) => /\.(vue|js)$/.test(f))) {
  const rel = path.relative(src, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  if (text.includes('i18n-scan: data')) continue;
  const lines = text.split('\n');
  const tplStart = text.indexOf('<template>');
  const tplLine = tplStart < 0 ? Infinity : text.slice(0, tplStart).split('\n').length;
  lines.forEach((line, i) => {
    if (IGNORE_LINE.test(line)) return;
    const n = i + 1;
    const found = [];
    if (n >= tplLine) {
      // Text nodes outside mustaches.
      for (const m of line.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) found.push(m[1].trim());
      // Line-leading text (multi-line text nodes).
      const lead = line.match(/^\s+([A-Za-zÀ-ÿ«"'][^<>{}=]*)$/);
      if (lead && !/^[a-z-]+(=|$)|^v-|^:|^@|^#/.test(lead[1])) found.push(lead[1].trim());
      // Static attributes shown to users.
      for (const m of line.matchAll(/(?<![:@\w-])(placeholder|title|alt|aria-label|label)="([^"]+)"/g)) found.push(m[2]);
    }
    // Quoted strings (script, or bound expressions in templates).
    for (const m of line.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*?)\1/g)) {
      const s = m[2];
      if (s.length < 3 || /^[@./#\w-]+$/.test(s) || /^(bg|text|border|flex|grid|px|py|w-|h-|rounded)/.test(s)) continue;
      if (/\b(t|te|\$t)\($/.test(line.slice(0, m.index))) continue;
      found.push(s);
    }
    for (const f of found) if (f && FRENCH.test(f) && !/^[\w.]+$/.test(f)) hits.push(`${rel}:${n}: ${f.slice(0, 110)}`);
  });
}
if (process.argv.includes('--count')) {
  const byFile = {};
  for (const h of hits) byFile[h.split(':')[0]] = (byFile[h.split(':')[0]] || 0) + 1;
  for (const [f, c] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(String(c).padStart(4), f);
}
else console.log(hits.join('\n'));
console.log(`\n${hits.length} candidate strings`);

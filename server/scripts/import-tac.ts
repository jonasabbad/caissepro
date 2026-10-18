/**
 * Imports reference TAC data (TAC → manufacturer / model) used to pre-fill Add a device → Phone.
 *
 *   npm run tac:import -w server -- <file.csv|file.json> --check            report what the file covers, import nothing
 *   npm run tac:import -w server -- <file.csv|file.json> ["<source>"]        import (default source: Osmocom, CC BY-SA 3.0)
 *
 * CSV or JSON. Columns are recognised by name (tac; brand / manufacturer / vendor / name1; model / marketing_name /
 * model_name / name2 / name) or, failing that, from their contents. Importing the same source again replaces its rows.
 * The source text is shown next to every suggestion it provides (attribution).
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { importTacRows, parseTacFile, tacCoverage } from '../src/lib/tac.js';
import { prisma } from '../src/lib/prisma.js';

const DEFAULT_SOURCE = 'Osmocom TAC database (tacdb.osmocom.org), CC BY-SA 3.0';
const args = process.argv.slice(2);
const check = args.includes('--check');
const [file, source = DEFAULT_SOURCE] = args.filter((a) => a !== '--check');
if (!file) {
  console.error('Usage: npm run tac:import -w server -- <file.csv|file.json> [--check] ["<source and licence>"]');
  process.exit(1);
}

const rows = parseTacFile(readFileSync(file, 'utf8'), basename(file));
const cov = tacCoverage(rows);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
console.log(`${basename(file)}: ${cov.tacs} distinct TACs`);
console.log(`Top brands: ${cov.brands.slice(0, 10).map(([b, n]) => `${b} ${n}`).join(', ')}`);
for (const [name, c] of [['Apple', cov.apple], ['Samsung', cov.samsung]] as const) {
  console.log(
    `${name}: ${c.tacs} TACs, ${c.mappedToCatalog} mapped to catalogue models; catalogue phone models covered ${c.catalogModelsCovered}/${c.catalogModels} (${pct(c.catalogModelsCovered, c.catalogModels)})`,
  );
  if (c.missing.length) console.log(`  not covered: ${c.missing.slice(0, 25).join(', ')}${c.missing.length > 25 ? ` … (+${c.missing.length - 25})` : ''}`);
}
if (!cov.tacs) {
  console.error('No TAC rows recognised in this file: nothing to import.');
  process.exit(1);
}
if (check) {
  console.log('--check: nothing imported.');
} else {
  const n = await importTacRows(rows, source);
  console.log(`Imported ${n} TACs as "${source}".`);
}
await prisma.$disconnect();

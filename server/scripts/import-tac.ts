/**
 * Imports reference TAC data (TAC → manufacturer / model) used to pre-fill the Add device form.
 *
 *   npm run tac:import -w server -- <file.csv> "<source and licence>"
 *
 * The file is a CSV with a header containing a TAC column, a brand column (brand / manufacturer / vendor / name1) and
 * a model column (model / marketing_name / model_name / name2 / name). Examples of sources:
 * - Osmocom TAC database (community-maintained, CC BY-SA 3.0, incomplete): "Osmocom tacdb (CC BY-SA 3.0)"
 * - a licensed export (GSMA Device Database, 51Degrees, DeviceAtlas…) under that vendor's terms.
 * Importing again with the same source replaces its rows. Each row keeps the source, shown next to the suggestion.
 */
import { readFileSync } from 'node:fs';
import { importTacRows, parseTacCsv } from '../src/lib/tac.js';
import { prisma } from '../src/lib/prisma.js';

const [file, source] = process.argv.slice(2);
if (!file || !source) {
  console.error('Usage: npm run tac:import -w server -- <file.csv> "<source and licence>"');
  process.exit(1);
}
const rows = parseTacCsv(readFileSync(file, 'utf8'));
const n = await importTacRows(rows, source);
const brands = new Map<string, number>();
for (const r of rows) brands.set(r.brand, (brands.get(r.brand) ?? 0) + 1);
console.log(`${n} TACs imported from ${file} (${source}).`);
console.log('Top brands:', [...brands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b, c]) => `${b} ${c}`).join(', '));
await prisma.$disconnect();

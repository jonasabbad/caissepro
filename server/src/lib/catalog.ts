import { readFileSync } from 'node:fs';

export interface CatalogDevice {
  deviceType: string;
  brand: string;
  model: string;
  year: number | null;
  storageOptions: string[];
  colors: string[];
  ramOptions: string[];
  basePrice: number;
}

const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** Parses src/data/device-catalog.txt (see the header of that file for the format). */
function load(): CatalogDevice[] {
  const text = readFileSync(new URL('../data/device-catalog.txt', import.meta.url), 'utf8');
  const out: CatalogDevice[] = [];
  let type = 'phone';
  let brand = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const section = /^\[(\w+)\]$/.exec(line);
    if (section) {
      type = section[1];
      continue;
    }
    if (line.endsWith(':') && !line.includes('|')) {
      brand = line.slice(0, -1);
      continue;
    }
    const [model, year, storage, colors, ram] = line.split('|');
    out.push({
      deviceType: type,
      brand,
      model: model.trim(),
      year: year ? Number(year) : null,
      storageOptions: list(storage),
      colors: list(colors),
      ramOptions: list(ram),
      basePrice: 0,
    });
  }
  return out;
}

export const catalog = load();

export const catalogFor = (deviceType?: string) => (deviceType ? catalog.filter((d) => d.deviceType === deviceType) : catalog);

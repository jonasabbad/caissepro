// Draws the CaissePro Scanner home-screen icons (brand blue, white viewfinder and barcode) as PNG files in public/.
// Usage: node scripts/scanner-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const BLUE = [37, 84, 235];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4×4 supersampling for smooth edges.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / 16) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Viewfinder corners and barcode bars inside the square [c-s, c+s] (unit coordinates). */
function glyph(x, y, s) {
  const lx = (x - 0.5) / s, ly = (y - 0.5) / s; // −1…1
  const ax = Math.abs(lx), ay = Math.abs(ly);
  const t = 0.09; // stroke
  // Corners: L shapes at ±0.82, arms 0.35 long.
  const corner = (ax > 0.82 - t && ax < 0.82 + t && ay < 0.82 + t && ay > 0.47) || (ay > 0.82 - t && ay < 0.82 + t && ax < 0.82 + t && ax > 0.47);
  // Barcode: bars of varying width between −0.5 and 0.5.
  const bars = [[-0.5, -0.42], [-0.34, -0.3], [-0.22, -0.1], [-0.02, 0.04], [0.12, 0.2], [0.28, 0.32], [0.4, 0.5]];
  const bar = ay < 0.42 && bars.some(([a, b]) => lx >= a && lx <= b);
  return corner || bar;
}

function icon(size, { rounded, safe }) {
  return png(size, (x, y) => {
    if (rounded) {
      const r = 0.22, dx = Math.max(r - x, 0, x - (1 - r)), dy = Math.max(r - y, 0, y - (1 - r));
      if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
    }
    return [...(glyph(x, y, safe) ? WHITE : BLUE), 1];
  });
}

const files = {
  'scanner-icon-192.png': icon(192, { rounded: true, safe: 0.38 }),
  'scanner-icon-512.png': icon(512, { rounded: true, safe: 0.38 }),
  // Maskable: full square, drawing inside the 80 % safe zone (the launcher applies its own shape).
  'scanner-icon-maskable-512.png': icon(512, { rounded: false, safe: 0.3 }),
  // iOS rounds the corners itself and shows transparency as black.
  'scanner-apple-touch-icon.png': icon(180, { rounded: false, safe: 0.36 }),
};
for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(out, name), buf);
console.log(Object.keys(files).join(', '));

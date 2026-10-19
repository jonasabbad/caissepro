import { docIntlLocale, i18n } from '@/i18n';
import { barcodeSvg, formatBarcodeText } from '@/utils/barcode';
import { escapeHtml, printHtmlDocument, truncate } from '@/utils/printFrame';

/**
 * One renderer for every sticker: the Label Templates settings page previews with it and printing uses it, so the
 * saved template (size, margins, fonts, barcode, layout, roll or sheet) is exactly what comes out of the printer.
 * Products and phones use barcodes; QR codes are reserved for repair tracking.
 */

/** Layout of a template, with the server's defaults for anything missing (sizes in mm, fonts in pt). */
export const LAYOUT_DEFAULTS = {
  width: 50,
  height: 25,
  paddingX: 2,
  paddingY: 1,
  fontSize: 8.5,
  priceSize: 9.5,
  lineSpacing: 1.1,
  barcodeHeight: 7,
  textPosition: 'above',
  align: 'start',
  paper: 'roll',
  columns: 1,
  rows: 1,
  gapX: 2,
  gapY: 2,
  sheetMarginX: 7,
  sheetMarginY: 10,
};
export const LAYOUT_KEYS = Object.keys(LAYOUT_DEFAULTS);

/** Common sticker formats; "sheet" presets are A4 sheets of labels. */
export const LABEL_PRESETS = [
  { key: '50x25', width: 50, height: 25, paper: 'roll', columns: 1 },
  { key: '40x25', width: 40, height: 25, paper: 'roll', columns: 1 },
  { key: '40x30', width: 40, height: 30, paper: 'roll', columns: 1 },
  { key: '58x40', width: 58, height: 40, paper: 'roll', columns: 1 },
  { key: '30x20', width: 30, height: 20, paper: 'roll', columns: 1 },
  { key: '2x40x25', width: 40, height: 25, paper: 'roll', columns: 2, gapX: 2 },
  { key: 'a4-3x8', width: 70, height: 37, paper: 'sheet', columns: 3, rows: 8, gapX: 0, gapY: 0, sheetMarginX: 0, sheetMarginY: 0.5 },
  { key: 'a4-4x10', width: 48.5, height: 25.4, paper: 'sheet', columns: 4, rows: 10, gapX: 0, gapY: 0, sheetMarginX: 8, sheetMarginY: 21.5 },
  { key: 'a4-5x13', width: 38, height: 21.2, paper: 'sheet', columns: 5, rows: 13, gapX: 0, gapY: 0, sheetMarginX: 10, sheetMarginY: 10.7 },
];
const A4 = { width: 210, height: 297 };

export function normalizeLayout(tpl = {}) {
  const out = {};
  for (const [k, d] of Object.entries(LAYOUT_DEFAULTS)) {
    const v = tpl[k];
    out[k] = typeof d === 'number' ? (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d) : v || d;
  }
  out.columns = Math.max(1, Math.round(out.columns));
  out.rows = Math.max(1, Math.round(out.rows));
  return out;
}
export const layoutKey = (l) => LAYOUT_KEYS.map((k) => l[k]).join('|');

/** Page size and labels per page for a layout. */
export function pageOf(l) {
  if (l.paper === 'sheet') return { width: A4.width, height: A4.height, perPage: l.columns * l.rows };
  return { width: l.columns * l.width + (l.columns - 1) * l.gapX, height: l.height, perPage: l.columns };
}

const fmt = (n) => `${Math.round(n * 100) / 100}`;

function labelHtml(label, l) {
  const sizeOf = (role) => (role === 'price' ? l.priceSize : role === 'details' || role === 'footer' ? Math.max(5, l.fontSize - 1.5) : l.fontSize);
  const lines = (label.lines || [])
    .filter((x) => x && x.text)
    .map((x) => `<div class="ln ${x.role || ''}" dir="auto" style="font-size:${fmt(sizeOf(x.role))}pt">${escapeHtml(x.text)}</div>`)
    .join('');
  const text = `<div class="txt">${lines}</div>`;
  const code = label.barcodeSvg
    ? `<div class="code"><div class="bars">${label.barcodeSvg}</div>${label.barcodeText ? `<div class="digits">${escapeHtml(label.barcodeText)}</div>` : ''}</div>`
    : '';
  const footer = label.footer ? `<div class="ft">${escapeHtml(label.footer)}</div>` : '';
  return `<div class="lbl">${l.textPosition === 'below' ? code + text : text + code}${footer}</div>`;
}

/**
 * HTML document for groups of labels: [{ layout, labels }]. Each group uses its own page size (CSS named pages),
 * so phones whose templates differ can still print in one job.
 */
export function renderLabelsDocument(groups, { lang = i18n.global.locale.value, title = 'Labels', preview = false } = {}) {
  const css = [];
  const pages = [];
  groups.forEach((g, gi) => {
    const l = normalizeLayout(g.layout);
    const page = pageOf(l);
    const name = `p${gi}`;
    // The first layout also sets the default page, for browsers or drivers that ignore named pages.
    if (gi === 0) css.push(`@page { size: ${fmt(page.width)}mm ${fmt(page.height)}mm; margin: 0; }`);
    css.push(`@page ${name} { size: ${fmt(page.width)}mm ${fmt(page.height)}mm; margin: 0; }
.${name} { page: ${name}; width: ${fmt(page.width)}mm; height: ${fmt(page.height)}mm; }
.${name} .grid { grid-template-columns: repeat(${l.columns}, ${fmt(l.width)}mm); grid-auto-rows: ${fmt(l.height)}mm; column-gap: ${fmt(l.gapX)}mm; row-gap: ${fmt(l.gapY)}mm;
  padding: ${l.paper === 'sheet' ? `${fmt(l.sheetMarginY)}mm ${fmt(l.sheetMarginX)}mm` : '0'}; }
.${name} .lbl { padding: ${fmt(l.paddingY)}mm ${fmt(l.paddingX)}mm; }
.${name} .ln { text-align: ${l.align === 'center' ? 'center' : 'left'}; }
.${name} .ln { line-height: ${fmt(l.lineSpacing)}; }
.${name} .bars { height: ${fmt(l.barcodeHeight)}mm; }
.${name} .digits { font-size: ${fmt(Math.max(5, l.fontSize - 1.5))}pt; }`);
    const labels = g.labels.length ? g.labels : [];
    for (let i = 0; i < labels.length; i += page.perPage) {
      const cells = labels.slice(i, i + page.perPage).map((x) => labelHtml(x, l));
      pages.push(`<section class="pg ${name}"><div class="grid">${cells.join('')}</div></section>`);
    }
  });
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="ltr"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: ${preview ? '#e5e7eb; overflow: hidden' : '#fff'}; }
  body { font-family: Arial, Helvetica, 'Segoe UI', Tahoma, 'Noto Sans Arabic', 'IBM Plex Sans Arabic', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ft, .digits { unicode-bidi: plaintext; }
  .pg { overflow: hidden; background: #fff; break-after: page; page-break-after: always; }
  .pg:last-child { break-after: auto; page-break-after: auto; }
  .grid { display: grid; }
  .lbl { overflow: hidden; display: flex; flex-direction: column; ${preview ? 'outline: 1px dashed #9ca3af; outline-offset: -1px;' : ''} }
  .txt { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .ln { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; font-weight: bold; }
  .ln.details, .ln.name-light { font-weight: normal; }
  .code { flex: 0 0 auto; }
  .bars { width: 100%; }
  .digits { text-align: center; font-family: 'Courier New', Courier, monospace; letter-spacing: 0.3pt; line-height: 1.1; }
  .ft { flex: 0 0 auto; text-align: center; font-size: 5.5pt; line-height: 1.1; font-weight: bold; }
  ${preview ? '.pg + .pg { margin-top: 4mm; }' : ''}
  ${css.join('\n  ')}
</style></head>
<body>${pages.join('\n')}</body></html>`;
}

export const printLabels = (groups, opts) => printHtmlDocument(renderLabelsDocument(groups, opts));

/**
 * What every sticker needs from GET /settings/tenant: the shop name and the brand display options of
 * Settings > Printing > Label settings (stored as settings.printingSettings).
 */
export function labelContext(tenantSettings) {
  const s = tenantSettings || {};
  return { storeName: s.storeName || s.tenantName || '', printing: s.settings?.printingSettings || {} };
}

// ── Label content (what is written on a sticker), shared by previews and printing ──

// Brand display options for device names (Settings > Printing > Label settings).
export const BRAND_ABBREVIATIONS = {
  'Apple iPhone': 'IP',
  'Samsung Galaxy': 'SG',
  'Xiaomi Redmi': 'XR',
  'Xiaomi Poco': 'XP',
  Huawei: 'HW',
  Oppo: 'OP',
  Vivo: 'VV',
  Realme: 'RM',
  OnePlus: '1+',
  'Google Pixel': 'GP',
  Honor: 'HN',
  'Nothing Phone': 'NP',
};
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Google', 'Nothing', 'Huawei', 'Oppo', 'Vivo', 'Realme', 'OnePlus', 'Honor'];
/** The option chosen in Settings > Printing > Label settings: full | simplify | abbreviate | none. */
export function brandModeOf(printing = {}) {
  if (printing.showBrand === false) return 'none';
  if (printing.simplifyBrand) return 'simplify';
  if (printing.shortenBrandNames) return 'abbreviate';
  return 'full';
}

/**
 * A device name as printed on stickers, following Settings > Printing > Label settings — the only setting that
 * controls it (the settings preview uses this same function).
 * full: "Apple iPhone 15 Pro Max" · simplify: "iPhone 15 Pro Max" · abbreviate: "IP 15 Pro Max" · none: "15 Pro Max".
 */
export function deviceDisplayName(name, printing = {}) {
  const mode = brandModeOf(printing);
  const abbreviations = printing.brandAbbreviations || BRAND_ABBREVIATIONS;
  if (mode === 'none') {
    for (const series of Object.keys(abbreviations)) if (name.startsWith(`${series} `)) return name.slice(series.length + 1);
    const words = name.split(' ');
    return words.length > 1 && BRANDS.includes(words[0]) ? words.slice(1).join(' ') : name;
  }
  if (mode === 'simplify') {
    for (const b of BRANDS) if (name.startsWith(`${b} `)) return name.slice(b.length + 1);
    return name;
  }
  if (mode === 'abbreviate') {
    for (const [series, short] of Object.entries(abbreviations)) if (name.startsWith(series)) return short + name.slice(series.length);
  }
  return name;
}
const deviceName = (unit, printing) => deviceDisplayName(`${unit.brand} ${unit.model}`.trim(), printing);

const price = (v) => `${new Intl.NumberFormat(docIntlLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v) || 0)} DH`;

/** Phone / device sticker: name, specs, condition, battery, price, barcode of the IMEI (or device reference). */
export function deviceLabel(unit, tpl, { storeName = '', printing = {} } = {}) {
  const { t } = i18n.global;
  const specs = [];
  if ((tpl.includeStorage ?? tpl.includeSpecs) && unit.storage) specs.push(unit.storage);
  if ((tpl.includeColor ?? tpl.includeSpecs) && unit.color) specs.push(unit.color);
  const details = [
    specs.join(' - '),
    tpl.includeCondition && unit.condition ? t(`soldUnits.conditions.${unit.condition}`) : '',
    tpl.includeBatteryHealth && unit.batteryHealth ? `${unit.batteryHealth}%` : '',
  ].filter(Boolean);
  const code = unit.imei || unit.ref || unit.serialNumber || '';
  return {
    lines: [
      tpl.includeName !== false && { role: 'name', text: truncate(deviceName(unit, printing), 40) },
      details.length && { role: 'details', text: details.join(' · ') },
      tpl.includePrice !== false && { role: 'price', text: price(unit.salePrice) },
    ],
    barcodeSvg: barcodeSvg(code),
    barcodeText: tpl.includeImei !== false ? code : '',
    footer: tpl.includeCompany ? storeName : '',
  };
}

/** Product sticker: name, selling price, barcode. */
export function productLabel(product, tpl, { storeName = '' } = {}) {
  return {
    lines: [
      tpl.includeName !== false && { role: 'name', text: product.name || '' },
      tpl.includePrice !== false && { role: 'price', text: price(product.retailPrice) },
    ],
    barcodeSvg: barcodeSvg(product.barcode),
    barcodeText: formatBarcodeText(product.barcode).replace(/[⁦-⁩]/g, ''),
    footer: tpl.includeCompany ? storeName : '',
  };
}

/** Sample sticker for the settings preview. */
export function sampleLabel(isDevice, tpl, storeName, printing = {}) {
  return isDevice
    ? deviceLabel({ brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256 GB', color: 'Noir', condition: 'new', batteryHealth: 100, salePrice: 15500, imei: '353456789012345' }, tpl, { storeName, printing })
    : productLabel({ name: 'Coque silicone iPhone 15', retailPrice: 49, barcode: '2001234567893' }, tpl, { storeName });
}

/**
 * The product code inside a scanned QR code. A QR code can hold more than a barcode number: a web link, a GS1
 * product link or element string, JSON, or "KEY: value" lines. Returns the code to look up, or the text itself when
 * nothing more specific is found (a QR code holding just a code, e.g. "6111234567890" or "PH-123").
 */
const KEYS = ['barcode', 'code', 'ean', 'gtin', 'upc', 'sku', 'imei', 'serial', 'serialnumber', 'ref', 'reference', 'id'];
const CODE = /^[\x21-\x7e]{3,64}$/;

/** GS1: a 14-digit GTIN with a leading 0 is the 13-digit EAN printed on the product. */
const gtin = (s) => (/^0\d{13}$/.test(s) ? s.slice(1) : s);

function fromObject(o) {
  const entries = Object.entries(o || {}).map(([k, v]) => [k.toLowerCase().replace(/[^a-z]/g, ''), v]);
  for (const key of KEYS) {
    const hit = entries.find(([k, v]) => k === key && (typeof v === 'string' || typeof v === 'number') && CODE.test(String(v).trim()));
    if (hit) return key === 'gtin' ? gtin(String(hit[1]).trim()) : String(hit[1]).trim();
  }
  return null;
}

export function codeFromScan(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  // GS1 element string: (01)09506000134352… or ]C1/]Q3 prefixes from some scanners.
  const ai = text.replace(/^\][A-Za-z]\d/, '').match(/^\(01\)(\d{14})|^01(\d{14})(?=\D|$)/);
  if (ai) return gtin(ai[1] || ai[2]);

  // Web link: GS1 Digital Link (/01/<GTIN>), then a known query parameter, then the last path segment.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const dl = url.pathname.match(/\/01\/(\d{8,14})(?:\/|$)/);
      if (dl) return gtin(dl[1]);
      const fromQuery = fromObject(Object.fromEntries(url.searchParams));
      if (fromQuery) return fromQuery;
      const fromHash = fromObject(Object.fromEntries(new URLSearchParams(url.hash.slice(1))));
      if (fromHash) return fromHash;
      const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      if (CODE.test(last)) return last;
    } catch {
      /* not a valid link: handled as text below */
    }
    return text;
  }

  // JSON object.
  if (text.startsWith('{')) {
    try {
      const found = fromObject(JSON.parse(text));
      if (found) return found;
    } catch {
      /* not JSON */
    }
  }

  // "KEY: value" / "KEY=value" lines or ";"-separated pairs.
  if (/[:=]/.test(text) && /[\n;]|^\s*[A-Za-z_ ]+\s*[:=]/.test(text)) {
    const pairs = Object.fromEntries(
      text
        .split(/[\n;]+/)
        .map((line) => line.match(/^\s*([A-Za-z_ ]+?)\s*[:=]\s*(.+?)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
    const found = fromObject(pairs);
    if (found) return found;
  }

  return text;
}

/** Prints an HTML document through a hidden iframe (browser print dialog). */
export function printHtmlDocument(html) {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'absolute', width: '0', height: '0', border: 'none', left: '-9999px' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(frame);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.print();
      setTimeout(() => document.body.removeChild(frame), 1000);
    }, 100);
  };
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 3) + '...');

/** Label sizes in millimetres. "compact" fits on the back of small products and phone boxes. */
export const LABEL_SIZES = {
  compact: { width: 40, height: 25 },
  standard: { width: 50, height: 25 },
  small: { width: 30, height: 20 },
};

/**
 * Thermal labels, one per page: text lines on top, then a barcode (bars + digits), and an optional store name.
 * Each label is { barcodeSvg, barcodeText, lines: [{ text, size (pt), bold }], footer }.
 * Products and devices use barcodes only; QR codes are reserved for repair tracking.
 */
export function labelsDocument(labels, { width = 50, height = 25, lang = 'fr', title = 'Labels' } = {}) {
  const small = width <= 32;
  const one = (l) => {
    const lines = (l.lines || [])
      .filter((x) => x && x.text)
      .map((x) => `<div class="line" style="font-size:${x.size ?? 8}pt;font-weight:${x.bold === false ? 'normal' : 'bold'}">${escapeHtml(x.text)}</div>`)
      .join('');
    return `<div class="label">
<div class="text">${lines}</div>
${l.barcodeSvg ? `<div class="bars">${l.barcodeSvg}</div>` : ''}
${l.barcodeText ? `<div class="digits">${escapeHtml(l.barcodeText)}</div>` : ''}
${l.footer ? `<div class="footer">${escapeHtml(l.footer)}</div>` : ''}
</div>`;
  };
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { overflow: hidden; }
  body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
  .label { width: ${width}mm; height: ${height}mm; padding: 1mm 2mm 0.8mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .text { flex-shrink: 0; line-height: 1.1; }
  .line { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .bars { flex: 1; min-height: ${small ? 5 : 7}mm; margin-top: 0.6mm; }
  .digits { text-align: center; font-family: 'Courier New', Courier, monospace; font-size: ${small ? 6 : 7}pt; letter-spacing: 0.3pt; line-height: 1.1; }
  .footer { text-align: center; font-size: 5.5pt; line-height: 1.1; }
  @page { margin: 0; size: ${width}mm ${height}mm; }
</style></head>
<body>${labels.map(one).join('\n')}</body></html>`;
}

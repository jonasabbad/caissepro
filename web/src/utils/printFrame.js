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

/**
 * 50 × 25 mm thermal label: optional QR on the left, text lines on the right, store name in the footer.
 * `lines` is an array of { text, size (pt), bold }.
 */
export function labelDocument({ qrDataUrl, lines, footer }) {
  const body = lines
    .filter((l) => l && l.text)
    .map((l) => `<div style="font-size:${l.size ?? 9}pt;font-weight:${l.bold === false ? 'normal' : 'bold'};margin-bottom:0.5px;word-wrap:break-word">${escapeHtml(l.text)}</div>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Étiquette</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { position: relative; width: 50mm; height: 25mm; padding: 0.5mm; padding-bottom: 4mm; }
  .content { display: flex; align-items: flex-start; }
  .qr { flex-shrink: 0; margin-right: 2mm; }
  .qr img { width: 18mm; height: 18mm; display: block; }
  .info { flex: 1; text-align: left; line-height: 1.1; }
  .footer { position: absolute; bottom: 0.5mm; left: 0; right: 0; text-align: center; font-size: 7pt; font-weight: bold; }
  @page { margin: 0; size: 50mm 25mm; }
</style></head>
<body><div class="label"><div class="content">
${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="QR"></div>` : ''}
<div class="info">${body}</div></div>
${footer ? `<div class="footer">${escapeHtml(footer)}</div>` : ''}
</div></body></html>`;
}

import { docLocale, dt, intlLocale } from '@/i18n';
import { APP_CONFIG } from '@/config/constants';
import { formatCurrency } from '@/utils/format';
import { escapeHtml, printHtmlDocument } from '@/utils/printFrame';
import { getSavedPrinter, printHtml } from '@/services/printer';

const METHODS = ['cash', 'card', 'credit', 'bank_transfer', 'check', 'mobile_money'];
export const paymentLabel = (method) => (METHODS.includes(method) ? dt(`doc.methods.${method}`) : method);

export const receiptDate = (value) =>
  new Date(value).toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Getters so the wording follows the current language.
export const RECEIPT_TEXT = {
  get docLabel() {
    return dt('doc.receipt.docLabel');
  },
  get footerNote() {
    return dt('doc.receipt.thanks');
  },
  get bye() {
    return dt('doc.receipt.bye');
  },
  site: APP_CONFIG.name,
};

const row = (label, value, cls = '') => `<div class="row ${cls}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

/**
 * 80 mm thermal ticket.
 * `r`: { transactionNumber, date, cashierName, storeName, storeAddress, storePhone, customerName,
 *        items: [{ name, quantity, unitPrice, total }], subtotal, taxAmount, discount, total,
 *        paymentMethod, amountPaid, change, docLabel, extraLines, hidePayment, hideTotals, footerNote }
 */
export function receiptHtml(r) {
  const m = (v) => formatCurrency(v);
  const totals = [];
  if (!r.hideTotals) {
    totals.push(row(dt('doc.receipt.subtotal'), m(r.subtotal)));
    if (r.taxAmount > 0) totals.push(row(dt('doc.receipt.vat', { rate: 20 }), m(r.taxAmount)));
    if (r.discount > 0) totals.push(row(dt('doc.receipt.discount'), `-${m(r.discount)}`));
    totals.push('<div class="rule"></div>', row(dt('doc.receipt.grandTotal'), m(r.total), 'grand'), '<div class="dashed"></div>');
  }
  const payment = [];
  if (!r.hidePayment) {
    payment.push(row(dt('doc.receipt.payment', { method: paymentLabel(r.paymentMethod) }), m(r.amountPaid)));
    if (r.change > 0) payment.push(row(dt('doc.receipt.change'), m(r.change), 'grand'));
    payment.push('<div class="dashed"></div>');
  }
  const items = r.items.length
    ? `<table class="items"><thead><tr><th class="l">${escapeHtml(dt('doc.receipt.item'))}</th><th class="c">${escapeHtml(dt('doc.receipt.qty'))}</th><th class="r">${escapeHtml(dt('doc.receipt.total'))}</th></tr></thead><tbody>
${r.items
  .map(
    (i) =>
      `<tr><td class="l">${escapeHtml(i.name)}<div class="unit">${i.quantity} x ${escapeHtml(m(i.unitPrice))}</div></td><td class="c">${i.quantity}</td><td class="r">${escapeHtml(m(i.total))}</td></tr>`,
  )
  .join('\n')}
</tbody></table><div class="dashed"></div>`
    : '';
  const docLabel = r.docLabel || RECEIPT_TEXT.docLabel;
  return `<!DOCTYPE html>
<html lang="${docLocale()}"><head><meta charset="UTF-8"><title>${escapeHtml(docLabel)} ${escapeHtml(r.transactionNumber)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:80mm auto;margin:0}
body{width:80mm;padding:5mm 4mm 12mm;font-family:Helvetica,Arial,sans-serif;font-size:9pt;line-height:1.35;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.center{text-align:center}.store{font-size:14pt;font-weight:bold}.store-info{font-size:8pt}
.dashed{border-top:1px dashed #000;margin:2mm 0}.rule{border-top:1px solid #000;margin:2mm 0}
.info .doc{font-weight:bold}.extra{font-size:8pt;word-wrap:break-word}
.items{width:100%;border-collapse:collapse;font-size:8pt}.items th{font-weight:bold;padding-bottom:1mm}.items td{vertical-align:top;padding-bottom:1mm}
.items .l{text-align:left;word-wrap:break-word}.items .c{text-align:center;width:10mm}.items .r{text-align:right;width:20mm;white-space:nowrap}
.unit{font-size:7pt;padding-left:2mm}.row{display:flex;justify-content:space-between;gap:2mm}.row.grand{font-size:10pt;font-weight:bold}
.footer{margin-top:2mm}.footer .bye{font-size:8pt}.footer .site{font-size:7pt;margin-top:2mm}
</style></head><body>
<div class="center"><div class="store">${escapeHtml(r.storeName)}</div>
${r.storeAddress ? `<div class="store-info">${escapeHtml(r.storeAddress)}</div>` : ''}
${r.storePhone ? `<div class="store-info">${escapeHtml(dt('doc.receipt.phone', { phone: r.storePhone }))}</div>` : ''}</div>
<div class="dashed"></div>
<div class="info"><div class="doc">${escapeHtml(dt('doc.receipt.number', { label: docLabel, number: r.transactionNumber }))}</div>
<div>${escapeHtml(dt('doc.receipt.date', { date: receiptDate(r.date) }))}</div><div>${escapeHtml(dt('doc.receipt.cashier', { name: r.cashierName }))}</div>
${r.customerName ? `<div>${escapeHtml(dt('doc.receipt.customer', { name: r.customerName }))}</div>` : ''}
${(r.extraLines || []).map((l) => `<div class="extra">${escapeHtml(l)}</div>`).join('\n')}</div>
<div class="dashed"></div>
${items}${totals.join('\n')}${payment.join('\n')}
<div class="footer center"><div>${escapeHtml(r.footerNote || RECEIPT_TEXT.footerNote)}</div><div class="bye">${RECEIPT_TEXT.bye}</div><div class="site">${escapeHtml(RECEIPT_TEXT.site)}</div></div>
</body></html>`;
}

/** Thermal printer through QZ Tray when one is paired, otherwise the browser print dialog. */
export async function printReceipt(r) {
  const html = receiptHtml(r);
  if (getSavedPrinter()) {
    try {
      await printHtml(html, { widthMm: 80 });
      return;
    } catch (e) {
      console.warn('QZ print failed, falling back to browser print:', e);
    }
  }
  printHtmlDocument(html);
}

/** 80 mm-wide PDF of the ticket, downloaded as "<docLabel>-<number>.pdf". */
export async function downloadReceiptPdf(r) {
  const { jsPDF } = await import('jspdf');
  const m = (v) => formatCurrency(v).replace(/ | /g, ' ');
  const lines = [];
  const W = 80;
  const add = (text, opts = {}) => lines.push({ text, ...opts });
  add(r.storeName, { size: 13, bold: true, align: 'center' });
  if (r.storeAddress) add(r.storeAddress, { size: 8, align: 'center' });
  if (r.storePhone) add(dt('doc.receipt.phone', { phone: r.storePhone }), { size: 8, align: 'center' });
  add('-', { rule: true });
  add(dt('doc.receipt.number', { label: r.docLabel || RECEIPT_TEXT.docLabel, number: r.transactionNumber }), { bold: true });
  add(dt('doc.receipt.date', { date: receiptDate(r.date) }));
  add(dt('doc.receipt.cashier', { name: r.cashierName }));
  if (r.customerName) add(dt('doc.receipt.customer', { name: r.customerName }));
  for (const l of r.extraLines || []) add(l, { size: 8 });
  add('-', { rule: true });
  for (const i of r.items) {
    add(i.name, { right: m(i.total) });
    add(`  ${i.quantity} x ${m(i.unitPrice)}`, { size: 7 });
  }
  if (r.items.length) add('-', { rule: true });
  if (!r.hideTotals) {
    add(dt('doc.receipt.subtotal'), { right: m(r.subtotal) });
    if (r.taxAmount > 0) add(dt('doc.receipt.vat', { rate: 20 }), { right: m(r.taxAmount) });
    if (r.discount > 0) add(dt('doc.receipt.discount'), { right: `-${m(r.discount)}` });
    add(dt('doc.receipt.grandTotal'), { right: m(r.total), bold: true, size: 10 });
    add('-', { rule: true });
  }
  if (!r.hidePayment) {
    add(dt('doc.receipt.payment', { method: paymentLabel(r.paymentMethod) }), { right: m(r.amountPaid) });
    if (r.change > 0) add(dt('doc.receipt.change'), { right: m(r.change), bold: true });
    add('-', { rule: true });
  }
  add(r.footerNote || RECEIPT_TEXT.footerNote, { align: 'center' });
  add(RECEIPT_TEXT.bye, { align: 'center', size: 8 });
  add(RECEIPT_TEXT.site, { align: 'center', size: 7 });

  const height = 10 + lines.reduce((h, l) => h + (l.rule ? 3 : ((l.size ?? 9) * 0.3528 * 1.4)), 0) + 12;
  const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(height, 60)] });
  let y = 6;
  for (const l of lines) {
    if (l.rule) {
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(4, y, W - 4, y);
      y += 3;
      continue;
    }
    const size = l.size ?? 9;
    doc.setFont('helvetica', l.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lh = size * 0.3528 * 1.4;
    y += lh * 0.75;
    if (l.align === 'center') doc.text(l.text, W / 2, y, { align: 'center', maxWidth: W - 8 });
    else doc.text(l.text, 4, y, { maxWidth: l.right ? W - 30 : W - 8 });
    if (l.right) doc.text(l.right, W - 4, y, { align: 'right' });
    y += lh * 0.25;
  }
  doc.save(`${r.docLabel || RECEIPT_TEXT.docLabel}-${r.transactionNumber}.pdf`);
}

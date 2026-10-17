import { docIntlLocale, docLocale, dt } from '@/i18n';
import QRCode from 'qrcode';
import { escapeHtml } from '@/utils/printFrame';

/** Public status page encoded in the repair's QR code (falls back to the repair number for old records). */
export const repairTrackingUrl = (repair) =>
  repair?.trackingToken ? `${window.location.origin}/track/${repair.trackingToken}` : repair?.repairNumber || '';

const etaText = (repair) =>
  repair?.estimatedCompletionAt
    ? new Date(repair.estimatedCompletionAt).toLocaleDateString(docIntlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

/**
 * ReceiptModal props for a repair intake ticket. With a price the ticket shows it as the amount due on pickup;
 * without one it only lists the device and fault.
 */
export function repairReceiptProps(repair, storeName) {
  const price = Number(repair.fixedPrice) || 0;
  const customerName = repair.customer ? `${repair.customer.firstName} ${repair.customer.lastName || ''}`.trim() : undefined;
  const extraLines = [];
  if (repair.customer?.phone) extraLines.push(dt('doc.repair.clientPhone', { value: repair.customer.phone }));
  if (price <= 0) extraLines.push(dt('doc.repair.device', { value: repair.deviceDescription }));
  if (repair.soldUnit?.imei) extraLines.push(`IMEI: ${repair.soldUnit.imei}`);
  if (repair.diagnosticNotes) extraLines.push(dt('doc.repair.fault', { value: repair.diagnosticNotes }));
  if (repair.estimatedCompletionAt) extraLines.push(dt('doc.repair.eta', { date: etaText(repair) }));
  if (price > 0) extraLines.push(dt('doc.repair.payOnPickup'));
  return {
    transactionNumber: repair.repairNumber,
    date: repair.receivedAt,
    title: dt('doc.repair.title'),
    docLabel: dt('doc.repair.docLabel'),
    items: price > 0 ? [{ id: repair.id, name: repair.deviceDescription, retailPrice: price, quantity: 1, total: price }] : [],
    subtotal: price,
    tax: 0,
    total: price,
    amountPaid: 0,
    change: 0,
    paymentMethod: 'cash',
    hidePayment: true,
    hideTotals: price <= 0,
    extraLines,
    customerName,
    storeName: storeName || 'CaissePro',
    cashierName: repair.creator ? `${repair.creator.firstName} ${repair.creator.lastName || ''}`.trim() : undefined,
    footerNote: dt('doc.repair.footer'),
    // The customer scans this to follow the repair online.
    qrValue: repair.trackingToken ? repairTrackingUrl(repair) : '',
    qrCaption: dt('doc.repair.scanToTrack'),
  };
}

const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + '…');
const shortDate = (d) => new Date(d).toLocaleDateString(docIntlLocale(), { day: '2-digit', month: '2-digit', year: '2-digit' });

function labelHtml(repair, qr, storeName) {
  const client = [repair.customer?.firstName, repair.customer?.lastName].filter(Boolean).join(' ');
  const device = repair.soldUnit ? `${repair.soldUnit.brand} ${repair.soldUnit.model}` : repair.deviceDescription;
  return `<!DOCTYPE html><html lang="${docLocale()}"><head><meta charset="UTF-8"><title>${escapeHtml(dt('doc.repair.labelTitle'))}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
.label{position:relative;width:50mm;height:25mm;padding:.5mm;padding-bottom:4mm}
.content{display:flex;align-items:flex-start}.qr{flex-shrink:0;margin-right:2mm}.qr img{width:18mm;height:18mm;display:block}
.info{flex:1;text-align:left;line-height:1.15;overflow:hidden}.number{font-weight:bold;font-size:10pt}
.client{font-weight:bold;font-size:8pt}.phone{font-size:8pt}.device{font-size:7pt;word-wrap:break-word}
.footer{position:absolute;bottom:.5mm;left:0;right:0;display:flex;justify-content:space-between;padding:0 1mm;font-size:7pt;font-weight:bold}
@page{margin:0;size:50mm 25mm}
</style></head><body><div class="label"><div class="content"><div class="qr"><img src="${qr}" alt="QR"></div><div class="info">
<div class="number">${escapeHtml(repair.repairNumber)}</div>
${client ? `<div class="client">${escapeHtml(cut(client, 18))}</div>` : ''}
${repair.customer?.phone ? `<div class="phone">${escapeHtml(repair.customer.phone)}</div>` : ''}
${device ? `<div class="device">${escapeHtml(cut(device, 26))}</div>` : ''}
</div></div><div class="footer"><span>${escapeHtml(shortDate(repair.receivedAt))}</span>${storeName ? `<span>${escapeHtml(cut(storeName, 22))}</span>` : ''}</div></div></body></html>`;
}

/** 50 × 25 mm label to stick on the device: QR of the repair's tracking link, client, phone, device, intake date. */
export async function printRepairLabel(repair, storeName) {
  const qr = await QRCode.toDataURL(repairTrackingUrl(repair), { width: 200, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'absolute', left: '-9999px', width: '0', height: '0', border: 'none' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(labelHtml(repair, qr, storeName));
  doc.close();
  const img = doc.images[0];
  if (img && !img.complete) await new Promise((r) => ((img.onload = r), (img.onerror = r)));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 1000);
}

import { docIntlLocale, dt, stripBidi } from '@/i18n';
import { amountInWords } from '@/utils/amountInWords';

const mad = (v) => {
  const n = v == null || Number.isNaN(Number(v)) ? 0 : Number(v);
  return `${new Intl.NumberFormat(docIntlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ')} MAD`;
};
const day = (d) => new Date(d).toLocaleDateString(docIntlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);

/** Company block shown at the bottom of invoices, from GET /settings/tenant. */
export function companyFromSettings(s) {
  const b = s?.settings?.businessInfo || {};
  return {
    phone: s?.storePhone || b.phone || '',
    address: s?.storeAddress || b.address || '',
    ice: b.ice || '',
    rc: b.rc || '',
    patente: b.patente || '',
    identifiantFiscal: b.identifiantFiscal || '',
    taxeProfessionnelle: b.taxeProfessionnelle || '',
    cnie: b.cnie || '',
    bankName: b.bankName || '',
    accountHolder: b.accountHolder || '',
    accountNumber: b.accountNumber || '',
    rib: b.rib || '',
  };
}

export const customerLabel = (inv) =>
  inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName || ''}`.trim() : inv.customerName || dt('doc.invoice.walkIn');

/** A4 invoice in the auto-entrepreneur layout (outside the scope of TVA). Returns a Blob. */
export async function invoicePdfBlob(inv, company) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 20;
  const top = y;
  doc.setFontSize(24).setFont('helvetica', 'bold').text(dt('doc.invoice.title'), 15, y);
  y += 10;
  doc.setFontSize(11).setFont('helvetica', 'normal').text(dt('doc.invoice.number', { number: inv.invoiceNumber }), 15, y);
  y += 6;
  doc.setFontSize(10).text(dt('doc.invoice.issued', { date: day(inv.date) }), 15, y);

  doc.setFillColor(240, 240, 240).roundedRect(110, top, 85, 30, 2, 2, 'F');
  doc.setFontSize(11).setFont('helvetica', 'bold').text(dt('doc.invoice.client'), 115, top + 8);
  doc.setFontSize(10).text(cut(customerLabel(inv), 38), 115, top + 16);
  doc.setFont('helvetica', 'normal');
  const taxId = inv.customer?.ice ? `ICE: ${inv.customer.ice}` : inv.customer?.cin ? `CIN: ${inv.customer.cin}` : inv.customerTaxId ? `ICE: ${inv.customerTaxId}` : '';
  if (taxId) doc.text(taxId, 115, top + 22);
  y = Math.max(y, top + 35) + 5;

  const widths = [90, 27, 30.6, 32.4];
  const headers = [dt('doc.invoice.description'), dt('doc.invoice.quantity'), dt('doc.invoice.unitPrice'), dt('doc.invoice.total')];
  const cell = (i, x) => (i >= 2 ? { x: x + widths[i] - 2, align: 'right' } : i === 1 ? { x: x + widths[i] / 2, align: 'center' } : { x: x + 2, align: 'left' });
  doc.setFillColor(44, 82, 130).rect(15, y - 5, 180, 8, 'F');
  doc.setTextColor(255).setFontSize(10).setFont('helvetica', 'bold');
  let x = 15;
  headers.forEach((h, i) => {
    const c = cell(i, x);
    doc.text(h, c.x, y - 1, { align: c.align });
    x += widths[i];
  });
  doc.setTextColor(0).setFont('helvetica', 'normal');
  y += 5;
  (inv.items || []).forEach((item, row) => {
    if (row % 2 === 0) doc.setFillColor(249, 249, 249).rect(15, y - 4, 180, 7, 'F');
    x = 15;
    [cut(String(item.description), 40), String(item.quantity), mad(item.unitPrice), mad(item.subtotal)].forEach((v, i) => {
      const c = cell(i, x);
      doc.text(v, c.x, y, { align: c.align });
      x += widths[i];
    });
    y += 7;
  });
  doc.setDrawColor(200).line(15, y - 3, 195, y - 3);
  y += 5;
  doc.setFont('helvetica', 'bold').text(dt('doc.invoice.subtotal'), 110, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').text(mad(inv.subtotal), 190, y, { align: 'right' });
  y += 6;
  if (Number(inv.discountAmount) > 0) {
    doc.setFont('helvetica', 'bold').text(dt('doc.invoice.discount'), 110, y, { align: 'right' });
    doc.setFont('helvetica', 'normal').setTextColor(220, 38, 38).text(`-${mad(inv.discountAmount)}`, 190, y, { align: 'right' });
    doc.setTextColor(0);
    y += 6;
  }
  doc.line(100, y, 190, y);
  y += 8;
  doc.setFontSize(11).setFont('helvetica', 'bold').text(dt('doc.invoice.netTotal'), 190, y, { align: 'right' });
  y += 6;
  doc.setFontSize(10).text(dt('doc.invoice.amountNote'), 190, y, { align: 'right' });
  y += 7;
  doc.setFontSize(13).text(mad(inv.totalAmount), 190, y, { align: 'right' });
  y += 12;
  doc.setFillColor(249, 249, 249).rect(15, y, 180, 16, 'FD');
  doc.setFontSize(9).text(dt('doc.invoice.inWords'), 20, y + 6);
  doc.setFont('helvetica', 'normal').text(cap(amountInWords(inv.totalAmount)), 20, y + 12);
  y += 22;
  if (inv.notes) {
    doc.setFillColor(250, 250, 250).rect(15, y, 180, 14, 'FD');
    doc.setFont('helvetica', 'bold').text(dt('doc.invoice.notes'), 20, y + 5);
    doc.setFont('helvetica', 'normal').text(cut(inv.notes, 110), 20, y + 10);
    y += 18;
  }
  if (company) {
    y = Math.max(y, 220);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    const lines = [
      company.phone && dt('doc.invoice.phone', { value: company.phone }),
      company.address,
      company.ice && `ICE: ${company.ice}`,
      company.rc && `RC: ${company.rc}`,
      company.patente && dt('doc.invoice.patente', { value: company.patente }),
      company.identifiantFiscal && `IF: ${company.identifiantFiscal}`,
      company.taxeProfessionnelle && `TP: ${company.taxeProfessionnelle}`,
      company.cnie && `CNIE: ${company.cnie}`,
    ].filter(Boolean);
    lines.forEach((l, i) => doc.text(l, 15, y + i * 5));
    if (company.bankName || company.accountHolder || company.accountNumber || company.rib) {
      doc.setFontSize(10).setFont('helvetica', 'bold').text(dt('doc.invoice.bankDetails'), 110, y);
      doc.setFontSize(9).setFont('helvetica', 'normal');
      [
        company.bankName && dt('doc.invoice.bank', { value: company.bankName }),
        company.accountHolder && dt('doc.invoice.holder', { value: company.accountHolder }),
        company.accountNumber && dt('doc.invoice.accountNumber', { value: company.accountNumber }),
        company.rib && `RIB: ${company.rib}`,
      ]
        .filter(Boolean)
        .forEach((l, i) => doc.text(l, 110, y + 6 + i * 5));
    }
  }
  doc.setFontSize(8).setTextColor(100).setFont('helvetica', 'italic').text(dt('doc.invoice.legal'), 105, 280, { align: 'center' });
  return doc.output('blob');
}

/** One-page report: title, period, label/value summary, then tables (headers + rows of strings). */
export async function summaryPdfBlob({ title, period, summary = [], tables = [] }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 20;
  doc.setFontSize(18).setFont('helvetica', 'bold').text(title, 15, y);
  y += 7;
  if (period) {
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100).text(dt('doc.invoice.period', { from: day(period.from), to: day(period.to) }), 15, y);
    doc.setTextColor(0);
    y += 8;
  }
  summary.forEach((s, i) => {
    const col = i % 2;
    const bx = 15 + col * 92;
    if (col === 0 && i > 0) y += 16;
    doc.setFillColor(245, 245, 245).roundedRect(bx, y, 88, 13, 2, 2, 'F');
    doc.setFontSize(8).setTextColor(100).text(s.label, bx + 4, y + 5);
    doc.setFontSize(11).setTextColor(0).setFont('helvetica', 'bold').text(stripBidi(s.value), bx + 4, y + 10.5);
    doc.setFont('helvetica', 'normal');
  });
  y += summary.length ? 22 : 0;
  for (const table of tables) {
    doc.setFontSize(12).setFont('helvetica', 'bold').text(table.title, 15, y);
    y += 6;
    const w = 180 / table.headers.length;
    const header = () => {
      doc.setFillColor(44, 82, 130).rect(15, y - 4.5, 180, 7, 'F');
      doc.setTextColor(255).setFontSize(8.5).setFont('helvetica', 'bold');
      table.headers.forEach((h, i) => doc.text(h, 15 + i * w + 2, y));
      doc.setTextColor(0).setFont('helvetica', 'normal');
      y += 6;
    };
    header();
    table.rows.forEach((row, r) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
        header();
      }
      if (r % 2 === 0) doc.setFillColor(249, 249, 249).rect(15, y - 4, 180, 6, 'F');
      row.forEach((v, i) => doc.text(cut(stripBidi(v), Math.floor(w / 1.9)), 15 + i * w + 2, y));
      y += 6;
    });
    y += 6;
  }
  return doc.output('blob');
}

export { mad as formatMad, day as formatInvoiceDay };

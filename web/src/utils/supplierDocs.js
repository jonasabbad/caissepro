// i18n-scan: data — document layout; labels come from translation keys.
import { docIntlLocale, dt, i18n, intlLocale } from '@/i18n';
import { escapeHtml, printHtmlDocument } from '@/utils/printFrame';

/**
 * Supplier invoice and supplier statement documents.
 * - Print: HTML in the interface language (Arabic included, right-to-left), through the browser print dialog.
 * - PDF: jsPDF in French or English (its built-in font has no Arabic glyphs), like the other PDFs of the app.
 */

const money = (v, locale) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0).replace(/\s/g, ' ')} DH`;
const dayOf = (d, locale) => (d ? new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

function invoiceRows(inv) {
  return inv.items.map((i) => ({ name: i.productName, ref: i.reference || '', qty: i.quantity, unit: Number(i.unitCost), total: Number(i.lineTotal) }));
}

function totalsRows(inv, tr) {
  const rows = [[tr('supplierInvoices.subtotal'), Number(inv.subtotal)]];
  if (Number(inv.discount)) rows.push([tr('supplierInvoices.discount'), -Number(inv.discount)]);
  if (Number(inv.taxAmount)) rows.push([`${tr('supplierInvoices.tax')} (${Number(inv.taxRate)}%)`, Number(inv.taxAmount)]);
  if (Number(inv.extraCharges)) rows.push([inv.extraChargesLabel || tr('supplierInvoices.extraCharges'), Number(inv.extraCharges)]);
  return rows;
}

const CSS = `
  *{box-sizing:border-box} body{font-family:"Cairo","Noto Sans Arabic",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:20px;margin:0 0 4px} .muted{color:#666} .row{display:flex;justify-content:space-between;gap:24px;margin-bottom:16px}
  .box{background:#f4f4f5;border-radius:6px;padding:10px 12px;min-width:240px} table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1f2937;color:#fff;font-weight:600;padding:6px 8px;text-align:start} td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
  .num{text-align:end;white-space:nowrap;unicode-bidi:isolate;direction:ltr} .tot{width:320px;margin-inline-start:auto;margin-top:12px}
  .tot td{border:none;padding:3px 8px} .grand td{font-weight:700;font-size:14px;border-top:2px solid #111} .late{color:#b45309;font-weight:600}
  @page{size:A4;margin:12mm}`;

function htmlPage(title, body) {
  const dir = i18n.global.locale.value === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${i18n.global.locale.value}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

export function printSupplierInvoice(inv, company = {}) {
  const t = (k, p) => i18n.global.t(k, p);
  const loc = intlLocale();
  const m = (v) => money(v, loc);
  const s = inv.supplier || {};
  const lines = invoiceRows(inv)
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(r.ref)}</td><td class="num">${r.qty}</td><td class="num">${m(r.unit)}</td><td class="num">${m(r.total)}</td></tr>`)
    .join('');
  const tots = totalsRows(inv, t).map(([l, v]) => `<tr><td>${escapeHtml(l)}</td><td class="num">${m(v)}</td></tr>`).join('');
  const pays = (inv.payments || [])
    .filter((p) => !p.voidedAt)
    .map((p) => `<tr><td class="num">${dayOf(p.paidAt, loc)}</td><td>${escapeHtml(t(`supplierInvoices.methods.${p.method}`))}${p.reference ? ` · ${escapeHtml(p.reference)}` : ''}</td><td class="num">${m(p.amount)}</td></tr>`)
    .join('');
  const body = `
    <div class="row"><div><h1>${escapeHtml(t('supplierInvoices.docTitle'))}</h1>
      <div>${escapeHtml(t('supplierInvoices.number'))} : <b class="num">${escapeHtml(inv.number)}</b></div>
      ${inv.supplierRef ? `<div>${escapeHtml(t('supplierInvoices.supplierRef'))} : <span class="num">${escapeHtml(inv.supplierRef)}</span></div>` : ''}
      <div>${escapeHtml(t('supplierInvoices.invoiceDate'))} : <span class="num">${dayOf(inv.invoiceDate, loc)}</span></div>
      ${inv.dueDate ? `<div>${escapeHtml(t('supplierInvoices.dueDate'))} : <span class="num">${dayOf(inv.dueDate, loc)}</span></div>` : ''}
      <div>${escapeHtml(t('common.status'))} : ${escapeHtml(t(inv.status === 'confirmed' ? `supplierInvoices.paymentStatus.${inv.overdue ? 'overdue' : inv.paymentStatus}` : `supplierInvoices.status.${inv.status}`))}</div></div>
      <div class="box"><b>${escapeHtml(t('supplierInvoices.supplier'))}</b><br>${escapeHtml(s.name || '')}<br>
        ${[s.contactName, s.phone, s.email, [s.address, s.city].filter(Boolean).join(', ')].filter(Boolean).map(escapeHtml).join('<br>')}
        ${company.name ? `<hr><b>${escapeHtml(t('supplierInvoices.buyer'))}</b><br>${escapeHtml(company.name)}` : ''}</div></div>
    <table><thead><tr><th>${escapeHtml(t('supplierInvoices.product'))}</th><th class="num">${escapeHtml(t('supplierInvoices.reference'))}</th><th class="num">${escapeHtml(t('supplierInvoices.quantity'))}</th><th class="num">${escapeHtml(t('supplierInvoices.unitCost'))}</th><th class="num">${escapeHtml(t('supplierInvoices.lineTotal'))}</th></tr></thead><tbody>${lines}</tbody></table>
    <table class="tot"><tbody>${tots}<tr class="grand"><td>${escapeHtml(t('supplierInvoices.total'))}</td><td class="num">${m(inv.total)}</td></tr>
      <tr><td>${escapeHtml(t('supplierInvoices.paid'))}</td><td class="num">${m(inv.amountPaid)}</td></tr>
      <tr><td><b>${escapeHtml(t('supplierInvoices.remaining'))}</b></td><td class="num"><b>${m(inv.status === 'cancelled' ? 0 : inv.remaining)}</b></td></tr></tbody></table>
    ${pays ? `<h3>${escapeHtml(t('supplierInvoices.paymentHistory'))}</h3><table><tbody>${pays}</tbody></table>` : ''}
    ${inv.paymentTerms ? `<p><b>${escapeHtml(t('supplierInvoices.paymentTerms'))} :</b> ${escapeHtml(inv.paymentTerms)}</p>` : ''}
    ${inv.notes ? `<p><b>${escapeHtml(t('supplierInvoices.notes'))} :</b> ${escapeHtml(inv.notes)}</p>` : ''}`;
  printHtmlDocument(htmlPage(inv.number, body));
}

export function printSupplierStatement(st, range) {
  const t = (k, p) => i18n.global.t(k, p);
  const loc = intlLocale();
  const m = (v) => money(v, loc);
  const s = st.supplier;
  const rows = st.entries
    .map(
      (e) =>
        `<tr><td class="num">${dayOf(e.date, loc)}</td><td>${escapeHtml(t(`supplierInvoices.kind.${e.kind}`, { ref: e.reference }))}${e.method ? ` · ${escapeHtml(t(`supplierInvoices.methods.${e.method}`))}` : ''}${e.dueDate ? ` · <span class="${e.overdue ? 'late' : ''}">${escapeHtml(t('supplierInvoices.dueOn', { date: dayOf(e.dueDate, loc) }))}</span>` : ''}</td><td class="num">${e.debit ? m(e.debit) : ''}</td><td class="num">${e.credit ? m(e.credit) : ''}</td><td class="num">${m(e.balance)}</td></tr>`,
    )
    .join('');
  const period = range?.[0] ? t('supplierInvoices.period', { from: dayOf(range[0], loc), to: dayOf(range[1], loc) }) : t('supplierInvoices.allTime');
  const body = `
    <div class="row"><div><h1>${escapeHtml(t('supplierInvoices.statementDocTitle'))}</h1><div>${escapeHtml(period)}</div>
      <div class="muted">${escapeHtml(t('supplierInvoices.generatedOn', { date: dayOf(new Date(), loc) }))}</div></div>
      <div class="box"><b>${escapeHtml(s.name)}</b><br>${[s.contactName, s.phone, s.email].filter(Boolean).map(escapeHtml).join('<br>')}</div></div>
    <table><thead><tr><th>${escapeHtml(t('supplierInvoices.date'))}</th><th>${escapeHtml(t('supplierInvoices.description'))}</th><th class="num">${escapeHtml(t('supplierInvoices.debit'))}</th><th class="num">${escapeHtml(t('supplierInvoices.credit'))}</th><th class="num">${escapeHtml(t('supplierInvoices.balance'))}</th></tr></thead>
      <tbody><tr><td></td><td><i>${escapeHtml(t('supplierInvoices.openingBalance'))}</i></td><td></td><td></td><td class="num">${m(st.openingBalance)}</td></tr>${rows}</tbody></table>
    <table class="tot"><tbody>
      <tr><td>${escapeHtml(t('supplierInvoices.totalPurchases'))}</td><td class="num">${m(st.totals.purchases)}</td></tr>
      <tr><td>${escapeHtml(t('supplierInvoices.totalPaid'))}</td><td class="num">${m(st.totals.paid)}</td></tr>
      <tr class="grand"><td>${escapeHtml(t('supplierInvoices.outstanding'))}</td><td class="num">${m(st.totals.outstanding)}</td></tr>
      ${st.totals.overdue ? `<tr><td class="late">${escapeHtml(t('supplierInvoices.overdueAmount'))}</td><td class="num late">${m(st.totals.overdue)}</td></tr>` : ''}</tbody></table>`;
  printHtmlDocument(htmlPage(`${s.name}`, body));
}

// ── PDF (French / English) ──

async function newDoc() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}
const clean = (s) => String(s ?? '').replace(/[⁦-⁩‎‏]/g, '');

function table(doc, y, headers, widths, rows, aligns) {
  const x0 = 15;
  const head = () => {
    doc.setFillColor(31, 41, 55).rect(x0, y - 5, 180, 8, 'F');
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9);
    let x = x0;
    headers.forEach((h, i) => {
      doc.text(clean(h), aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y, { align: aligns[i] });
      x += widths[i];
    });
    doc.setTextColor(0).setFont('helvetica', 'normal');
    y += 8;
  };
  head();
  for (const r of rows) {
    if (y > 275) {
      doc.addPage();
      y = 20;
      head();
    }
    let x = x0;
    r.forEach((c, i) => {
      const txt = doc.splitTextToSize(clean(c), widths[i] - 4)[0] ?? '';
      doc.text(txt, aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y, { align: aligns[i] });
      x += widths[i];
    });
    doc.setDrawColor(229, 231, 235).line(x0, y + 2.5, x0 + 180, y + 2.5);
    y += 7;
  }
  return y;
}

function totalsBlock(doc, y, rows) {
  for (const [label, value, bold] of rows) {
    if (y > 280) (doc.addPage(), (y = 20));
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 10);
    doc.text(clean(label), 120, y);
    doc.text(clean(value), 195, y, { align: 'right' });
    y += 6;
  }
  return y;
}

export async function supplierInvoicePdf(inv) {
  const loc = docIntlLocale();
  const m = (v) => money(v, loc);
  const doc = await newDoc();
  const s = inv.supplier || {};
  doc.setFontSize(18).setFont('helvetica', 'bold').text(dt('supplierInvoices.docTitle'), 15, 20);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  const head = [
    `${dt('supplierInvoices.number')} : ${inv.number}`,
    inv.supplierRef ? `${dt('supplierInvoices.supplierRef')} : ${inv.supplierRef}` : null,
    `${dt('supplierInvoices.invoiceDate')} : ${dayOf(inv.invoiceDate, loc)}`,
    inv.dueDate ? `${dt('supplierInvoices.dueDate')} : ${dayOf(inv.dueDate, loc)}` : null,
  ].filter(Boolean);
  head.forEach((l, i) => doc.text(clean(l), 15, 28 + i * 5));
  doc.setFillColor(244, 244, 245).roundedRect(115, 14, 80, 32, 2, 2, 'F');
  doc.setFont('helvetica', 'bold').text(dt('supplierInvoices.supplier'), 119, 20);
  doc.setFont('helvetica', 'normal');
  [s.name, s.contactName, s.phone, [s.address, s.city].filter(Boolean).join(', ')].filter(Boolean).slice(0, 4).forEach((l, i) => doc.text(doc.splitTextToSize(clean(l), 72)[0], 119, 26 + i * 5));
  let y = table(
    doc,
    56,
    [dt('supplierInvoices.product'), dt('supplierInvoices.reference'), dt('supplierInvoices.quantity'), dt('supplierInvoices.unitCost'), dt('supplierInvoices.lineTotal')],
    [70, 35, 15, 30, 30],
    invoiceRows(inv).map((r) => [r.name, r.ref, String(r.qty), m(r.unit), m(r.total)]),
    ['left', 'left', 'right', 'right', 'right'],
  );
  y += 4;
  y = totalsBlock(doc, y, [
    ...totalsRows(inv, dt).map(([l, v]) => [l, m(v)]),
    [dt('supplierInvoices.total'), m(inv.total), true],
    [dt('supplierInvoices.paid'), m(inv.amountPaid)],
    [dt('supplierInvoices.remaining'), m(inv.status === 'cancelled' ? 0 : inv.remaining), true],
  ]);
  const pays = (inv.payments || []).filter((p) => !p.voidedAt);
  if (pays.length) {
    y += 4;
    doc.setFont('helvetica', 'bold').setFontSize(11).text(dt('supplierInvoices.paymentHistory'), 15, y);
    y = table(doc, y + 7, [dt('supplierInvoices.paymentDate'), dt('supplierInvoices.method'), dt('supplierInvoices.amount')], [40, 100, 40], pays.map((p) => [dayOf(p.paidAt, loc), `${dt(`supplierInvoices.methods.${p.method}`)}${p.reference ? ` · ${p.reference}` : ''}`, m(p.amount)]), ['left', 'left', 'right']);
  }
  doc.setFont('helvetica', 'normal').setFontSize(9);
  if (inv.paymentTerms) (doc.text(clean(`${dt('supplierInvoices.paymentTerms')} : ${inv.paymentTerms}`), 15, y + 6), (y += 6));
  if (inv.notes) doc.text(doc.splitTextToSize(clean(`${dt('supplierInvoices.notes')} : ${inv.notes}`), 180), 15, y + 6);
  doc.save(`${inv.number}.pdf`);
}

export async function supplierStatementPdf(st, range) {
  const loc = docIntlLocale();
  const m = (v) => money(v, loc);
  const doc = await newDoc();
  doc.setFontSize(16).setFont('helvetica', 'bold').text(dt('supplierInvoices.statementDocTitle'), 15, 20);
  doc.setFontSize(11).text(clean(st.supplier.name), 15, 28);
  doc.setFontSize(10).setFont('helvetica', 'normal');
  const period = range?.[0] ? dt('supplierInvoices.period', { from: dayOf(range[0], loc), to: dayOf(range[1], loc) }) : dt('supplierInvoices.allTime');
  doc.text(clean(period), 15, 34);
  doc.text(clean(dt('supplierInvoices.generatedOn', { date: dayOf(new Date(), loc) })), 15, 39);
  const rows = [
    ['', dt('supplierInvoices.openingBalance'), '', '', m(st.openingBalance)],
    ...st.entries.map((e) => [
      dayOf(e.date, loc),
      `${dt(`supplierInvoices.kind.${e.kind}`, { ref: e.reference })}${e.method ? ` · ${dt(`supplierInvoices.methods.${e.method}`)}` : ''}`,
      e.debit ? m(e.debit) : '',
      e.credit ? m(e.credit) : '',
      m(e.balance),
    ]),
  ];
  let y = table(doc, 50, [dt('supplierInvoices.date'), dt('supplierInvoices.description'), dt('supplierInvoices.debit'), dt('supplierInvoices.credit'), dt('supplierInvoices.balance')], [24, 72, 28, 28, 28], rows, ['left', 'left', 'right', 'right', 'right']);
  y = totalsBlock(doc, y + 4, [
    [dt('supplierInvoices.totalPurchases'), m(st.totals.purchases)],
    [dt('supplierInvoices.totalPaid'), m(st.totals.paid)],
    [dt('supplierInvoices.outstanding'), m(st.totals.outstanding), true],
    ...(st.totals.overdue ? [[dt('supplierInvoices.overdueAmount'), m(st.totals.overdue)]] : []),
  ]);
  doc.save(`${clean(st.supplier.name).replace(/[^\w-]+/g, '_')}-statement.pdf`);
}

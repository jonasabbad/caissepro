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

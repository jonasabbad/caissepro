import JsBarcode from 'jsbarcode';

/** EAN-13 with a valid check digit (the format of generated product codes and most retail barcodes). */
export function isEan13(code) {
  if (!/^\d{13}$/.test(code || '')) return false;
  const sum = [...code.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/**
 * Barcode as an inline SVG string: EAN-13 when the value is one, Code 128 otherwise (any text, IMEI, SKU…).
 * The SVG stretches to its container's width, so labels can size it in millimetres; the human-readable digits
 * are drawn by the label itself, not inside the bars.
 */
export function barcodeSvg(value, { height = 60, moduleWidth = 2 } = {}) {
  if (!value) return '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, String(value), {
      format: isEan13(value) ? 'EAN13' : 'CODE128',
      displayValue: false,
      height,
      width: moduleWidth,
      margin: 0,
      flat: true,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    // A value Code 128 cannot encode (non-ASCII) still gets printed as text by the caller.
    return '';
  }
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', String(value));
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('style', 'width:100%;height:100%;display:block');
  return svg.outerHTML;
}

/** Groups EAN-13 digits like the printed standard (2 000123 456789 → "2 000123 456789"); other values unchanged. */
export const formatBarcodeText = (code) => (isEan13(code) ? `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}` : String(code ?? ''));

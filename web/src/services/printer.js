// Thermal printing through QZ Tray (https://qz.io), the local print bridge used by browser POS apps.
// QZ Tray must be installed on the till computer; when it is missing every call fails gracefully and
// the app falls back to the browser print dialog.

const PRINTER_KEY = 'receipt_printer_name';
let qzPromise = null;

function loadQz() {
  if (window.qz) return Promise.resolve(window.qz);
  if (!qzPromise) {
    qzPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
      s.onload = () => resolve(window.qz);
      s.onerror = () => reject(new Error('QZ Tray script unavailable'));
      document.head.appendChild(s);
    });
  }
  return qzPromise;
}

async function connect() {
  const qz = await loadQz();
  if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 1, delay: 0 });
  return qz;
}

export const getSavedPrinter = () => localStorage.getItem(PRINTER_KEY);
export const setSavedPrinter = (name) => (name ? localStorage.setItem(PRINTER_KEY, name) : localStorage.removeItem(PRINTER_KEY));

export async function isQzAvailable() {
  try {
    await connect();
    return true;
  } catch {
    return false;
  }
}

export async function listPrinters() {
  const qz = await connect();
  return qz.printers.find();
}

/** Prints raw ESC/POS data (array of strings / commands). */
export async function printRaw(data, printerName = getSavedPrinter()) {
  if (!printerName) throw new Error('No printer configured');
  const qz = await connect();
  const config = qz.configs.create(printerName);
  await qz.print(config, data);
}

/** Prints an HTML document (receipt / label) at the given paper width in mm. */
export async function printHtml(html, { widthMm = 80, printerName = getSavedPrinter() } = {}) {
  if (!printerName) throw new Error('No printer configured');
  const qz = await connect();
  const config = qz.configs.create(printerName, { size: { width: widthMm }, units: 'mm', scaleContent: true });
  await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
}

/** ESC p 0 25 250: pulse the cash drawer connected to the receipt printer. */
export async function openCashDrawer() {
  await printRaw(['\x1B\x70\x00\x19\xFA']);
}

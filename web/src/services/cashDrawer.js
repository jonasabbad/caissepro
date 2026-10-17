// Cash drawer connected to this workstation through a serial / USB-serial port (Web Serial API, Chrome & Edge).
// The server answers cash operations with `x-cash-drawer: open`; the HTTP client then calls popCashDrawerIfConfigured().
// Pairing is per workstation and kept in localStorage.

const KEYS = { paired: 'cash_drawer_paired', device: 'cash_drawer_device', command: 'cash_drawer_command', baud: 'cash_drawer_baud' };
/** ESC p 0 25 250 — the usual ESC/POS drawer kick. */
export const DEFAULT_DRAWER_COMMAND = '1B 70 00 19 FA';
export const DEFAULT_DRAWER_BAUD = 9600;
const TIMEOUT_MS = 5000;

const serial = () => (typeof navigator !== 'undefined' && navigator.serial) || null;
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export const isCashDrawerSupported = () => serial() !== null;
export const isCashDrawerPaired = () => read(KEYS.paired) === '1';
export const getDrawerCommand = () => read(KEYS.command) || DEFAULT_DRAWER_COMMAND;
export function getDrawerBaudRate() {
  const n = Number(read(KEYS.baud));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DRAWER_BAUD;
}
export function saveDrawerSettings(command, baud) {
  write(KEYS.command, command.trim() || DEFAULT_DRAWER_COMMAND);
  write(KEYS.baud, String(baud > 0 ? baud : DEFAULT_DRAWER_BAUD));
}

/** "1B 70 00 19 FA" / "0x1b,0x70,…" → bytes; null when not valid hex. */
export function parseDrawerCommand(text) {
  const hex = text.replace(/0x/gi, '').replace(/[\s,]+/g, '');
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const portId = (port) => {
  const { usbVendorId, usbProductId } = port.getInfo();
  return `${usbVendorId ?? ''}:${usbProductId ?? ''}`;
};

async function pairedPort() {
  const s = serial();
  if (!s) return null;
  try {
    const ports = await s.getPorts();
    if (!ports.length) return null;
    const id = read(KEYS.device);
    return ports.find((p) => portId(p) === id) ?? ports[0];
  } catch {
    return null;
  }
}

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(t));
  });

async function kick(port) {
  const bytes = parseDrawerCommand(getDrawerCommand());
  if (!bytes) throw new Error('INVALID_COMMAND');
  await port.open({ baudRate: getDrawerBaudRate() });
  try {
    const writer = port.writable?.getWriter();
    if (!writer) throw new Error('PORT_NOT_WRITABLE');
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  } finally {
    await port.close();
  }
}

// Kicks are serialised: two sales in a row must not open the port twice at once.
let queue = Promise.resolve();
function enqueue(port) {
  const run = queue.then(() => withTimeout(kick(port), TIMEOUT_MS));
  queue = run.catch(() => undefined);
  return run;
}

/** Asks the user to pick the port, sends one kick to prove it works, then remembers it. */
export async function pairCashDrawer() {
  const s = serial();
  if (!s) throw new Error('NOT_SUPPORTED');
  const port = await s.requestPort();
  await enqueue(port);
  write(KEYS.device, portId(port));
  write(KEYS.paired, '1');
}

export async function unpairCashDrawer() {
  const port = await pairedPort();
  write(KEYS.paired, null);
  write(KEYS.device, null);
  try {
    if (port?.forget) await port.forget();
  } catch {
    /* already forgotten */
  }
}

export async function openCashDrawer() {
  const port = await pairedPort();
  if (!port) throw new Error('NOT_PAIRED');
  return enqueue(port);
}

export async function popCashDrawerIfConfigured() {
  if (!isCashDrawerPaired()) return;
  const port = await pairedPort();
  if (!port) return;
  try {
    await enqueue(port);
  } catch (e) {
    console.warn('Cash drawer could not be opened:', e);
  }
}

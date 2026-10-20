import { onBeforeUnmount, onMounted, reactive } from 'vue';
import { scannerApi } from '@/api/scanner';

/**
 * This computer as a receiver of phone scans. The browser registers once as a "computer" (its id is kept in
 * localStorage, so every tab and every restart is the same computer) and long-polls for the scans of the phones that
 * send to it. A scan goes to the page that is open, through the same handler as its own camera / USB scanner (POS:
 * add to the cart; product form: fill the barcode; …); pages without a handler show "Scan to identify".
 * With several tabs open, only the tab used last handles a scan, so it is never added twice.
 */
const SCREEN_KEY = 'caissepro_scanner_screen';
const ACTIVE_TAB_KEY = 'caissepro_scanner_active_tab';
const tabId = Math.random().toString(36).slice(2);
const state = reactive({ screen: null, lanAddresses: [], online: false, error: '', lastScan: null, devicesVersion: 0 });
const handlers = [];
let fallback = null;
let loop = null;
let after = 0;
let boot = '';

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: this tab only */
  }
};
const markActive = () => document.visibilityState === 'visible' && write(ACTIVE_TAB_KEY, tabId);
const isActiveTab = () => (read(ACTIVE_TAB_KEY) || tabId) === tabId;

/** "Windows · Sara": a default name the user can change. */
function defaultName(firstName) {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : /CrOS/.test(ua) ? 'Chromebook' : 'Ordinateur';
  return [os, firstName].filter(Boolean).join(' · ').slice(0, 40);
}

function dispatch(e) {
  if (e.kind === 'devices') return state.devicesVersion++;
  if (e.kind !== 'scan' || !isActiveTab()) return;
  state.lastScan = { code: e.code, deviceName: e.deviceName, at: new Date() };
  (handlers.at(-1) || fallback)?.(e.code, e);
}

async function register(firstName) {
  const saved = read(SCREEN_KEY);
  const r = await scannerApi.registerScreen(saved, defaultName(firstName));
  state.screen = r.screen;
  state.lanAddresses = r.lanAddresses || [];
  state.online = true;
  state.error = '';
  if (r.screen.id !== saved) {
    write(SCREEN_KEY, r.screen.id);
    after = 0;
    boot = '';
  }
}

async function run(firstName) {
  const ctrl = new AbortController();
  loop = ctrl;
  let failures = 0;
  while (loop === ctrl) {
    try {
      if (!state.screen) await register(firstName);
      const r = await scannerApi.events(state.screen.id, after, boot, ctrl.signal);
      if (loop !== ctrl) return;
      failures = 0;
      state.online = true;
      state.error = '';
      // A restarted server numbers its events from 1 again (it sent them all since 0).
      if (r.boot !== boot) (boot = r.boot), (after = 0);
      for (const e of r.events) {
        after = Math.max(after, e.seq);
        dispatch(e);
      }
    } catch (e) {
      if (loop !== ctrl) return;
      // This computer was removed (another business, or data reset): register again.
      if (e?.response?.status === 404) state.screen = null;
      // Signed out: stop (the next sign-in starts again).
      if (e?.response?.status === 401) return stop();
      failures++;
      state.online = false;
      state.error = 'offline';
      await new Promise((res) => setTimeout(res, Math.min(15_000, 1000 * 2 ** failures)));
    }
  }
}

function stop() {
  loop?.abort();
  loop = null;
  state.online = false;
}

// Computers and large tablets receive; a phone using CaissePro is a scanner, not a receiver.
const DESKTOP = '(min-width: 1024px)';

/** Starts listening (once per tab); stops when the layout that started it goes away (sign-out). */
export function useScreenReceiver(firstName) {
  onMounted(() => {
    if (!window.matchMedia?.(DESKTOP).matches) return;
    markActive();
    window.addEventListener('focus', markActive);
    document.addEventListener('visibilitychange', markActive);
    if (!loop) run(firstName);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('focus', markActive);
    document.removeEventListener('visibilitychange', markActive);
    stop();
  });
}

async function renameScreen(name) {
  if (!state.screen) return;
  state.screen = await scannerApi.renameScreen(state.screen.id, name);
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
/** Address a phone opens: this page's address, or this computer's network address when the page is on localhost. */
function phoneUrl(token, host) {
  if (!token) return '';
  const { protocol, hostname, port } = window.location;
  const h = LOCAL.test(hostname) ? host || state.lanAddresses[0] || hostname : hostname;
  return `${protocol}//${h}${port ? `:${port}` : ''}/scanner#p=${token}`;
}

export function usePhoneScanner() {
  return { state, renameScreen, phoneUrl };
}

/** A page's scan handler while it is open (the latest mounted page wins). */
export function usePhoneScanHandler(fn) {
  onMounted(() => handlers.push(fn));
  onBeforeUnmount(() => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  });
}

/** Where scans go when the open page has no handler of its own. */
export function setPhoneScanFallback(fn) {
  fallback = fn;
}

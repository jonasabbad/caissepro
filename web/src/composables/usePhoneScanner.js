import { computed, onBeforeUnmount, onMounted, reactive } from 'vue';
import { scannerApi } from '@/api/scanner';

/**
 * Phone paired as a barcode scanner for this screen (each screen has its own pairing). Scans arrive by long polling and go
 * to the page that is open, through the same handler as its own camera / USB scanner (POS: add to the cart; product
 * form: fill the barcode; …). Pages without a handler show "Scan to identify". The pairing survives a page reload
 * in this tab (sessionStorage) and stops on Disconnect, a new pairing, or after 12 hours.
 */
const KEY = 'phone_scanner_pairing';
const state = reactive({ pairing: null, token: '', lanAddresses: [], lastCode: '', lastAt: null, error: '' });
const handlers = [];
let fallback = null;
let loop = null;
let after = 0;
let boot = '';

function save() {
  try {
    if (state.pairing) sessionStorage.setItem(KEY, JSON.stringify({ pairing: state.pairing, token: state.token, lanAddresses: state.lanAddresses, after, boot }));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the pairing lasts until the page is reloaded */
  }
}

function dispatch(code) {
  state.lastCode = code;
  state.lastAt = new Date();
  const h = handlers.at(-1) || fallback;
  h?.(code);
}

async function run() {
  const id = state.pairing?.id;
  const ctrl = new AbortController();
  loop = ctrl;
  let failures = 0;
  while (loop === ctrl && state.pairing?.id === id) {
    try {
      const r = await scannerApi.events(id, after, boot, ctrl.signal);
      // A newer pairing replaced this one meanwhile: leave it alone.
      if (loop !== ctrl || state.pairing?.id !== id) return;
      failures = 0;
      state.error = '';
      state.pairing = r.pairing;
      // A restarted server numbers its scans from 1 again (it sent them all since 0).
      if (r.boot !== boot) (boot = r.boot), (after = 0);
      for (const e of r.events) {
        after = Math.max(after, e.seq);
        dispatch(e.code);
      }
      save();
      if (!r.pairing.active) return clear();
    } catch (e) {
      if (loop !== ctrl || state.pairing?.id !== id) return;
      if (e?.response?.status === 404) return clear();
      failures++;
      state.error = 'offline';
      await new Promise((res) => setTimeout(res, Math.min(10_000, 1000 * 2 ** failures)));
    }
  }
}

function clear() {
  loop?.abort();
  loop = null;
  state.pairing = null;
  state.token = '';
  after = 0;
  save();
}

async function pair() {
  loop?.abort();
  loop = null;
  const r = await scannerApi.pair(state.pairing?.id);
  state.pairing = r.pairing;
  state.token = r.token;
  state.lanAddresses = r.lanAddresses || [];
  state.error = '';
  after = 0;
  boot = '';
  save();
  run();
}

async function unpair() {
  const id = state.pairing?.id;
  clear();
  if (id) await scannerApi.unpair(id).catch(() => undefined);
}

/** Restores this tab's pairing after a reload. */
function resume() {
  if (state.pairing || loop) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!saved?.pairing || new Date(saved.pairing.expiresAt) <= new Date()) return;
    Object.assign(state, { pairing: saved.pairing, token: saved.token, lanAddresses: saved.lanAddresses || [] });
    after = saved.after || 0;
    boot = saved.boot || '';
    run();
  } catch {
    /* nothing saved */
  }
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
/** Address the phone opens: this page's address, or this computer's network address when the page is on localhost. */
function phoneUrl(host) {
  if (!state.token) return '';
  const { protocol, hostname, port } = window.location;
  const h = LOCAL.test(hostname) ? host || state.lanAddresses[0] || hostname : hostname;
  return `${protocol}//${h}${port ? `:${port}` : ''}/scanner#t=${state.token}`;
}

export function usePhoneScanner() {
  resume();
  return {
    state,
    paired: computed(() => !!state.pairing?.active),
    // The phone has opened the link.
    phoneSeen: computed(() => !!state.pairing?.lastSeenAt),
    pair,
    unpair,
    phoneUrl,
  };
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

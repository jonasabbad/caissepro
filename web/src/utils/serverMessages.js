// i18n-scan: data — patterns of server texts.
import { i18n } from '@/i18n';

/**
 * Translates an API message into the current language. Patterns come from the French serverErrors file,
 * which holds each message exactly as the server writes it; a few server messages are in English.
 */
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const toRegex = (tpl) => new RegExp(`^${esc(tpl).replace(/\\?\{(\w+)\\?\}/g, '(?<$1>.+?)')}$`);
const EXTRA = [
  ['Device with IMEI {imei} already exists', 'imeiExists'],
  ['{what} with ID {id} not found', 'notFound'],
  ['{what} not found', 'notFound'],
  ['Internal server error', 'serverError'],
];

let patterns;
function build() {
  const fr = i18n.global.getLocaleMessage('fr').serverErrors || {};
  const exact = new Map();
  const templated = [];
  for (const [key, tpl] of Object.entries(fr)) {
    if (/\{\w+\}/.test(tpl)) templated.push([toRegex(tpl), key]);
    else exact.set(tpl, key);
  }
  for (const [tpl, key] of EXTRA) templated.push([toRegex(tpl), key]);
  return { exact, templated };
}

function lookup(message) {
  patterns ??= build();
  const key = patterns.exact.get(message);
  if (key) return i18n.global.t(`serverErrors.${key}`);
  for (const [re, k] of patterns.templated) {
    const m = re.exec(message);
    if (m) return i18n.global.t(`serverErrors.${k}`, { ...m.groups });
  }
  return null;
}

export function translateServerMessage(message) {
  if (typeof message !== 'string' || !message) return message;
  const direct = lookup(message);
  if (direct) return direct;
  // Validation errors arrive as "field.path: message".
  const v = /^([\w.]+): (.+)$/.exec(message);
  if (v) {
    const inner = lookup(v[2]);
    if (inner) return inner;
  }
  return message;
}

/** Rewrites an error response in place: `message` and field `errors` translated, original kept for code that matches on it. */
export function translateErrorResponse(data) {
  if (!data || typeof data !== 'object' || data.originalMessage !== undefined) return;
  if (typeof data.message === 'string') {
    data.originalMessage = data.message;
    data.message = translateServerMessage(data.message);
  }
  if (data.errors && typeof data.errors === 'object') {
    for (const k of Object.keys(data.errors)) data.errors[k] = translateServerMessage(data.errors[k]);
  }
  if (data.error && typeof data.error === 'object' && typeof data.error.message === 'string') {
    data.error.message = translateServerMessage(data.error.message);
  }
}

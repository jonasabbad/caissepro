import { createI18n } from 'vue-i18n';

// Each module contributes a file per language under ./fr, ./en and ./ar; they are deep-merged here.
const frModules = import.meta.glob('./fr/*.js', { eager: true, import: 'default' });
const enModules = import.meta.glob('./en/*.js', { eager: true, import: 'default' });
const arModules = import.meta.glob('./ar/*.js', { eager: true, import: 'default' });

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

const merge = (mods) => Object.values(mods).reduce((acc, m) => deepMerge(acc, m), {});

const LOCALE_KEY = 'locale';
export const LOCALES = ['fr', 'en', 'ar'];
export const LOCALE_NAMES = { fr: 'Français', en: 'English', ar: 'العربية' };
const normalize = (l) => (LOCALES.includes(l) ? l : String(l || '').slice(0, 2) === 'ar' ? 'ar' : String(l || '').slice(0, 2) === 'en' ? 'en' : 'fr');
const saved = (() => {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
})();

export const i18n = createI18n({
  legacy: false,
  locale: normalize(saved),
  fallbackLocale: 'fr',
  messages: { fr: merge(frModules), en: merge(enModules), ar: merge(arModules) },
  missingWarn: false,
  fallbackWarn: false,
});

export const currentLocale = () => i18n.global.locale.value;

/** BCP 47 locale for Intl number/date formatting in the current language (English uses day/month/year, like the rest of the app). */
const INTL = { fr: 'fr-MA', en: 'en-GB', ar: 'fr-MA' };
export const intlLocale = () => INTL[i18n.global.locale.value] || 'fr-MA';

/**
 * Printed documents (receipts, invoices, repair tickets, report PDFs) are in English when the interface is,
 * and in French otherwise: the PDF font cannot draw Arabic, and French is the usual language for Moroccan invoices.
 */
export const docLocale = () => (i18n.global.locale.value === 'en' ? 'en' : 'fr');
export const dt = (key, named = {}) => i18n.global.t(key, named, { locale: docLocale() });

export function setLocale(locale) {
  locale = normalize(locale);
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* ignore */
  }
}

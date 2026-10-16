import { createI18n } from 'vue-i18n';

// Each module contributes a file per language under ./fr and ./ar; they are deep-merged here.
const frModules = import.meta.glob('./fr/*.js', { eager: true, import: 'default' });
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
const saved = (() => {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
})();

export const i18n = createI18n({
  legacy: false,
  locale: saved === 'ar' ? 'ar' : 'fr',
  fallbackLocale: 'fr',
  messages: { fr: merge(frModules), ar: merge(arModules) },
  missingWarn: false,
  fallbackWarn: false,
});

export const currentLocale = () => i18n.global.locale.value;

export function setLocale(locale) {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* ignore */
  }
}

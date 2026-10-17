// i18n-scan: data
import { i18n } from '@/i18n';

/**
 * Seeded categories come from the API with French names. Responses are rewritten here so every screen shows
 * them in the current language: category objects are recognised by slug, report rows by their French name.
 * A user-created category (unknown slug) keeps its own name.
 */
let byFrenchName;
function frenchNames() {
  if (!byFrenchName) {
    byFrenchName = new Map(Object.entries(i18n.global.getLocaleMessage('fr').categoryNames || {}).map(([slug, name]) => [name, slug]));
  }
  return byFrenchName;
}
const label = (slug) => (i18n.global.te(`categoryNames.${slug}`, 'fr') ? i18n.global.t(`categoryNames.${slug}`) : null);

function walk(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, depth + 1);
    return;
  }
  if (typeof node.slug === 'string' && 'activityType' in node && typeof node.name === 'string') {
    const l = label(node.slug);
    if (l) node.name = l;
  }
  if (typeof node.categoryName === 'string') {
    const slug = frenchNames().get(node.categoryName);
    if (slug) node.categoryName = label(slug);
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, depth + 1);
}

export function localizeReferenceData(data) {
  if (i18n.global.locale.value !== 'fr') walk(data);
  return data;
}

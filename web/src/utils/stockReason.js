// i18n-scan: data — stored French notes mapped to translations.
import { i18n } from '@/i18n';

/**
 * Stock movement notes are stored as text: the server writes fixed notes and the adjustment dialog stores its
 * preset reasons in French (optionally followed by "(N boîte(s) de M)"). Known ones are shown translated.
 */
const NOTES = {
  'Initial stock entry': 'inventoryMovements.reasons.initialStock',
  'Product sold': 'inventoryMovements.reasons.productSold',
  'Stock received from supplier': 'inventoryMovements.reasons.supplierReceipt',
  'Annulation de vente': 'inventoryMovements.reasons.saleCancelled',
  'Retour client': 'inventoryMovements.reasons.customerReturn',
  'Pièce utilisée en réparation': 'inventoryMovements.reasons.partUsed',
  'Pièce remise en stock (réparation annulée)': 'inventoryMovements.reasons.partBackCancelled',
  'Pièce remise en stock (réparation supprimée)': 'inventoryMovements.reasons.partBackDeleted',
  'Pièce retirée de la réparation': 'inventoryMovements.reasons.partRemoved',
  Inventaire: 'products.adjust.reasons.inventory',
  'Réception commande': 'products.adjust.reasons.receipt',
  'Produit endommagé': 'products.adjust.reasons.damaged',
  'Vol/Perte': 'products.adjust.reasons.lost',
  'Correction erreur': 'products.adjust.reasons.correction',
  Autre: 'products.adjust.reasons.other',
};

export function stockReasonLabel(reason) {
  if (!reason) return '';
  const { t } = i18n.global;
  if (NOTES[reason]) return t(NOTES[reason]);
  const m = /^(.+) \((\d+) boîtes? de (\d+)\)$/.exec(reason);
  if (m && NOTES[m[1]]) return `${t(NOTES[m[1]])} (${t('inventoryMovements.boxesSuffix', { count: m[2], size: m[3] })})`;
  return reason;
}

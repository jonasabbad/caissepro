// i18n-scan: data — stored values or language-specific wording, translated elsewhere.
import { i18n } from '@/i18n';

/**
 * Cash drawer reasons are stored as text: preset choices are saved in their canonical (French) wording and
 * the server writes "<label> - <reference>". Known ones are shown in the current language; anything typed
 * by a user is shown as typed.
 */
const EXACT = {
  'Dépôt espèces': 'cashDeposit',
  'Apport de fonds': 'fundsContribution',
  'Correction caisse': 'correction',
  Autre: 'other',
  'Retrait espèces': 'cashWithdrawal',
  'Achat fournitures': 'supplies',
  'Paiement fournisseur': 'supplierPaymentPreset',
  'Appareil vendu à un autre client': 'unitSoldToOther',
  'Remboursement acompte réservation': 'reservationDepositRefund',
};
const PREFIXED = {
  'Acompte réservation': 'reservationDeposit',
  'Paiement espèces': 'cashPayment',
  'Solde réservation': 'reservationBalance',
  'Paiement crédit': 'creditPayment',
  'Remboursement retour': 'returnRefund',
  'Remboursement client': 'customerRefund',
  'Paiement dette client': 'customerDebtPayment',
  'Annulation dépense': 'expenseReversal',
  'Annulation paiement fournisseur': 'supplierPaymentReversal',
  'Paiement réparation': 'repairPayment',
  'Main d’œuvre': 'repairLabor',
  'Achat pièce': 'repairPart',
  'Paiement fournisseur': 'supplierPayment',
  Dépense: 'expense',
  Annulation: 'cancellation',
};

export const DEPOSIT_REASONS = ['Dépôt espèces', 'Apport de fonds', 'Correction caisse', 'Autre'];
export const WITHDRAW_REASONS = ['Retrait espèces', 'Achat fournitures', 'Paiement fournisseur', 'Autre'];
export const OTHER_REASON = 'Autre';

export function reasonLabel(reason) {
  if (!reason) return '';
  const { t } = i18n.global;
  if (EXACT[reason]) return t(`cashDrawer.reasons.${EXACT[reason]}`);
  const i = reason.indexOf(' - ');
  if (i > 0 && PREFIXED[reason.slice(0, i)]) return t(`cashDrawer.reasons.${PREFIXED[reason.slice(0, i)]}`, { ref: reason.slice(i + 3) });
  return reason;
}

import { ArrowsRightLeftIcon, BanknotesIcon, BookmarkIcon, BuildingLibraryIcon, CreditCardIcon, DevicePhoneMobileIcon, DocumentTextIcon } from '@heroicons/vue/24/outline';

/**
 * Everything the payment dialog offers. Adding an option here makes it appear in the POS (the server must accept
 * the new key too: `type` / `payments[].method` in server/src/lib/sales.ts).
 *
 * Sale types
 *   needsCustomer — picking it without a customer opens the customer picker first, then applies it
 *   devicesOnly   — only when the cart holds serialised devices
 *   phoneSellerOnly — only for phone shops
 *   action        — opens a dialog instead of switching the type (trade-in)
 */
export const SALE_TYPES = [
  { key: 'sale', label: 'pos.directSale', icon: BanknotesIcon, tone: 'gray' },
  { key: 'credit', label: 'pos.creditSale', icon: CreditCardIcon, tone: 'blue', needsCustomer: true },
  { key: 'reservation', label: 'reservation.title', icon: BookmarkIcon, tone: 'purple', needsCustomer: true, devicesOnly: true },
  { key: 'tradeIn', label: 'tradeIn.button', icon: ArrowsRightLeftIcon, tone: 'green', needsCustomer: true, phoneSellerOnly: true, action: 'tradeIn' },
];

/**
 * Payment methods. `reference`: 'required' (check number), 'optional' (card slip, transfer or mobile reference)
 * or absent. `givesChange`: overpaying returns change instead of raising the sale.
 */
export const PAYMENT_METHODS = [
  { key: 'cash', label: 'payment.cash', icon: BanknotesIcon, givesChange: true },
  { key: 'card', label: 'repairs.payment.methods.card', icon: CreditCardIcon, reference: 'optional' },
  { key: 'bank_transfer', label: 'payment.transfer', icon: BuildingLibraryIcon, reference: 'optional' },
  { key: 'check', label: 'payment.check', icon: DocumentTextIcon, reference: 'required' },
  { key: 'mobile_money', label: 'payment.mobile', icon: DevicePhoneMobileIcon, reference: 'optional' },
];
export const paymentMethod = (key) => PAYMENT_METHODS.find((m) => m.key === key);

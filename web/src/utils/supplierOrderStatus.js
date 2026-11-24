import { CheckCircleIcon, ClockIcon, TruckIcon, XCircleIcon } from '@heroicons/vue/24/outline';

/** Status label key, badge colours and icon for supplier orders. */
export const ORDER_STATUS = {
  draft: { labelKey: 'supplierOrders.status.draft', badge: 'badge-secondary', pill: 'bg-gray-100 text-gray-700', icon: ClockIcon },
  pending: { labelKey: 'supplierOrders.status.pending', badge: 'badge-warning', pill: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  partial: { labelKey: 'supplierOrders.status.partial', badge: 'badge-info', pill: 'bg-blue-100 text-blue-700', icon: TruckIcon },
  received: { labelKey: 'supplierOrders.status.received', badge: 'badge-success', pill: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  cancelled: { labelKey: 'supplierOrders.status.cancelled', badge: 'badge-danger', pill: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

export const statusInfo = (s) => ORDER_STATUS[s] ?? ORDER_STATUS.draft;

/** Payment status of a supplier order (from what is paid and left to pay): label key and badge colours. */
export const PAYMENT_STATUS = {
  unpaid: { key: 'supplierInvoices.paymentStatus.unpaid', cls: 'bg-red-100 text-red-700' },
  partial: { key: 'supplierInvoices.paymentStatus.partial', cls: 'bg-amber-100 text-amber-800' },
  paid: { key: 'supplierInvoices.paymentStatus.paid', cls: 'bg-green-100 text-green-700' },
};
export const payBadge = (s) => PAYMENT_STATUS[s] ?? PAYMENT_STATUS.unpaid;

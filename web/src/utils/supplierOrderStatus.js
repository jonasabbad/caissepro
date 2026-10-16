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

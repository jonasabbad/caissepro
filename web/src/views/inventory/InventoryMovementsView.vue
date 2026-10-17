<script setup>
import { intlLocale } from '@/i18n';
import { stockReasonLabel } from '@/utils/stockReason';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  DevicePhoneMobileIcon,
  ShoppingCartIcon,
  TruckIcon,
  WrenchIcon,
} from '@heroicons/vue/24/outline';
import { inventoryMovementsApi } from '@/api/inventory';
import { productsApi } from '@/api/products';
import { soldUnitsApi } from '@/api/soldUnits';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const isPhoneSeller = computed(() => auth.activityType === 'phone_seller');

const type = ref('');
const productId = ref('');
const dateFrom = ref('');
const dateTo = ref('');

const UNIT_TYPES = ['unit_entry', 'unit_sale'];

const { data: movements, isLoading: loadingMovements } = useQuery({
  queryKey: ['inventory-movements', type, productId, dateFrom, dateTo],
  queryFn: () =>
    inventoryMovementsApi.getAll({
      type: type.value && !UNIT_TYPES.includes(type.value) ? type.value : undefined,
      productId: productId.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
    }),
});

// Phones are tracked one by one: their arrival and sale are shown as synthetic movements.
const { data: units, isLoading: loadingUnits } = useQuery({
  queryKey: ['sold-units-all'],
  queryFn: () => soldUnitsApi.getAll({ limit: 500 }),
  enabled: isPhoneSeller,
});

const unitMovements = computed(() => {
  if (!isPhoneSeller.value || !units.value?.units) return [];
  const rows = [];
  for (const u of units.value.units) {
    const detail = u.storage ? `${u.storage} - ${u.color || ''}` : u.color;
    rows.push({
      id: `unit-entry-${u.id}`,
      type: 'unit_entry',
      productName: `${u.brand} ${u.model}`,
      productSku: u.imei || u.serialNumber || '-',
      quantity: 1,
      previousStock: 0,
      newStock: 1,
      reference: u.imei || u.serialNumber,
      reason: detail,
      createdAt: u.createdAt,
      createdBy: '',
    });
    if (u.soldAt) {
      rows.push({
        id: `unit-sale-${u.id}`,
        type: 'unit_sale',
        productName: `${u.brand} ${u.model}`,
        productSku: u.imei || u.serialNumber || '-',
        quantity: -1,
        previousStock: 1,
        newStock: 0,
        reference: u.transactionId ? 'Transaction' : '',
        reason: detail,
        createdAt: u.soldAt,
        createdBy: '',
      });
    }
  }
  return rows;
});

const rows = computed(() => {
  const stock = movements.value || [];
  let unitRows = unitMovements.value;
  if (type.value) unitRows = UNIT_TYPES.includes(type.value) ? unitRows.filter((r) => r.type === type.value) : [];
  if (productId.value) unitRows = [];
  if (dateFrom.value) {
    const from = new Date(dateFrom.value);
    unitRows = unitRows.filter((r) => new Date(r.createdAt) >= from);
  }
  if (dateTo.value) {
    const to = new Date(dateTo.value);
    to.setHours(23, 59, 59, 999);
    unitRows = unitRows.filter((r) => new Date(r.createdAt) <= to);
  }
  return [...stock, ...unitRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});
const isLoading = computed(() => loadingMovements.value || (isPhoneSeller.value && loadingUnits.value));

const { data: productList } = useQuery({ queryKey: ['products', 'all-for-filter'], queryFn: () => productsApi.getAll({ limit: 500 }) });
const products = computed(() => productList.value?.products || []);

const formatWhen = (d) =>
  new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const TYPES = {
  sale: { label: 'sale', icon: ShoppingCartIcon, cls: 'text-danger-600 bg-danger-50' },
  return: { label: 'return', icon: ArrowUturnLeftIcon, cls: 'text-success-600 bg-success-50' },
  adjustment: { label: 'adjustment', icon: WrenchIcon, cls: 'text-warning-600 bg-warning-50' },
  supplier_order: { label: 'supplier_order', icon: TruckIcon, cls: 'text-primary-600 bg-primary-50' },
  purchase: { label: 'supplier_order', icon: TruckIcon, cls: 'text-primary-600 bg-primary-50' },
  transfer: { label: 'transfer', icon: ArrowsRightLeftIcon, cls: 'text-gray-600 bg-gray-100' },
  transfer_in: { label: 'transfer', icon: ArrowsRightLeftIcon, cls: 'text-success-600 bg-success-50' },
  transfer_out: { label: 'transfer', icon: ArrowsRightLeftIcon, cls: 'text-danger-600 bg-danger-50' },
  damage: { label: 'damage', icon: WrenchIcon, cls: 'text-danger-600 bg-danger-50' },
  loss: { label: 'loss', icon: WrenchIcon, cls: 'text-danger-600 bg-danger-50' },
  unit_entry: { label: 'unit_entry', icon: DevicePhoneMobileIcon, cls: 'text-success-600 bg-success-50' },
  unit_sale: { label: 'unit_sale', icon: DevicePhoneMobileIcon, cls: 'text-danger-600 bg-danger-50' },
};
const typeInfo = (ty) => TYPES[ty] ?? TYPES.adjustment;

const totals = computed(() => {
  const entries = rows.value.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
  const exits = rows.value.filter((r) => r.quantity < 0).reduce((s, r) => s + Math.abs(r.quantity), 0);
  return { entries, exits, net: entries - exits };
});

const hasFilters = computed(() => type.value || productId.value || dateFrom.value || dateTo.value);
function clearFilters() {
  type.value = '';
  productId.value = '';
  dateFrom.value = '';
  dateTo.value = '';
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('inventoryMovements.title') }}</h1>
        <p class="mt-1 text-sm text-gray-500">{{ t('inventoryMovements.subtitle') }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="card flex items-center gap-4 p-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-success-100"><ArrowDownIcon class="h-6 w-6 text-success-600" /></div>
        <div>
          <p class="text-sm text-gray-500">{{ t('inventoryMovements.entries') }}</p>
          <p class="text-xl font-bold text-success-600">+{{ totals.entries }}</p>
        </div>
      </div>
      <div class="card flex items-center gap-4 p-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-danger-100"><ArrowUpIcon class="h-6 w-6 text-danger-600" /></div>
        <div>
          <p class="text-sm text-gray-500">{{ t('inventoryMovements.exits') }}</p>
          <p class="text-xl font-bold text-danger-600">-{{ totals.exits }}</p>
        </div>
      </div>
      <div class="card flex items-center gap-4 p-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100"><ArrowsRightLeftIcon class="h-6 w-6 text-primary-600" /></div>
        <div>
          <p class="text-sm text-gray-500">{{ t('inventoryMovements.netChange') }}</p>
          <p :class="['text-xl font-bold', totals.net >= 0 ? 'text-success-600' : 'text-danger-600']">{{ $ltr(`${totals.net >= 0 ? '+' : ''}${totals.net}`) }}</p>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex flex-wrap gap-4">
        <select v-model="type" class="input w-auto">
          <option value="">{{ t('inventoryMovements.allTypes') }}</option>
          <option value="sale">{{ t('inventoryMovements.types.sale') }}</option>
          <option value="return">{{ t('inventoryMovements.types.return') }}</option>
          <option value="adjustment">{{ t('inventoryMovements.types.adjustment') }}</option>
          <option value="supplier_order">{{ t('inventoryMovements.types.supplier_order') }}</option>
          <option value="transfer">{{ t('inventoryMovements.types.transfer') }}</option>
          <option v-if="isPhoneSeller" value="unit_entry">{{ t('inventoryMovements.types.unit_entry') }}</option>
          <option v-if="isPhoneSeller" value="unit_sale">{{ t('inventoryMovements.types.unit_sale') }}</option>
        </select>
        <select v-model="productId" class="input w-auto max-w-xs">
          <option value="">{{ t('inventoryMovements.allProducts') }}</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <input v-model="dateFrom" type="date" class="input w-auto" :placeholder="t('inventoryMovements.startDate')" />
        <input v-model="dateTo" type="date" class="input w-auto" :placeholder="t('inventoryMovements.endDate')" />
        <button v-if="hasFilters" class="btn-secondary text-sm" @click="clearFilters">{{ t('inventoryMovements.clearFilters') }}</button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="rows.length" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('inventoryMovements.date') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('inventoryMovements.product') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('inventoryMovements.type') }}</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">{{ t('inventoryMovements.movement') }}</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">{{ t('inventoryMovements.stock') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('inventoryMovements.reference') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in rows" :key="r.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <p class="text-sm text-gray-900">{{ formatWhen(r.createdAt) }}</p>
                <p class="text-xs text-gray-500">{{ r.createdBy ?? t('inventoryMovements.system') }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="font-medium text-gray-900">{{ r.productName }}</p>
                <p class="text-sm text-gray-500">{{ r.productSku }}</p>
              </td>
              <td class="px-4 py-3">
                <span :class="['inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', typeInfo(r.type).cls]">
                  <component :is="typeInfo(r.type).icon" class="h-3.5 w-3.5" />
                  {{ t(`inventoryMovements.types.${typeInfo(r.type).label}`) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span :class="['font-bold', r.quantity > 0 ? 'text-success-600' : 'text-danger-600']">{{ $ltr(`${r.quantity > 0 ? '+' : ''}${r.quantity}`) }}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="text-gray-400">{{ r.previousStock }}</span>
                <span class="mx-1 text-gray-300">→</span>
                <span class="font-medium text-gray-900">{{ r.newStock }}</span>
              </td>
              <td class="px-4 py-3">
                <p v-if="r.reference" class="text-sm text-primary-600">{{ r.reference }}</p>
                <p v-if="r.reason" class="text-xs text-gray-500">{{ stockReasonLabel(r.reason) }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-8 text-center text-gray-500">
        <ArrowsRightLeftIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>{{ t('inventoryMovements.noMovements') }}</p>
      </div>
    </div>
  </div>
</template>

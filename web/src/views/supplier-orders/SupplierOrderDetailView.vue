<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArchiveBoxArrowDownIcon,
  ArrowLeftIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CheckIcon,
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ComputerDesktopIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  ShoppingBagIcon,
} from '@heroicons/vue/24/outline';
import { supplierOrdersApi } from '@/api/supplierOrders';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { formatCurrency, formatDate } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';
import { statusInfo } from '@/utils/supplierOrderStatus';
import Toast from '@/components/ui/Toast.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const orderId = computed(() => route.params.id);
const invoicing = ref(false);
async function createInvoice() {
  invoicing.value = true;
  try {
    const inv = await supplierInvoicesApi.fromOrder(orderId.value);
    router.push(`/app/supplier-invoices/${inv.id}/edit`);
  } catch (e) {
    toast.value = { show: true, message: apiErrorMessage(e), type: 'error' };
  } finally {
    invoicing.value = false;
  }
}

const { data: order, isLoading } = useQuery({
  queryKey: ['supplier-order', orderId],
  queryFn: () => supplierOrdersApi.getById(orderId.value),
  enabled: computed(() => !!orderId.value),
});

const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message, type = 'success') => (toast.value = { show: true, message, type });
const refresh = () => {
  queryClient.invalidateQueries({ queryKey: ['supplier-order', orderId.value] });
  queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
  // Supplier pages show the order count and balance.
  queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  queryClient.invalidateQueries({ queryKey: ['supplier'] });
};

// Per-device rows built from the item's unitDetails.
const expanded = ref({});
const unitRows = ref({});
watch(
  order,
  (o) => {
    if (!o) return;
    for (const item of o.items) {
      if (item.itemType !== 'unit') continue;
      const details = item.unitDetails || [];
      const rows = [];
      for (let i = 0; i < item.quantity; i++) {
        const d = details[i] || {};
        rows.push({
          imei: d.imei || '',
          serialNumber: d.serialNumber || '',
          batteryHealth: d.batteryHealth ?? undefined,
          condition: d.condition || '',
          purchasePrice: d.purchasePrice ?? Number(item.unitCost),
          salePrice: d.salePrice ?? (item.defaultSalePrice ? Number(item.defaultSalePrice) : undefined),
          addedToInventory: d.addedToInventory || false,
          soldUnitId: d.soldUnitId || undefined,
        });
      }
      unitRows.value[item.id] = rows;
    }
  },
  { immediate: true },
);
const isPhone = (item) => item.deviceType === 'phone';
const isCancelled = computed(() => order.value?.status === 'cancelled');
const isDraft = computed(() => order.value?.status === 'draft');

const inventory = computed(() => {
  let total = 0;
  let converted = 0;
  for (const item of order.value?.items || []) {
    if (item.itemType !== 'unit') continue;
    const rows = unitRows.value[item.id] || [];
    total += rows.length;
    converted += rows.filter((r) => r.addedToInventory).length;
  }
  return { total, converted };
});
const hasUnits = computed(() => inventory.value.total > 0);
const canConvertAll = computed(() => !!order.value && !isCancelled.value && inventory.value.converted < inventory.value.total);
const itemProgress = (id) => {
  const rows = unitRows.value[id] || [];
  return { total: rows.length, converted: rows.filter((r) => r.addedToInventory).length };
};
const paidPercent = computed(() =>
  !order.value || order.value.totalAmount <= 0 ? 0 : Math.min(100, Math.round((order.value.amountPaid / order.value.totalAmount) * 100)),
);

const conditionLabel = (c) => t(`soldUnits.conditions.${c}`);

// ── Receive product lines ──
const receiveOpen = ref(false);
const receiveItem = ref(null);
const receiveMax = ref(0);
const receiveQty = ref(0);
function openReceive(item) {
  receiveItem.value = item;
  receiveMax.value = item.quantity - item.receivedQuantity;
  receiveQty.value = receiveMax.value;
  receiveOpen.value = true;
}
const receiveMutation = useMutation({
  mutationFn: () => supplierOrdersApi.receive(orderId.value, [{ itemId: receiveItem.value.id, quantityReceived: receiveQty.value }]),
  onSuccess: () => {
    refresh();
    receiveOpen.value = false;
    notify(t('supplierOrders.toast.received'));
  },
  onError: (e) => notify(apiErrorMessage(e, t('supplierOrders.toast.receiveError')), 'error'),
});

const submitMutation = useMutation({
  mutationFn: () => supplierOrdersApi.submit(orderId.value),
  onSuccess: () => {
    refresh();
    notify(t('supplierOrders.toast.submitted'));
  },
  onError: (e) => notify(apiErrorMessage(e, t('supplierOrders.toast.submitError')), 'error'),
});

const cancelOpen = ref(false);
const cancelMutation = useMutation({
  mutationFn: () => supplierOrdersApi.cancel(orderId.value),
  onSuccess: () => {
    refresh();
    notify(t('supplierOrders.toast.cancelled'));
  },
});

// ── Payment ──
const payOpen = ref(false);
const payAmount = ref(0);
const payMutation = useMutation({
  mutationFn: () => supplierOrdersApi.addPayment(orderId.value, payAmount.value),
  onSuccess: () => {
    refresh();
    payOpen.value = false;
    notify(t('supplierOrders.toast.paid'));
  },
  onError: () => notify(t('supplierOrders.toast.payError'), 'error'),
});
function openPay() {
  if (!order.value) return;
  payAmount.value = order.value.amountRemaining;
  payOpen.value = true;
}

// ── Devices to stock ──
const convertingUnit = ref(null);
const convertOne = useMutation({
  mutationFn: ({ itemId, unitIndexes }) => supplierOrdersApi.convertItemUnits(orderId.value, itemId, unitIndexes),
  onSuccess: () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ['sold-units'] });
    convertingUnit.value = null;
    notify(t('supplierOrders.toast.unitAdded'));
  },
  onError: () => {
    convertingUnit.value = null;
    notify(t('supplierOrders.toast.convertError'), 'error');
  },
});
function convertUnit(itemId, index) {
  convertingUnit.value = `${itemId}-${index}`;
  convertOne.mutate({ itemId, unitIndexes: [index] });
}
const convertingItem = ref(null);
const convertItem = useMutation({
  mutationFn: ({ itemId, unitIndexes }) => supplierOrdersApi.convertItemUnits(orderId.value, itemId, unitIndexes),
  onSuccess: (res) => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ['sold-units'] });
    convertingItem.value = null;
    notify(t('supplierOrders.toast.unitsAdded', { count: res.converted }));
  },
  onError: () => {
    convertingItem.value = null;
    notify(t('supplierOrders.toast.convertError'), 'error');
  },
});
function convertItemUnits(itemId) {
  const indexes = (unitRows.value[itemId] || []).map((r, i) => (r.addedToInventory ? -1 : i)).filter((i) => i >= 0);
  if (!indexes.length) return;
  convertingItem.value = itemId;
  convertItem.mutate({ itemId, unitIndexes: indexes });
}
const convertAll = useMutation({
  mutationFn: () => supplierOrdersApi.convertAllUnits(orderId.value),
  onSuccess: (res) => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ['sold-units'] });
    notify(t('supplierOrders.toast.unitsAdded', { count: res.converted }));
  },
  onError: () => notify(t('supplierOrders.toast.convertError'), 'error'),
});

const spinner = 'h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent';
</script>

<template>
  <div class="max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div v-if="isLoading" class="card p-8 text-center">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-black" />
      <p class="mt-2 text-gray-500">{{ t('common.loading') }}</p>
    </div>

    <template v-else-if="order">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-4">
          <button class="rounded-lg p-2 transition-colors hover:bg-gray-100" @click="router.push('/app/supplier-orders')">
            <ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" />
          </button>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-900">{{ order.orderNumber }}</h1>
              <span :class="['badge inline-flex items-center gap-1 text-sm', statusInfo(order.status).pill]">
                <component :is="statusInfo(order.status).icon" class="h-3.5 w-3.5" /> {{ t(statusInfo(order.status).labelKey) }}
              </span>
            </div>
            <p class="text-sm text-gray-500">{{ order.supplierName }} · {{ formatDate(order.createdAt) }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button v-if="canConvertAll" class="btn-success inline-flex items-center gap-2" :disabled="convertAll.isPending.value" @click="convertAll.mutate()">
            <span v-if="convertAll.isPending.value" :class="spinner" />
            <ArchiveBoxArrowDownIcon v-else class="h-5 w-5" /> {{ t('supplierOrders.addAllToStock') }}
          </button>
          <button v-if="order.status === 'draft'" class="btn-primary inline-flex items-center gap-2" :disabled="submitMutation.isPending.value" @click="submitMutation.mutate()">
            <span v-if="submitMutation.isPending.value" :class="spinner" />
            <PaperAirplaneIcon v-else class="h-5 w-5" /> {{ t('supplierOrders.submitOrder') }}
          </button>
          <RouterLink v-if="order.invoice" :to="`/app/supplier-invoices/${order.invoice.id}`" class="btn-secondary inline-flex items-center gap-2">
            <DocumentTextIcon class="h-5 w-5" /> {{ t('supplierInvoices.invoicedAs', { number: order.invoice.number }) }}
          </RouterLink>
          <button v-else-if="order.status !== 'draft' && order.status !== 'cancelled'" class="btn-secondary inline-flex items-center gap-2" :disabled="invoicing" @click="createInvoice">
            <DocumentTextIcon class="h-5 w-5" /> {{ t('supplierInvoices.createFromOrder') }}
          </button>
          <button v-if="(order.status === 'draft' || order.status === 'pending') && !order.invoice" class="btn-secondary text-danger-600" @click="cancelOpen = true">
            {{ t('supplierOrders.cancelOrder') }}
          </button>
        </div>
      </div>

      <p v-if="order.invoice" class="card border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{{ t('supplierInvoices.orderInvoicedHint') }}</p>
      <div v-else-if="order.amountRemaining > 0 && order.status !== 'cancelled' && order.status !== 'draft'" class="card border-amber-200 bg-amber-50 p-4">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><BanknotesIcon class="h-6 w-6 text-amber-600" /></div>
            <div>
              <p class="font-semibold text-amber-900">{{ t('supplierOrders.remainingBanner') }}</p>
              <p class="text-2xl font-bold text-amber-700">{{ formatCurrency(order.amountRemaining) }}</p>
            </div>
          </div>
          <button class="btn-primary inline-flex items-center gap-2" @click="openPay"><BanknotesIcon class="h-5 w-5" /> {{ t('supplierOrders.addPayment') }}</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><CubeIcon class="h-5 w-5 text-gray-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('supplierOrders.orderTotal') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ formatCurrency(order.totalAmount) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-full', paidPercent >= 100 ? 'bg-success-100' : 'bg-gray-100']">
              <CurrencyDollarIcon :class="['h-5 w-5', paidPercent >= 100 ? 'text-success-600' : 'text-gray-600']" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-gray-500">{{ t('supplierOrders.paid') }}</p>
              <p :class="['text-xl font-bold', paidPercent >= 100 ? 'text-success-600' : 'text-gray-900']">{{ formatCurrency(order.amountPaid) }}</p>
            </div>
          </div>
          <div class="mt-3">
            <div class="mb-1 flex justify-between text-xs text-gray-500">
              <span>{{ paidPercent }}%</span><span>{{ formatCurrency(order.totalAmount) }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-gray-100">
              <div
                :class="['h-1.5 rounded-full transition-all duration-500', paidPercent >= 100 ? 'bg-success-500' : paidPercent > 0 ? 'bg-amber-500' : 'bg-gray-300']"
                :style="{ width: `${paidPercent}%` }"
              />
            </div>
          </div>
        </div>
        <div v-if="hasUnits" class="card p-4">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-full', inventory.converted === inventory.total ? 'bg-success-100' : 'bg-blue-100']">
              <ArchiveBoxArrowDownIcon :class="['h-5 w-5', inventory.converted === inventory.total ? 'text-success-600' : 'text-blue-600']" />
            </div>
            <div class="flex-1">
              <p class="text-sm text-gray-500">{{ t('supplierOrders.inventory') }}</p>
              <p :class="['text-xl font-bold', inventory.converted === inventory.total ? 'text-success-600' : 'text-gray-900']">
                {{ inventory.converted }}/{{ inventory.total }}
              </p>
            </div>
          </div>
          <div class="mt-3">
            <div class="mb-1 flex justify-between text-xs text-gray-500">
              <span>{{ t('supplierOrders.percentInStock', { percent: inventory.total > 0 ? Math.round((inventory.converted / inventory.total) * 100) : 0 }) }}</span>
              <span>{{ t('supplierOrders.unitsCount', { count: inventory.total }) }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-gray-100">
              <div
                :class="['h-1.5 rounded-full transition-all duration-500', inventory.converted === inventory.total ? 'bg-success-500' : 'bg-blue-500']"
                :style="{ width: `${inventory.total > 0 ? (inventory.converted / inventory.total) * 100 : 0}%` }"
              />
            </div>
          </div>
        </div>
        <div v-else class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100"><ShoppingBagIcon class="h-5 w-5 text-gray-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('supplierOrders.articles') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ order.items.length }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="order.notes" class="card p-4"><p class="whitespace-pre-line text-sm text-gray-700">{{ order.notes }}</p></div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 class="font-semibold text-gray-900">{{ t('supplierOrders.form.orderItems') }}</h2>
          <span class="text-sm text-gray-500">{{ order.items.length }} {{ t('supplierOrders.articles') }}</span>
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="item in order.items" :key="item.id">
            <div
              :class="['flex items-center gap-4 px-5 py-4 transition-colors', item.itemType === 'unit' && 'cursor-pointer hover:bg-gray-50']"
              @click="item.itemType === 'unit' && (expanded[item.id] = !expanded[item.id])"
            >
              <div
                v-if="item.itemType === 'unit'"
                :class="['flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', isPhone(item) ? 'bg-blue-50' : 'bg-purple-50']"
              >
                <DevicePhoneMobileIcon v-if="isPhone(item)" class="h-5 w-5 text-blue-600" />
                <ComputerDesktopIcon v-else class="h-5 w-5 text-purple-600" />
              </div>
              <div v-else class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50"><CubeIcon class="h-5 w-5 text-gray-400" /></div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-gray-900">{{ item.productName }}</p>
                <p class="text-sm text-gray-500">
                  {{ item.quantity }} x {{ formatCurrency(item.unitCost) }}<span v-if="item.itemType === 'unit' && item.brand"> · {{ item.brand }}</span>
                </p>
              </div>
              <div v-if="item.itemType === 'unit'" class="hidden sm:block">
                <span
                  :class="[
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                    itemProgress(item.id).converted === itemProgress(item.id).total
                      ? 'bg-success-50 text-success-700'
                      : itemProgress(item.id).converted > 0
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600',
                  ]"
                >
                  <CheckCircleIcon v-if="itemProgress(item.id).converted === itemProgress(item.id).total" class="h-3.5 w-3.5" />
                  {{ t('supplierOrders.inStockCount', { done: itemProgress(item.id).converted, total: itemProgress(item.id).total }) }}
                </span>
              </div>
              <div class="text-end">
                <p class="font-semibold text-gray-900">{{ formatCurrency(item.total) }}</p>
                <p v-if="item.itemType !== 'unit'" class="text-xs text-gray-500">{{ item.receivedQuantity }}/{{ item.quantity }} {{ t('supplierOrders.table.received') }}</p>
              </div>
              <div v-if="item.itemType !== 'unit' && item.receivedQuantity < item.quantity && !isCancelled && !isDraft">
                <button
                  type="button"
                  class="btn-sm inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 transition-colors hover:bg-primary-100"
                  @click.stop="openReceive(item)"
                >
                  <ArchiveBoxArrowDownIcon class="h-3.5 w-3.5" /> {{ t('supplierOrders.receiveAction') }}
                </button>
              </div>
              <div v-else-if="item.itemType !== 'unit' && item.receivedQuantity >= item.quantity">
                <span class="inline-flex items-center gap-1 text-xs font-medium text-success-600">
                  <CheckCircleIcon class="h-3.5 w-3.5" /> {{ t('supplierOrders.receivedTag') }}
                </span>
              </div>
              <div v-if="item.itemType === 'unit'">
                <ChevronUpIcon v-if="expanded[item.id]" class="h-5 w-5 text-gray-400" />
                <ChevronDownIcon v-else class="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 -translate-y-2"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-2"
            >
              <div v-if="item.itemType === 'unit' && expanded[item.id]" class="bg-gray-50/50 px-5 pb-5">
                <div class="space-y-3">
                  <div
                    v-for="(u, idx) in unitRows[item.id]"
                    :key="idx"
                    :class="['rounded-lg border p-4 transition-colors', u.addedToInventory ? 'border-success-200 bg-success-50/50' : 'border-gray-200 bg-white']"
                  >
                    <div class="mb-2 flex items-center gap-3">
                      <span
                        :class="[
                          'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                          u.addedToInventory ? 'bg-success-100 text-success-700' : 'bg-primary-100 text-primary-700',
                        ]"
                      >
                        <CheckIcon v-if="u.addedToInventory" class="h-3.5 w-3.5" />
                        <template v-else>{{ idx + 1 }}</template>
                      </span>
                      <span class="text-sm font-medium text-gray-700">{{ t('supplierOrders.unitN', { n: idx + 1, total: item.quantity }) }}</span>
                      <span v-if="u.addedToInventory" class="inline-flex items-center gap-1 text-xs font-medium text-success-600">
                        <CheckCircleIcon class="h-3.5 w-3.5" /> {{ t('supplierOrders.inStock') }}
                      </span>
                      <div class="flex-1" />
                      <div class="flex items-center gap-2">
                        <button
                          v-if="!u.addedToInventory && !isCancelled"
                          type="button"
                          :disabled="convertingUnit === `${item.id}-${idx}`"
                          class="btn-sm inline-flex items-center gap-1.5 rounded-lg border border-success-200 bg-success-50 text-success-700 transition-colors hover:bg-success-100 disabled:opacity-50"
                          @click.stop="convertUnit(item.id, idx)"
                        >
                          <span v-if="convertingUnit === `${item.id}-${idx}`" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-success-600 border-t-transparent" />
                          <ArchiveBoxArrowDownIcon v-else class="h-3.5 w-3.5" /> {{ t('supplierOrders.addToStock') }}
                        </button>
                        <RouterLink
                          v-if="u.addedToInventory && u.soldUnitId"
                          :to="`/app/sold-units/${u.soldUnitId}/edit?type=${item.deviceType || 'phone'}`"
                          class="btn-sm inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50"
                          @click.stop
                        >
                          <PencilSquareIcon class="h-3.5 w-3.5" /> {{ t('common.edit') }}
                        </RouterLink>
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                      <span v-if="u.imei" class="font-mono"><span class="text-xs font-medium text-gray-400">IMEI</span> {{ u.imei }}</span>
                      <span v-if="u.serialNumber" class="font-mono"><span class="text-xs font-medium text-gray-400">S/N</span> {{ u.serialNumber }}</span>
                      <span v-if="u.condition" class="rounded bg-gray-100 px-2 py-0.5 text-xs">{{ conditionLabel(u.condition) }}</span>
                      <span v-if="u.batteryHealth != null"><span class="text-xs font-medium text-gray-400">{{ t('supplierOrders.batteryShort') }}</span> {{ u.batteryHealth }}%</span>
                      <span v-if="u.purchasePrice"><span class="text-xs font-medium text-gray-400">{{ t('supplierOrders.purchaseShort') }}</span> {{ formatCurrency(u.purchasePrice) }}</span>
                      <span v-if="u.salePrice"><span class="text-xs font-medium text-gray-400">{{ t('supplierOrders.saleShort') }}</span> {{ formatCurrency(u.salePrice) }}</span>
                      <span v-if="!u.imei && !u.serialNumber && !u.condition && !u.batteryHealth" class="text-xs text-gray-400">{{ t('supplierOrders.noUnitDetails') }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="!isCancelled && (unitRows[item.id] || []).some((r) => !r.addedToInventory)" class="mt-3 flex justify-end">
                  <button
                    type="button"
                    :disabled="convertingItem === item.id"
                    class="btn-success btn-sm inline-flex items-center gap-1.5"
                    @click.stop="convertItemUnits(item.id)"
                  >
                    <span v-if="convertingItem === item.id" :class="spinner" />
                    <ArchiveBoxArrowDownIcon v-else class="h-4 w-4" />
                    {{ convertingItem === item.id ? t('supplierOrders.converting') : t('supplierOrders.addAllToStock') }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <div class="ms-auto max-w-xs space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('supplierOrders.orderTotal') }}</span>
            <span class="font-medium text-gray-900">{{ formatCurrency(order.totalAmount) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('supplierOrders.paid') }}</span>
            <span class="font-medium text-success-600">{{ formatCurrency(order.amountPaid) }}</span>
          </div>
          <div class="flex justify-between border-t border-gray-100 pt-2">
            <span class="font-medium text-gray-700">{{ t('supplierOrders.remainingToPay') }}</span>
            <span :class="['font-bold', order.amountRemaining > 0 ? 'text-danger-600' : 'text-success-600']">{{ formatCurrency(order.amountRemaining) }}</span>
          </div>
        </div>
      </div>

      <div v-if="order.payments?.length" class="card overflow-hidden">
        <div class="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <BanknotesIcon class="h-5 w-5 text-gray-500" />
          <h2 class="font-semibold text-gray-900">{{ t('supplierOrders.paymentHistory') }}</h2>
          <span class="text-sm text-gray-500">({{ order.payments.length }})</span>
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="p in order.payments" :key="p.id" class="flex items-center gap-4 px-5 py-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-success-50"><CurrencyDollarIcon class="h-4 w-4 text-success-600" /></div>
            <div class="flex-1">
              <p class="font-medium text-gray-900">{{ formatCurrency(p.amount) }}</p>
              <p class="text-xs text-gray-500">{{ formatDate(p.createdAt) }}<span v-if="p.userName"> · {{ p.userName }}</span></p>
            </div>
            <div v-if="p.note" class="text-sm text-gray-500">{{ p.note }}</div>
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="payOpen && order" class="modal-overlay" @click.self="payOpen = false">
        <div class="modal-content max-w-md">
          <div class="modal-header"><h3 class="text-lg font-bold text-gray-900">{{ t('supplierOrders.addPayment') }}</h3></div>
          <form @submit.prevent="payMutation.mutate()">
            <div class="modal-body space-y-4">
              <div class="space-y-2 rounded-lg bg-gray-50 p-4">
                <p class="text-sm text-gray-500">{{ t('supplierOrders.order') }} <span class="font-medium text-gray-900">{{ order.orderNumber }}</span></p>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">{{ t('supplierOrders.table.total') }}</span><span class="font-medium">{{ formatCurrency(order.totalAmount) }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">{{ t('supplierOrders.paid') }}</span><span class="font-medium text-success-600">{{ formatCurrency(order.amountPaid) }}</span>
                </div>
                <div class="flex justify-between border-t border-gray-200 pt-2 text-sm">
                  <span class="font-medium text-amber-700">{{ t('supplierOrders.remainingToPay') }}</span>
                  <span class="font-bold text-amber-700">{{ formatCurrency(order.amountRemaining) }}</span>
                </div>
              </div>
              <div>
                <label class="label">{{ t('supplierOrders.paymentAmount') }}</label>
                <div class="relative">
                  <input v-model.number="payAmount" type="number" step="0.01" min="0" class="input pe-10 text-lg font-medium" required />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
                </div>
                <button type="button" class="mt-1 text-xs text-primary-600 hover:text-primary-800" @click="payAmount = order.amountRemaining">
                  {{ t('supplierOrders.payTotal') }}
                </button>
              </div>
              <div v-if="payAmount > 0" :class="['rounded-lg p-4', payAmount >= order.amountRemaining ? 'bg-success-50' : 'bg-gray-50']">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="mb-1 text-sm text-gray-600">{{ t('supplierOrders.afterPayment') }}</p>
                    <p :class="['text-xl font-bold', payAmount >= order.amountRemaining ? 'text-success-600' : 'text-gray-900']">
                      {{ formatCurrency(Math.max(0, order.amountRemaining - payAmount)) }} <span class="text-sm font-normal">{{ t('supplierOrders.remainingWord') }}</span>
                    </p>
                  </div>
                  <CheckCircleIcon v-if="payAmount >= order.amountRemaining" class="h-8 w-8 text-success-500" />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="payOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="payMutation.isPending.value || !payAmount || payAmount <= 0">
                <span v-if="payMutation.isPending.value" class="flex items-center gap-2"><span :class="spinner" /> {{ t('supplierOrders.processing') }}</span>
                <span v-else>{{ t('supplierOrders.confirmPayment') }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="receiveOpen" class="modal-overlay" @click.self="receiveOpen = false">
        <div class="modal-content max-w-sm">
          <div class="modal-header"><h3 class="text-lg font-bold text-gray-900">{{ t('supplierOrders.receiveTitle') }}</h3></div>
          <form @submit.prevent="receiveMutation.mutate()">
            <div class="modal-body space-y-4">
              <p class="font-medium text-gray-900">{{ receiveItem?.productName }}</p>
              <div>
                <label class="label">{{ t('supplierOrders.quantityReceived') }}</label>
                <input v-model.number="receiveQty" type="number" min="1" :max="receiveMax" class="input text-lg font-medium" required />
                <p class="mt-1 text-xs text-gray-500">{{ t('supplierOrders.maximum', { max: receiveMax }) }}</p>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="receiveOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="receiveMutation.isPending.value || receiveQty <= 0 || receiveQty > receiveMax">
                <span v-if="receiveMutation.isPending.value" class="flex items-center gap-2"><span :class="spinner" /> {{ t('supplierOrders.receiving') }}</span>
                <span v-else>{{ t('common.confirm') }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <ConfirmModal
      :show="cancelOpen"
      :title="t('common.confirm')"
      :message="t('supplierOrders.receive.confirmCancel')"
      :confirm-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="
        cancelMutation.mutate();
        cancelOpen = false;
      "
      @cancel="cancelOpen = false"
    />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>

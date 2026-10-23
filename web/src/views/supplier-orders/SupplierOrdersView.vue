<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArchiveBoxArrowDownIcon, BanknotesIcon, ClipboardDocumentListIcon, EyeIcon, MagnifyingGlassIcon, PaperAirplaneIcon, PlusIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { supplierOrdersApi } from '@/api/supplierOrders';
import { apiErrorMessage } from '@/api/http';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import Toast from '@/components/ui/Toast.vue';
import { formatCurrency, formatDate } from '@/utils/format';
import { statusInfo } from '@/utils/supplierOrderStatus';

const { t } = useI18n();
const route = useRoute();
const queryClient = useQueryClient();

const search = ref('');
const status = ref('');
const supplierId = computed(() => route.query.supplierId || undefined);

const { data: orders, isLoading } = useQuery({
  queryKey: ['supplier-orders', search, status, supplierId],
  queryFn: () => supplierOrdersApi.getAll({ query: search.value || undefined, status: status.value || undefined, supplierId: supplierId.value }),
});

const summary = computed(() =>
  orders.value
    ? {
        pending: orders.value.filter((o) => ['draft', 'pending', 'partial'].includes(o.status)).length,
        totalDebt: orders.value.filter((o) => o.status !== 'draft' && o.status !== 'cancelled').reduce((s, o) => s + o.amountRemaining, 0),
      }
    : { pending: 0, totalDebt: 0 },
);

const payOpen = ref(false);
const payOrderId = ref('');
const payAmount = ref(0);
function openPay(o) {
  payOrderId.value = o.id;
  payAmount.value = o.amountRemaining;
  payOpen.value = true;
}
const payMutation = useMutation({
  mutationFn: () => supplierOrdersApi.addPayment(payOrderId.value, payAmount.value),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    payOpen.value = false;
  },
});
const submitMutation = useMutation({
  mutationFn: (id) => supplierOrdersApi.submit(id),
  onSuccess: () => ['supplier-orders', 'suppliers'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
});

// ── Receive (one order or all eligible ones) ──
// Submitted orders whose remaining lines are products; devices are added to stock one by one from the order page.
const openLines = (o) => o.items.filter((i) => i.receivedQuantity < i.quantity);
const isOpen = (o) => ['pending', 'partial'].includes(o.status) && openLines(o).length > 0;
const canReceive = (o) => isOpen(o) && openLines(o).every((i) => i.itemType !== 'unit');
const eligible = computed(() => (orders.value ?? []).filter(canReceive));
const withDevices = computed(() => (orders.value ?? []).filter((o) => isOpen(o) && !canReceive(o)).length);

const receiveTargets = ref([]);
const receiveBulk = ref(false);
function askReceive(list, bulk) {
  receiveTargets.value = list;
  receiveBulk.value = bulk;
}
const receiveMessage = computed(() => {
  const list = receiveTargets.value;
  if (!receiveBulk.value) return list[0] ? t('supplierOrders.receiveOneConfirm', { number: list[0].orderNumber }) : '';
  const names = list.slice(0, 6).map((o) => o.orderNumber).join(', ') + (list.length > 6 ? ', …' : '');
  const msg = t('supplierOrders.receiveAllConfirm', { n: list.length, list: names });
  return withDevices.value ? `${msg} ${t('supplierOrders.receiveAllDevicesNote', { n: withDevices.value })}` : msg;
});
const toast = ref({ show: false, message: '', type: 'success' });
const receiveMutation = useMutation({
  mutationFn: (ids) => supplierOrdersApi.receiveAll(ids),
  onSuccess: ({ received, skipped }) => {
    receiveTargets.value = [];
    for (const k of ['supplier-orders', 'supplier-order', 'suppliers', 'supplier', 'products', 'pos-products', 'inventory-movements', 'dashboard']) queryClient.invalidateQueries({ queryKey: [k] });
    const parts = [received.length && t('supplierOrders.toast.receivedAll', { n: received.length }), skipped.length && t('supplierOrders.toast.receivedSkipped', { n: skipped.length })];
    toast.value = { show: true, message: parts.filter(Boolean).join(' · ') || t('supplierOrders.receiveAllNone'), type: received.length ? 'success' : 'error' };
  },
  onError: (e) => {
    receiveTargets.value = [];
    toast.value = { show: true, message: apiErrorMessage(e, t('supplierOrders.toast.receiveError')), type: 'error' };
  },
});
const confirmReceive = () => !receiveMutation.isPending.value && receiveTargets.value.length && receiveMutation.mutate(receiveTargets.value.map((o) => o.id));
const th = 'px-4 py-3 text-start text-sm font-medium text-gray-500';
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('supplierOrders.title') }}</h1>
        <p class="text-sm text-gray-500">
          {{ summary.pending }} {{ t('supplierOrders.ordersInProgress') }} -
          <span class="font-medium text-danger-600">{{ formatCurrency(summary.totalDebt) }}</span> {{ t('supplierOrders.toPay') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn-secondary inline-flex items-center gap-2"
          :disabled="!eligible.length || receiveMutation.isPending.value"
          :title="eligible.length ? t('supplierOrders.receiveAll') : t('supplierOrders.receiveAllNone')"
          @click="askReceive(eligible, true)"
        >
          <ArchiveBoxArrowDownIcon class="h-5 w-5" /> {{ t('supplierOrders.receiveAll') }}
          <span v-if="eligible.length" class="rounded-full bg-gray-100 px-1.5 text-xs font-semibold text-gray-700">{{ eligible.length }}</span>
        </button>
        <RouterLink to="/app/supplier-orders/new" class="btn-primary inline-flex items-center gap-2"><PlusIcon class="h-5 w-5" /> {{ t('supplierOrders.newOrder') }}</RouterLink>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex flex-col gap-4 sm:flex-row">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input v-model="search" type="text" :placeholder="t('supplierOrders.searchPlaceholder')" class="input ps-10" />
        </div>
        <select v-model="status" class="input w-auto">
          <option value="">{{ t('supplierOrders.allStatus') }}</option>
          <option v-for="s in ['draft', 'pending', 'partial', 'received', 'cancelled']" :key="s" :value="s">{{ t(`supplierOrders.status.${s}`) }}</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="orders?.length" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th :class="th">{{ t('supplierOrders.order') }}</th>
              <th :class="th">{{ t('supplierOrders.supplier') }}</th>
              <th :class="th">{{ t('supplierOrders.statusHeader') }}</th>
              <th :class="th">{{ t('supplierOrders.amount') }}</th>
              <th :class="th">{{ t('supplierOrders.remaining') }}</th>
              <th :class="[th, 'text-end']">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="o in orders" :key="o.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <p class="font-medium text-gray-900">{{ o.orderNumber }}</p>
                <p class="text-sm text-gray-500">{{ formatDate(o.createdAt) }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="text-gray-900">{{ o.supplierName }}</p>
                <p class="text-sm text-gray-500">{{ o.items.length }} {{ t('supplierOrders.articles') }}</p>
              </td>
              <td class="px-4 py-3">
                <span :class="['badge inline-flex items-center gap-1', statusInfo(o.status).badge]">
                  <component :is="statusInfo(o.status).icon" class="h-3.5 w-3.5" /> {{ t(statusInfo(o.status).labelKey) }}
                </span>
              </td>
              <td class="px-4 py-3 font-medium">{{ formatCurrency(o.totalAmount) }}</td>
              <td class="px-4 py-3">
                <span :class="o.amountRemaining > 0 ? 'font-medium text-danger-600' : 'text-gray-400'">{{ o.amountRemaining > 0 ? formatCurrency(o.amountRemaining) : '-' }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <RouterLink :to="`/app/supplier-orders/${o.id}`" class="inline-block p-2 text-gray-400 hover:text-primary-600" :title="t('supplierOrders.viewDetails')">
                    <EyeIcon class="h-5 w-5" />
                  </RouterLink>
                  <button
                    v-if="canReceive(o)"
                    class="p-2 text-gray-400 hover:text-success-600 disabled:opacity-40"
                    :title="t('supplierOrders.receiveAction')"
                    :aria-label="`${t('supplierOrders.receiveAction')} ${o.orderNumber}`"
                    :disabled="receiveMutation.isPending.value"
                    @click="askReceive([o], false)"
                  >
                    <ArchiveBoxArrowDownIcon class="h-5 w-5" />
                  </button>
                  <button v-if="o.status === 'draft'" class="p-2 text-gray-400 hover:text-primary-600" :title="t('supplierOrders.submitOrder')" @click="submitMutation.mutate(o.id)">
                    <PaperAirplaneIcon class="h-5 w-5" />
                  </button>
                  <button
                    v-if="o.amountRemaining > 0 && o.status !== 'cancelled' && o.status !== 'draft'"
                    class="p-2 text-gray-400 hover:text-success-600"
                    :title="t('supplierOrders.addPayment')"
                    @click="openPay(o)"
                  >
                    <BanknotesIcon class="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-8 text-center text-gray-500">
        <ClipboardDocumentListIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>{{ t('supplierOrders.noOrders') }}</p>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="payOpen" class="modal-overlay" @click.self="payOpen = false">
        <div class="modal-content max-w-sm">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('supplierOrders.addPayment') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" @click="payOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <form @submit.prevent="payAmount > 0 && payMutation.mutate()">
            <div class="modal-body space-y-4">
              <div>
                <label class="label">{{ t('supplierOrders.paymentAmount') }}</label>
                <input v-model.number="payAmount" type="number" step="0.01" min="0" class="input text-lg font-medium" required />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="payOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="payMutation.isPending.value">
                {{ payMutation.isPending.value ? t('common.saving') : t('common.save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <ConfirmModal
      :show="receiveTargets.length > 0"
      :title="receiveBulk ? t('supplierOrders.receiveAllTitle') : t('supplierOrders.receiveTitle')"
      :message="receiveMessage"
      :confirm-text="receiveBulk ? t('supplierOrders.receiveAll') : t('supplierOrders.receiveAction')"
      :cancel-text="t('common.cancel')"
      :loading="receiveMutation.isPending.value"
      type="success"
      @confirm="confirmReceive"
      @cancel="receiveTargets = []"
    />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>

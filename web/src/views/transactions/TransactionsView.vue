<script setup>
import { intlLocale } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ArrowDownTrayIcon, DocumentTextIcon, EyeIcon, MagnifyingGlassIcon, PrinterIcon } from '@heroicons/vue/24/outline';
import { transactionsApi } from '@/api/transactions';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import ReceiptModal from '@/components/pos/ReceiptModal.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

// Filters live in the URL so the list survives a refresh / back navigation.
const query = ref(route.query.query || '');
const status = ref(route.query.status || null);
const type = ref(route.query.type || null);
const page = ref(Number(route.query.page) || 1);
const limit = ref(20);
const dateRange = ref(route.query.dateFrom && route.query.dateTo ? [route.query.dateFrom, route.query.dateTo] : null);

watch(
  [query, status, type, dateRange, page],
  () => {
    const q = {};
    if (query.value) q.query = query.value;
    if (status.value) q.status = status.value;
    if (type.value) q.type = type.value;
    if (dateRange.value?.[0] && dateRange.value?.[1]) {
      q.dateFrom = dateRange.value[0];
      q.dateTo = dateRange.value[1];
    }
    if (page.value > 1) q.page = page.value;
    router.replace({ query: q });
  },
  { deep: true },
);
watch([query, status, type, dateRange], () => (page.value = 1), { deep: true });

const dateFrom = computed(() => dateRange.value?.[0] || '');
const dateTo = computed(() => dateRange.value?.[1] || '');
const { data, isLoading } = useQuery({
  queryKey: ['transactions', query, status, type, dateFrom, dateTo, page, limit],
  queryFn: () =>
    transactionsApi.getAll({ query: query.value, status: status.value, type: type.value, dateFrom: dateFrom.value, dateTo: dateTo.value, page: page.value, limit: limit.value }),
});
const transactions = computed(() => data.value?.transactions || []);
const total = computed(() => data.value?.total || 0);
const totalPages = computed(() => Math.ceil(total.value / limit.value));

const formatWhen = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS_BADGE = { completed: 'badge-success', pending: 'badge-warning', partial: 'badge-info', cancelled: 'badge-danger', refunded: 'badge-danger' };
const TYPE_COLOR = { sale: 'text-success-600', return: 'text-danger-600', exchange: 'text-warning-600', credit: 'text-blue-600', reservation: 'text-purple-600' };

// Reprint
const showReceipt = ref(false);
const receiptTx = ref(null);
const receiptItems = computed(() =>
  (receiptTx.value?.items || []).map((i) => ({ id: i.id, name: i.productName, retailPrice: Number(i.unitPrice), quantity: i.quantity, total: Number(i.totalPrice) })),
);
const receiptCustomer = computed(() => (receiptTx.value?.customer ? `${receiptTx.value.customer.firstName} ${receiptTx.value.customer.lastName || ''}`.trim() : undefined));
const receiptMethod = computed(() => receiptTx.value?.payments?.[0]?.method || 'cash');
const receiptChange = computed(() => {
  if (!receiptTx.value) return 0;
  const paid = Number(receiptTx.value.amountPaid) || 0;
  const tot = Number(receiptTx.value.totalAmount) || 0;
  return paid > tot ? paid - tot : 0;
});
function openReceipt(tx) {
  receiptTx.value = tx;
  showReceipt.value = true;
}

const exporting = ref(false);
async function exportCsv() {
  exporting.value = true;
  try {
    const blob = await transactionsApi.exportCsv({ type: type.value, status: status.value, dateFrom: dateFrom.value, dateTo: dateTo.value });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-gray-900">{{ t('nav.transactions') }}</h1>
      <button class="btn-secondary flex items-center gap-2" :disabled="exporting" @click="exportCsv">
        <ArrowDownTrayIcon class="w-5 h-5" /> <span class="hidden sm:inline">{{ exporting ? t('transactions.exporting') : t('transactions.export') }}</span>
      </button>
    </div>

    <div class="card p-4">
      <div class="flex flex-col md:flex-row gap-4">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input v-model="query" type="text" :placeholder="t('transactions.search')" class="input ps-10" />
        </div>
        <select v-model="type" class="input w-full md:w-44">
          <option :value="null">{{ t('transactions.allTypes') }}</option>
          <option value="sale">{{ t('transactions.type.sale') }}</option>
          <option value="return">{{ t('transactions.type.return') }}</option>
          <option value="exchange">{{ t('transactions.type.exchange') }}</option>
          <option value="credit">{{ t('transactions.type.credit') }}</option>
          <option value="reservation">{{ t('transactions.type.reservation') }}</option>
        </select>
        <select v-model="status" class="input w-full md:w-44">
          <option :value="null">{{ t('transactions.allStatus') }}</option>
          <option value="completed">{{ t('transactions.status.completed') }}</option>
          <option value="pending">{{ t('transactions.status.pending') }}</option>
          <option value="partial">{{ t('transactions.status.partial') }}</option>
          <option value="cancelled">{{ t('transactions.status.cancelled') }}</option>
        </select>
        <div class="w-full md:w-64"><DateRangePicker v-model="dateRange" /></div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.number') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.date') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.customer') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.typeLabel') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.total') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.profit') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('transactions.statusLabel') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="isLoading"><td colspan="8" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="!transactions.length">
              <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                <DocumentTextIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{{ t('transactions.noTransactions') }}</p>
              </td>
            </tr>
            <tr v-for="tx in transactions" :key="tx.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="font-mono font-medium text-gray-900 whitespace-nowrap">{{ tx.transactionNumber }}</div>
                <div v-if="tx.items?.length" class="text-xs text-stone-500 mt-0.5 max-w-[220px] truncate" :title="tx.items.map((i) => i.productName).join(', ')">
                  {{ tx.items.map((i) => i.productName).join(', ') }}
                </div>
              </td>
              <td class="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">{{ formatWhen(tx.createdAt) }}</td>
              <td class="px-4 py-3">
                <div v-if="tx.customer" class="font-medium text-gray-900">{{ tx.customer.firstName }} {{ tx.customer.lastName }}</div>
                <div v-else class="text-gray-400 font-medium">{{ t('transactions.walkIn') }}</div>
                <div v-if="tx.employee" class="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
                  <span class="text-stone-400 font-normal">{{ t('employees.seller') }}:</span>
                  <span class="font-medium text-stone-700">{{ tx.employee.firstName }} {{ tx.employee.lastName }}</span>
                </div>
              </td>
              <td class="px-4 py-3"><span :class="['font-medium', TYPE_COLOR[tx.type] || 'text-gray-600']">{{ t(`transactions.type.${tx.type}`) }}</span></td>
              <td class="px-4 py-3 whitespace-nowrap">
                <div class="font-medium text-gray-900">{{ formatCurrency(tx.totalAmount) }}</div>
                <div v-if="tx.status === 'partial'" class="flex items-center gap-2 mt-0.5">
                  <span class="text-xs text-success-600">{{ t('transactions.paidAmount', { amount: formatCurrency(tx.amountPaid) }) }}</span>
                  <span class="text-xs text-gray-400">·</span>
                  <span class="text-xs text-danger-600">{{ t('transactions.dueAmount', { amount: formatCurrency(tx.totalAmount - tx.amountPaid) }) }}</span>
                </div>
              </td>
              <td :class="['px-4 py-3 font-medium whitespace-nowrap', tx.totalProfit > 0 ? 'text-success-600' : tx.totalProfit < 0 ? 'text-danger-600' : 'text-gray-500']">
                {{ formatCurrency(tx.totalProfit, 'DH', tx.totalProfit > 0 ? '+' : '') }}
              </td>
              <td class="px-4 py-3"><span :class="['badge', STATUS_BADGE[tx.status] || 'badge-secondary']">{{ t(`transactions.status.${tx.status}`) }}</span></td>
              <td class="px-4 py-3 text-end">
                <div class="flex items-center justify-end gap-2">
                  <RouterLink :to="`/app/transactions/${tx.id}`" class="p-2 text-gray-400 hover:text-primary-600"><EyeIcon class="w-5 h-5" /></RouterLink>
                  <button class="p-2 text-gray-400 hover:text-primary-600" @click="openReceipt(tx)"><PrinterIcon class="w-5 h-5" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <p class="text-sm text-gray-500">
          {{ t('common.showing') }} {{ (page - 1) * limit + 1 }} - {{ Math.min(page * limit, total) }} {{ t('common.of') }} {{ total }}
        </p>
        <div class="flex gap-2">
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page === 1" @click="page--">{{ t('common.previous') }}</button>
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page >= totalPages" @click="page++">{{ t('common.next') }}</button>
        </div>
      </div>
    </div>

    <ReceiptModal
      v-if="receiptTx"
      :is-open="showReceipt"
      :transaction-number="receiptTx.transactionNumber"
      :items="receiptItems"
      :subtotal="Number(receiptTx.subtotal) || Number(receiptTx.totalAmount)"
      :tax="Number(receiptTx.taxAmount) || 0"
      :total="Number(receiptTx.totalAmount)"
      :amount-paid="Number(receiptTx.amountPaid) || Number(receiptTx.totalAmount)"
      :change="receiptChange"
      :payment-method="receiptMethod"
      :customer-name="receiptCustomer"
      :store-name="auth.storeName || 'CaissePro'"
      :cashier-name="auth.currentUser ? `${auth.currentUser.firstName} ${auth.currentUser.lastName}` : undefined"
      :date="receiptTx.createdAt"
      @close="showReceipt = false"
    />
  </div>
</template>

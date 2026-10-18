<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { DocumentTextIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { suppliersApi } from '@/api/suppliers';
import { formatCurrency } from '@/utils/format';
import { invoiceBadge, shortDay } from '@/utils/supplierInvoice';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import Pagination from '@/components/ui/Pagination.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const search = ref('');
const debounced = ref('');
let timer;
watch(search, (v) => {
  clearTimeout(timer);
  timer = setTimeout(() => (debounced.value = v.trim()), 300);
});
const supplierId = ref(route.query.supplierId || '');
const status = ref('');
const paymentStatus = ref(route.query.paymentStatus || '');
const range = ref(null);
const page = ref(1);
watch([debounced, supplierId, status, paymentStatus, range], () => (page.value = 1));

const params = computed(() => ({
  query: debounced.value,
  supplierId: supplierId.value,
  status: status.value,
  paymentStatus: paymentStatus.value,
  dateFrom: range.value?.[0],
  dateTo: range.value?.[1],
  page: page.value,
  limit: 20,
}));
const { data, isLoading, isError } = useQuery({ queryKey: ['supplier-invoices', params], queryFn: () => supplierInvoicesApi.getAll(params.value), placeholderData: keepPreviousData });
const rows = computed(() => data.value?.invoices || []);
const meta = computed(() => data.value?.meta || { total: 0, page: 1, totalPages: 1 });
const totals = computed(() => data.value?.totals || { count: 0, total: 0, paid: 0, remaining: 0, overdue: 0 });
const { data: suppliers } = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => suppliersApi.getAll() });
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('supplierInvoices.title') }}</h1>
        <p class="mt-1 text-sm text-gray-500">{{ t('supplierInvoices.subtitle') }}</p>
      </div>
      <RouterLink to="/app/supplier-invoices/new" class="btn-primary inline-flex items-center gap-2 self-start"><PlusIcon class="h-5 w-5" /> {{ t('supplierInvoices.new') }}</RouterLink>
    </div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('supplierInvoices.totalAmount') }}</p>
        <p class="mt-1 text-2xl font-bold text-gray-900">{{ formatCurrency(totals.total) }}</p>
        <p class="text-xs text-gray-400">{{ t('supplierInvoices.count', { n: totals.count }) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('supplierInvoices.paid') }}</p>
        <p class="mt-1 text-2xl font-bold text-success-700">{{ formatCurrency(totals.paid) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('supplierInvoices.remaining') }}</p>
        <p :class="['mt-1 text-2xl font-bold', totals.remaining > 0 ? 'text-danger-600' : 'text-gray-900']">{{ formatCurrency(totals.remaining) }}</p>
      </div>
      <button class="card p-4 text-start hover:border-gray-400" @click="paymentStatus = paymentStatus === 'overdue' ? '' : 'overdue'">
        <p class="text-sm text-gray-500">{{ t('supplierInvoices.overdueAmount') }}</p>
        <p :class="['mt-1 text-2xl font-bold', totals.overdue > 0 ? 'text-amber-600' : 'text-gray-900']">{{ formatCurrency(totals.overdue) }}</p>
      </button>
    </div>

    <div class="card p-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_12rem_10rem_11rem_16rem]">
        <div class="relative">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input v-model="search" type="search" class="input ps-10" :placeholder="t('supplierInvoices.search')" :aria-label="t('supplierInvoices.search')" />
        </div>
        <select v-model="supplierId" class="input" :aria-label="t('supplierInvoices.supplier')">
          <option value="">{{ t('supplierInvoices.allSuppliers') }}</option>
          <option v-for="s in suppliers?.suppliers || []" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <select v-model="status" class="input" :aria-label="t('common.status')">
          <option value="">{{ t('supplierInvoices.allStatuses') }}</option>
          <option v-for="s in ['draft', 'confirmed', 'cancelled']" :key="s" :value="s">{{ t(`supplierInvoices.status.${s}`) }}</option>
        </select>
        <select v-model="paymentStatus" class="input" :aria-label="t('supplierInvoices.allPayments')">
          <option value="">{{ t('supplierInvoices.allPayments') }}</option>
          <option v-for="s in ['unpaid', 'partial', 'paid', 'overdue']" :key="s" :value="s">{{ t(`supplierInvoices.paymentStatus.${s}`) }}</option>
        </select>
        <DateRangePicker v-model="range" />
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="isError" class="p-8 text-center text-danger-600">{{ t('common.genericError') }}</div>
      <div v-else-if="!rows.length" class="p-10 text-center text-gray-500">
        <DocumentTextIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>{{ t('supplierInvoices.empty') }}</p>
        <RouterLink to="/app/supplier-invoices/new" class="btn-primary mt-4 inline-flex items-center gap-2"><PlusIcon class="h-4 w-4" /> {{ t('supplierInvoices.new') }}</RouterLink>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.number') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.supplier') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.invoiceDate') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.dueDate') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.total') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.paid') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.remaining') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('common.status') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="inv in rows" :key="inv.id" class="cursor-pointer hover:bg-gray-50" @click="router.push(`/app/supplier-invoices/${inv.id}`)">
              <td class="whitespace-nowrap px-4 py-3">
                <p class="font-mono font-medium text-gray-900">{{ inv.number }}</p>
                <p v-if="inv.supplierRef" class="text-xs text-gray-500">{{ inv.supplierRef }}</p>
              </td>
              <td class="px-4 py-3 text-gray-900">{{ inv.supplier?.name }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-gray-600">{{ shortDay(inv.invoiceDate) }}</td>
              <td :class="['whitespace-nowrap px-4 py-3', inv.overdue ? 'font-medium text-amber-700' : 'text-gray-600']">{{ inv.dueDate ? shortDay(inv.dueDate) : '—' }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-end font-semibold text-gray-900">{{ formatCurrency(inv.total) }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-end text-gray-600">{{ formatCurrency(inv.amountPaid) }}</td>
              <td :class="['whitespace-nowrap px-4 py-3 text-end', inv.status === 'confirmed' && inv.remaining > 0 ? 'font-semibold text-danger-600' : 'text-gray-500']">
                {{ inv.status === 'cancelled' ? '—' : formatCurrency(inv.remaining) }}
              </td>
              <td class="whitespace-nowrap px-4 py-3">
                <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', invoiceBadge(inv).cls]">{{ t(invoiceBadge(inv).key) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="meta.total" class="border-t border-gray-100 px-4 py-3">
        <Pagination v-model:page="page" :total-pages="meta.totalPages" :total="meta.total" :page-size="20" />
      </div>
    </div>
  </div>
</template>

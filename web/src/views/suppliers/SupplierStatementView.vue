<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { ArrowDownTrayIcon, ArrowLeftIcon, ExclamationTriangleIcon, PrinterIcon } from '@heroicons/vue/24/outline';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { apiErrorMessage } from '@/api/http';
import { formatCurrency } from '@/utils/format';
import { daysLate, shortDay } from '@/utils/supplierInvoice';
import { printSupplierStatement, supplierStatementPdf } from '@/utils/supplierDocs';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import Toast from '@/components/ui/Toast.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id);
const range = ref(null);
const params = computed(() => ({ dateFrom: range.value?.[0], dateTo: range.value?.[1] }));
const { data: st, isLoading, isError } = useQuery({
  queryKey: ['supplier-statement', id, params],
  queryFn: () => supplierInvoicesApi.statement(id.value, params.value),
  placeholderData: keepPreviousData,
});
const toast = ref({ show: false, message: '', type: 'error' });
const link = (e) => (e.kind === 'invoice' || e.kind === 'payment' ? `/app/supplier-invoices/${e.documentId}` : `/app/supplier-orders/${e.documentId}`);
const pdf = () => supplierStatementPdf(st.value, range.value).catch((e) => (toast.value = { show: true, message: apiErrorMessage(e), type: 'error' }));
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex items-start gap-3">
        <button class="rounded-lg p-2 hover:bg-gray-100" :aria-label="t('common.back')" @click="router.push(`/app/suppliers/${id}`)"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('supplierInvoices.statement') }}</h1>
          <p v-if="st" class="text-sm text-gray-500">{{ t('supplierInvoices.statementSubtitle', { name: st.supplier.name }) }}</p>
        </div>
      </div>
      <div v-if="st" class="flex flex-wrap gap-2">
        <div class="w-72"><DateRangePicker v-model="range" /></div>
        <button class="btn-secondary inline-flex items-center gap-2" @click="printSupplierStatement(st, range)"><PrinterIcon class="h-5 w-5" /> {{ t('supplierInvoices.print') }}</button>
        <button class="btn-secondary inline-flex items-center gap-2" @click="pdf"><ArrowDownTrayIcon class="h-5 w-5" /> {{ t('supplierInvoices.pdf') }}</button>
      </div>
    </div>

    <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
    <div v-else-if="isError || !st" class="card p-8 text-center text-danger-600">{{ t('common.genericError') }}</div>
    <template v-else>
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.totalPurchases') }}</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ formatCurrency(st.totals.purchases) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.totalPaid') }}</p>
          <p class="mt-1 text-2xl font-bold text-success-700">{{ formatCurrency(st.totals.paid) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.outstanding') }}</p>
          <p :class="['mt-1 text-2xl font-bold', st.totals.outstanding > 0 ? 'text-danger-600' : 'text-gray-900']">{{ formatCurrency(st.totals.outstanding) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.overdueAmount') }}</p>
          <p :class="['mt-1 text-2xl font-bold', st.totals.overdue > 0 ? 'text-amber-600' : 'text-gray-900']">{{ formatCurrency(st.totals.overdue) }}</p>
        </div>
      </div>

      <div v-if="st.overdueInvoices.length" class="card border-amber-200 bg-amber-50 p-4">
        <h2 class="mb-2 flex items-center gap-2 font-semibold text-amber-900"><ExclamationTriangleIcon class="h-5 w-5" /> {{ t('supplierInvoices.overdueInvoices') }}</h2>
        <ul class="space-y-1 text-sm">
          <li v-for="o in st.overdueInvoices" :key="o.id" class="flex flex-wrap justify-between gap-2">
            <RouterLink :to="`/app/supplier-invoices/${o.id}`" class="font-mono font-medium text-amber-900 hover:underline">{{ o.number }}</RouterLink>
            <span class="text-amber-800">{{ t('supplierInvoices.dueOn', { date: shortDay(o.dueDate) }) }} · {{ t('supplierInvoices.daysLate', { n: daysLate(o.dueDate) }) }}</span>
            <span class="font-semibold text-amber-900">{{ formatCurrency(o.remaining) }}</span>
          </li>
        </ul>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.date') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.description') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.debit') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.credit') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.balance') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr class="bg-gray-50/50">
                <td class="px-4 py-2" />
                <td class="px-4 py-2 italic text-gray-500">{{ t('supplierInvoices.openingBalance') }}</td>
                <td /><td />
                <td class="whitespace-nowrap px-4 py-2 text-end font-medium">{{ formatCurrency(st.openingBalance) }}</td>
              </tr>
              <tr v-for="(e, i) in st.entries" :key="i" class="hover:bg-gray-50">
                <td class="whitespace-nowrap px-4 py-3 text-gray-600">{{ shortDay(e.date) }}</td>
                <td class="px-4 py-3">
                  <RouterLink :to="link(e)" class="font-medium text-gray-900 hover:underline">{{ t(`supplierInvoices.kind.${e.kind}`, { ref: e.reference }) }}</RouterLink>
                  <p class="text-xs text-gray-500">
                    <template v-if="e.method">{{ t(`supplierInvoices.methods.${e.method}`) }}<template v-if="e.paymentReference"> · {{ e.paymentReference }}</template></template>
                    <template v-if="e.supplierRef">{{ e.supplierRef }}</template>
                    <span v-if="e.dueDate" :class="e.overdue ? 'font-medium text-amber-700' : ''"> · {{ t('supplierInvoices.dueOn', { date: shortDay(e.dueDate) }) }}</span>
                  </p>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-end">{{ e.debit ? formatCurrency(e.debit) : '' }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end text-success-700">{{ e.credit ? formatCurrency(e.credit) : '' }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end font-semibold">{{ formatCurrency(e.balance) }}</td>
              </tr>
              <tr v-if="!st.entries.length"><td colspan="5" class="px-4 py-8 text-center text-gray-500">{{ t('supplierInvoices.noEntries') }}</td></tr>
            </tbody>
            <tfoot class="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td class="px-4 py-3" />
                <td class="px-4 py-3">{{ t('supplierInvoices.closingBalance') }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end">{{ formatCurrency(st.period.purchases) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end text-success-700">{{ formatCurrency(st.period.payments) }}</td>
                <td class="whitespace-nowrap px-4 py-3 text-end">{{ formatCurrency(st.period.closingBalance) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </template>
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>

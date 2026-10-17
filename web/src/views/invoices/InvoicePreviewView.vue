<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ArrowDownTrayIcon, ArrowLeftIcon, PrinterIcon } from '@heroicons/vue/24/outline';
import { invoicesApi } from '@/api/invoices';
import { settingsApi } from '@/api/misc';
import { amountInWords } from '@/utils/amountInWords';
import { dt } from '@/i18n';
import { companyFromSettings, customerLabel, formatInvoiceDay, formatMad, invoicePdfBlob } from '@/utils/invoicePdf';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id);
const { data: invoice, isLoading, isError } = useQuery({ queryKey: ['invoice', id], queryFn: () => invoicesApi.getById(id.value) });
const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings() });
const company = computed(() => companyFromSettings(settings.value));
const words = computed(() => {
  const s = amountInWords(invoice.value?.totalAmount);
  return s.charAt(0).toUpperCase() + s.slice(1);
});

const previousTitle = document.title;
watch(invoice, (inv) => inv?.invoiceNumber && (document.title = dt('doc.invoice.pageTitle', { number: inv.invoiceNumber })));
onBeforeUnmount(() => (document.title = previousTitle));

const printPage = () => window.print();
const downloading = ref(false);
async function downloadPdf() {
  if (!invoice.value) return;
  downloading.value = true;
  try {
    const blob = await invoicePdfBlob(invoice.value, company.value);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.value.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 rounded-xl overflow-hidden print:bg-white print:min-h-0 print:rounded-none">
    <div class="sticky top-0 z-10 bg-white border-b border-gray-200 print:hidden">
      <div class="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <button class="flex items-center gap-2 text-gray-600 hover:text-gray-900" @click="router.push('/app/invoices')">
          <ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" /> {{ t('invoices.backToInvoices') }}
        </button>
        <div class="flex gap-2">
          <button class="btn-secondary flex items-center gap-2" @click="printPage"><PrinterIcon class="w-5 h-5" /> {{ t('common.print') }}</button>
          <button class="btn-primary flex items-center gap-2" :disabled="downloading" @click="downloadPdf"><ArrowDownTrayIcon class="w-5 h-5" /> {{ t('invoices.download') }}</button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>
    <div v-else-if="isError" class="flex justify-center py-20">
      <div class="text-center">
        <p class="text-gray-500 mb-4">{{ t('invoices.loadError') }}</p>
        <button class="btn-primary" @click="router.push('/app/invoices')">{{ t('common.back') }}</button>
      </div>
    </div>

    <div v-else-if="invoice" class="py-6 print:py-0 px-2 sm:px-4">
      <div class="invoice-sheet bg-white shadow-lg print:shadow-none mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
          <div>
            <div class="text-4xl font-bold tracking-tight text-gray-900">{{ dt('doc.invoice.title') }}</div>
            <div class="mt-2 text-gray-700">{{ dt('doc.invoice.number', { number: invoice.invoiceNumber }) }}</div>
            <div class="text-sm text-gray-600">{{ dt('doc.invoice.issued', { date: formatInvoiceDay(invoice.date) }) }}</div>
          </div>
          <div class="bg-gray-100 rounded-md p-4 sm:w-80">
            <div class="font-bold text-gray-900 mb-2">{{ dt('doc.invoice.client') }}</div>
            <div class="text-sm space-y-0.5">
              <div><strong>{{ customerLabel(invoice) }}</strong></div>
              <div v-if="invoice.customer?.ice">ICE: {{ invoice.customer.ice }}</div>
              <div v-else-if="invoice.customer?.cin">CIN: {{ invoice.customer.cin }}</div>
              <div v-else-if="invoice.customerTaxId">ICE: {{ invoice.customerTaxId }}</div>
              <div v-if="invoice.customer?.address || invoice.customerAddress">{{ invoice.customer?.address || invoice.customerAddress }}</div>
              <div v-if="invoice.customer?.city">{{ invoice.customer.city }}</div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm invoice-table">
            <thead>
              <tr>
                <th class="text-start" style="width: 50%">{{ dt('doc.invoice.description') }}</th>
                <th class="text-center" style="width: 15%">{{ dt('doc.invoice.quantity') }}</th>
                <th class="text-end" style="width: 17%">{{ dt('doc.invoice.unitPrice') }}</th>
                <th class="text-end" style="width: 18%">{{ dt('doc.invoice.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in invoice.items" :key="item.id">
                <td>{{ item.description }}</td>
                <td class="text-center">{{ item.quantity }}</td>
                <td class="text-end whitespace-nowrap">{{ formatMad(item.unitPrice) }}</td>
                <td class="text-end whitespace-nowrap">{{ formatMad(item.subtotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-6 flex flex-col items-end gap-1 text-sm">
          <div class="flex gap-6"><span class="font-semibold">{{ dt('doc.invoice.subtotal') }}</span><span>{{ formatMad(invoice.subtotal) }}</span></div>
          <div v-if="invoice.discountAmount > 0" class="flex gap-6"><span class="font-semibold">{{ dt('doc.invoice.discount') }}</span><span class="text-red-600">-{{ formatMad(invoice.discountAmount) }}</span></div>
          <div class="w-64 border-t border-gray-300 my-2" />
          <div class="font-bold">{{ dt('doc.invoice.netTotal') }}</div>
          <div class="font-bold">{{ dt('doc.invoice.amountNote') }}</div>
          <div class="text-xl font-bold">{{ formatMad(invoice.totalAmount) }}</div>
        </div>

        <div class="mt-6 border border-gray-300 bg-gray-50 p-3 text-sm">
          <div class="font-bold">{{ dt('doc.invoice.inWords') }}</div>
          <div>{{ words }}</div>
        </div>

        <div v-if="invoice.notes" class="mt-4 border border-gray-200 bg-gray-50 p-3 text-sm">
          <div class="font-bold">{{ dt('doc.invoice.notes') }}</div>
          <div class="whitespace-pre-line">{{ invoice.notes }}</div>
        </div>

        <div class="mt-10 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-gray-700">
          <div class="space-y-0.5">
            <div v-if="company.phone">{{ dt('doc.invoice.phone', { value: company.phone }) }}</div>
            <div v-if="company.address">{{ company.address }}</div>
            <div v-if="company.ice">ICE: {{ company.ice }}</div>
            <div v-if="company.rc">RC: {{ company.rc }}</div>
            <div v-if="company.patente">{{ dt('doc.invoice.patente', { value: company.patente }) }}</div>
            <div v-if="company.identifiantFiscal">IF: {{ company.identifiantFiscal }}</div>
            <div v-if="company.taxeProfessionnelle">TP: {{ company.taxeProfessionnelle }}</div>
            <div v-if="company.cnie">CNIE: {{ company.cnie }}</div>
          </div>
          <div v-if="company.bankName || company.accountHolder || company.accountNumber || company.rib" class="space-y-0.5">
            <div class="font-bold text-sm">{{ dt('doc.invoice.bankDetails') }}</div>
            <div v-if="company.bankName">{{ dt('doc.invoice.bank', { value: company.bankName }) }}</div>
            <div v-if="company.accountHolder">{{ dt('doc.invoice.holder', { value: company.accountHolder }) }}</div>
            <div v-if="company.accountNumber">{{ dt('doc.invoice.accountNumber', { value: company.accountNumber }) }}</div>
            <div v-if="company.rib">RIB: {{ company.rib }}</div>
          </div>
        </div>
        <div class="mt-6 text-center text-xs italic text-gray-500">{{ dt('doc.invoice.legal') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.invoice-sheet {
  max-width: 210mm;
  min-height: 297mm;
  padding: 15mm;
}
@media (max-width: 640px) {
  .invoice-sheet {
    min-height: 0;
    padding: 6mm;
  }
}
.invoice-table th {
  background: #2c5282;
  color: #fff;
  padding: 6px 8px;
}
.invoice-table td {
  padding: 6px 8px;
}
.invoice-table tbody tr:nth-child(odd) {
  background: #f9f9f9;
}
@media print {
  .invoice-sheet {
    padding: 0;
    min-height: 0;
  }
}
</style>

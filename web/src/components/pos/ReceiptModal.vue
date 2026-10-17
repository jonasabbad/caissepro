<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowDownTrayIcon, CheckCircleIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { useI18n } from 'vue-i18n';
import { formatCurrency } from '@/utils/format';
import { dt } from '@/i18n';
import { downloadReceiptPdf, paymentLabel, printReceipt, RECEIPT_TEXT, receiptDate } from '@/utils/receipt';

const props = defineProps({
  isOpen: Boolean,
  transactionNumber: { type: String, default: '' },
  items: { type: Array, default: () => [] }, // { id, name, quantity, retailPrice, total }
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  change: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash' },
  customerName: String,
  storeName: String,
  storeAddress: String,
  storePhone: String,
  cashierName: String,
  applyTva: Boolean,
  date: String,
  title: String,
  docLabel: String,
  extraLines: { type: Array, default: () => [] },
  hidePayment: Boolean,
  hideTotals: Boolean,
  footerNote: String,
  autoPrint: Boolean,
});
const emit = defineEmits(['close']);
const { t } = useI18n();

const printing = ref(false);
const downloading = ref(false);
const when = () => props.date || new Date().toISOString();

const receipt = computed(() => ({
  transactionNumber: props.transactionNumber,
  date: when(),
  cashierName: props.cashierName || dt('doc.receipt.cashierFallback'),
  storeName: props.storeName || dt('doc.receipt.storeFallback'),
  storeAddress: props.storeAddress,
  storePhone: props.storePhone,
  items: props.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.retailPrice, total: i.total })),
  subtotal: props.subtotal,
  taxAmount: props.tax,
  discount: 0,
  total: props.total,
  paymentMethod: props.paymentMethod,
  amountPaid: props.amountPaid,
  change: props.change,
  customerName: props.customerName,
  docLabel: props.docLabel,
  extraLines: props.extraLines,
  hidePayment: props.hidePayment,
  hideTotals: props.hideTotals,
  footerNote: props.footerNote,
}));

async function print() {
  printing.value = true;
  try {
    await printReceipt(receipt.value);
  } catch (e) {
    console.error('Error printing receipt:', e);
  } finally {
    setTimeout(() => (printing.value = false), 500);
  }
}

async function download() {
  downloading.value = true;
  try {
    await downloadReceiptPdf(receipt.value);
  } catch (e) {
    console.error('Error downloading PDF:', e);
  } finally {
    setTimeout(() => (downloading.value = false), 500);
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open && props.autoPrint) printReceipt(receipt.value);
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div class="flex items-center gap-3">
            <CheckCircleIcon v-if="!title" class="w-8 h-8 text-success-500" />
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ title || t('doc.receipt.paymentDone') }}</h2>
              <p class="text-sm text-gray-500">{{ transactionNumber }}</p>
            </div>
          </div>
          <button class="p-2 hover:bg-gray-100 rounded-lg" @click="emit('close')"><XMarkIcon class="w-5 h-5 text-gray-400" /></button>
        </div>

        <div class="p-6 max-h-96 overflow-y-auto">
          <div class="bg-gray-50 p-4 rounded-lg font-mono text-sm">
            <div class="text-center mb-4">
              <p class="font-bold text-lg">{{ storeName || dt('doc.receipt.storeFallback') }}</p>
              <p v-if="storeAddress" class="text-xs text-gray-600">{{ storeAddress }}</p>
              <p v-if="storePhone" class="text-xs text-gray-600">{{ dt('doc.receipt.phone', { phone: storePhone }) }}</p>
              <p class="text-xs text-gray-500 mt-1">{{ receiptDate(when()) }}</p>
            </div>
            <div class="border-t border-dashed border-gray-300 my-3" />
            <p class="text-xs text-gray-600 mb-2">{{ dt('doc.receipt.number', { label: docLabel || RECEIPT_TEXT.docLabel, number: transactionNumber }) }}</p>
            <p v-if="cashierName" class="text-xs text-gray-600 mb-2">{{ dt('doc.receipt.cashier', { name: cashierName }) }}</p>
            <p v-if="customerName" class="text-xs text-gray-600 mb-2">{{ dt('doc.receipt.customer', { name: customerName }) }}</p>
            <p v-for="(line, i) in extraLines" :key="i" class="text-xs text-gray-600 mb-2">{{ line }}</p>
            <div class="border-t border-dashed border-gray-300 my-3" />
            <template v-if="items.length">
              <div class="space-y-2">
                <div v-for="item in items" :key="item.id" class="flex justify-between text-xs">
                  <div class="flex-1">
                    <p>{{ item.name }}</p>
                    <p class="text-gray-500">{{ item.quantity }} x {{ formatCurrency(item.retailPrice) }}</p>
                  </div>
                  <span class="font-medium">{{ formatCurrency(item.total) }}</span>
                </div>
              </div>
              <div class="border-t border-dashed border-gray-300 my-3" />
            </template>
            <div v-if="!hideTotals" class="space-y-1 text-xs">
              <div class="flex justify-between"><span>{{ dt('doc.receipt.subtotal') }}</span><span>{{ formatCurrency(subtotal) }}</span></div>
              <div v-if="applyTva" class="flex justify-between text-gray-600"><span>{{ dt('doc.receipt.vat', { rate: 20 }) }}</span><span>{{ formatCurrency(tax) }}</span></div>
              <div class="flex justify-between font-bold text-base mt-2"><span>{{ dt('doc.receipt.grandTotal') }}</span><span>{{ formatCurrency(total) }}</span></div>
            </div>
            <template v-if="!hidePayment">
              <div class="border-t border-dashed border-gray-300 my-3" />
              <div class="space-y-1 text-xs">
                <div class="flex justify-between"><span>{{ dt('doc.receipt.method', { method: paymentLabel(paymentMethod) }) }}</span></div>
                <div class="flex justify-between"><span>{{ dt('doc.receipt.paid') }}</span><span>{{ formatCurrency(amountPaid) }}</span></div>
                <div v-if="change > 0" class="flex justify-between font-bold"><span>{{ dt('doc.receipt.changeShort') }}</span><span>{{ formatCurrency(change) }}</span></div>
              </div>
            </template>
            <div class="border-t border-dashed border-gray-300 my-3" />
            <div class="text-center text-xs text-gray-500">
              <p>{{ footerNote || RECEIPT_TEXT.footerNote }}</p>
              <p>{{ RECEIPT_TEXT.site }}</p>
            </div>
          </div>
        </div>

        <div class="flex gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button class="flex-1 btn-secondary" @click="emit('close')">{{ t('common.close') }}</button>
          <button class="btn-secondary inline-flex items-center justify-center gap-2 px-3" :disabled="downloading" :title="t('doc.receipt.download')" @click="download">
            <ArrowDownTrayIcon class="w-5 h-5" />
          </button>
          <button class="flex-1 btn-primary inline-flex items-center justify-center gap-2" :disabled="printing" @click="print">
            <PrinterIcon class="w-5 h-5" /> {{ printing ? t('doc.receipt.printing') : t('common.print') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

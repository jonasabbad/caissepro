<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import QRCode from 'qrcode';
import { ClipboardDocumentIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { labelTemplatesApi, DEFAULT_PRODUCT_LABEL } from '@/api/labelTemplates';
import { labelDocument, printHtmlDocument, truncate } from '@/utils/printFrame';

const props = defineProps({ isOpen: Boolean, product: { type: Object, default: null } });
const emit = defineEmits(['close']);
const { t } = useI18n();

const qr = ref('');
const copied = ref(false);

const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const storeName = computed(() => settings.value?.storeName || settings.value?.tenantName || '');

const qrValue = computed(() => (props.product && (props.product.barcode || props.product.sku)) || '');
const codeLabel = computed(() => (props.product ? (props.product.barcode ? t('products.barcode') : t('products.sku')) : ''));
const codeValue = computed(() => (props.product ? props.product.barcode || props.product.sku || '-' : ''));
const priceText = computed(() =>
  props.product
    ? new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(props.product.retailPrice) + ' DH'
    : '0 DH',
);

const STATUS_CLASS = {
  available: 'bg-emerald-100 text-emerald-700',
  low_stock: 'bg-yellow-100 text-yellow-700',
  out_of_stock: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-700',
};

async function generate() {
  if (!props.product) {
    qr.value = '';
    return;
  }
  try {
    qr.value = await QRCode.toDataURL(qrValue.value, { width: 200, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
  } catch (e) {
    console.error('QR Code generation error:', e);
    qr.value = '';
  }
}
watch(() => props.product, () => props.isOpen && props.product && generate(), { immediate: true });
watch(() => props.isOpen, (open) => open && props.product && generate());

async function copy() {
  if (!codeValue.value || codeValue.value === '-') return;
  try {
    await navigator.clipboard.writeText(codeValue.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}

async function printLabel() {
  const p = props.product;
  if (!p) return;
  const categoryId = p.categoryId || p.category?.id;
  const tpl = categoryId ? await labelTemplatesApi.getByCategory(categoryId) : { ...DEFAULT_PRODUCT_LABEL };
  printHtmlDocument(
    labelDocument({
      qrDataUrl: tpl.includeQr ? qr.value : null,
      lines: [
        tpl.includeName && { text: truncate(p.name || '', 24), size: 10 },
        tpl.includeBarcode && p.barcode && { text: p.barcode, size: 9 },
        tpl.includePrice && { text: priceText.value, size: 10 },
      ],
      footer: tpl.includeCompany ? storeName.value : '',
    }),
  );
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative mx-4 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b p-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('products.qrCode') }}</h3>
          <button class="rounded-lg p-2 hover:bg-gray-100" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div v-if="product" class="space-y-6 p-6">
          <div class="text-center"><h4 class="text-xl font-bold text-gray-900">{{ product.name }}</h4></div>
          <div class="flex justify-center">
            <div class="rounded-lg border bg-white p-4 shadow-sm">
              <img v-if="qr" :src="qr" alt="QR Code" class="h-48 w-48" />
              <div v-else class="flex h-48 w-48 items-center justify-center text-gray-400">{{ t('common.loading') }}</div>
            </div>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-500">{{ codeLabel }}</p>
            <p class="font-mono text-lg font-medium">{{ codeValue }}</p>
          </div>
          <div class="flex items-center justify-center gap-4">
            <span :class="['rounded-full px-3 py-1 text-sm font-medium', STATUS_CLASS[product.status] || 'bg-blue-100 text-blue-700']">
              {{ t(`products.status.${product.status}`) }}
            </span>
            <span class="text-xl font-bold text-black">{{ priceText }}</span>
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 border-t bg-gray-50 p-4">
          <button class="btn-secondary inline-flex items-center gap-2" @click="copy">
            <ClipboardDocumentIcon class="h-5 w-5" />
            <span v-if="copied">{{ t('common.copied') }}</span>
            <span v-else-if="product?.barcode">{{ t('products.copyBarcode') }}</span>
            <span v-else>{{ t('products.copySku') }}</span>
          </button>
          <button class="btn-primary inline-flex items-center gap-2" @click="printLabel">
            <PrinterIcon class="h-5 w-5" /> {{ t('products.printLabel') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

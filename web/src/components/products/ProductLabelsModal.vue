<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ClipboardDocumentIcon, MinusIcon, PlusIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { DEFAULT_PRODUCT_LABEL, labelTemplatesApi } from '@/api/labelTemplates';
import { currentLocale } from '@/i18n';
import { barcodeSvg, formatBarcodeText } from '@/utils/barcode';
import { formatCurrency } from '@/utils/format';
import { LABEL_SIZES, labelsDocument, printHtmlDocument } from '@/utils/printFrame';
import BarcodeView from '@/components/ui/BarcodeView.vue';

/**
 * Compact barcode labels for products (name, selling price, barcode) to stick on the back of the item.
 * Opened for one product or for a selection; each product can be printed several times.
 */
const props = defineProps({ isOpen: Boolean, products: { type: Array, default: () => [] } });
const emit = defineEmits(['close']);
const { t } = useI18n();

const SIZE_KEY = 'product_label_size';
const size = ref((() => {
  try {
    return LABEL_SIZES[localStorage.getItem(SIZE_KEY)] ? localStorage.getItem(SIZE_KEY) : 'compact';
  } catch {
    return 'compact';
  }
})());
watch(size, (v) => {
  try {
    localStorage.setItem(SIZE_KEY, v);
  } catch {
    /* ignore */
  }
});

const copies = ref({});
watch(
  () => [props.isOpen, props.products],
  () => {
    if (!props.isOpen) return;
    copies.value = Object.fromEntries(props.products.map((p) => [p.id, 1]));
  },
  { immediate: true },
);
const setCopies = (id, n) => (copies.value[id] = Math.max(0, Math.min(500, Math.floor(Number(n) || 0))));
const totalLabels = computed(() => props.products.reduce((s, p) => s + (copies.value[p.id] || 0), 0));

const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const storeName = computed(() => settings.value?.storeName || settings.value?.tenantName || '');

async function templateFor(p) {
  const categoryId = p.categoryId || p.category?.id;
  try {
    return categoryId ? await labelTemplatesApi.getByCategory(categoryId) : { ...DEFAULT_PRODUCT_LABEL };
  } catch {
    return { ...DEFAULT_PRODUCT_LABEL };
  }
}
const labelFor = (p, tpl) => ({
  lines: [
    tpl.includeName !== false && { text: p.name || '', size: size.value === 'small' ? 6.5 : 7.5, bold: false },
    tpl.includePrice !== false && { text: formatCurrency(p.retailPrice), size: size.value === 'small' ? 8.5 : 10 },
  ],
  barcodeSvg: barcodeSvg(p.barcode),
  barcodeText: formatBarcodeText(p.barcode),
  footer: tpl.includeCompany ? storeName.value : '',
});

// Live preview of the first label, rendered exactly as printed.
const preview = ref('');
watch(
  () => [props.isOpen, props.products[0], size.value, storeName.value],
  async () => {
    const p = props.products[0];
    if (!props.isOpen || !p?.barcode) return (preview.value = '');
    const dims = LABEL_SIZES[size.value];
    preview.value = labelsDocument([labelFor(p, await templateFor(p))], { ...dims, lang: currentLocale() });
  },
  { immediate: true },
);
const previewStyle = computed(() => {
  const { width, height } = LABEL_SIZES[size.value];
  return { width: `${width}mm`, height: `${height}mm`, transform: 'scale(2)', transformOrigin: 'top center' };
});
const previewBox = computed(() => {
  const { height } = LABEL_SIZES[size.value];
  return { height: `calc(${height}mm * 2 + 8px)` };
});

const missing = computed(() => props.products.filter((p) => !p.barcode));
const printing = ref(false);
async function print() {
  printing.value = true;
  try {
    const labels = [];
    for (const p of props.products) {
      const n = copies.value[p.id] || 0;
      if (!n || !p.barcode) continue;
      const one = labelFor(p, await templateFor(p));
      for (let i = 0; i < n; i++) labels.push(one);
    }
    if (labels.length) printHtmlDocument(labelsDocument(labels, { ...LABEL_SIZES[size.value], lang: currentLocale(), title: t('products.labels.title') }));
  } finally {
    printing.value = false;
  }
}

const copied = ref(false);
async function copyBarcode() {
  const code = props.products[0]?.barcode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    /* clipboard unavailable */
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b p-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('products.labels.title') }}</h3>
          <button class="rounded-lg p-2 hover:bg-gray-100" :title="t('common.close')" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </div>

        <div class="space-y-5 overflow-y-auto p-5">
          <div v-if="products.length === 1" class="text-center">
            <p class="font-semibold text-gray-900">{{ products[0].name }}</p>
            <div class="mt-3"><BarcodeView :value="products[0].barcode" /></div>
          </div>

          <div>
            <label class="label">{{ t('products.labels.size') }}</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="(dims, key) in LABEL_SIZES"
                :key="key"
                type="button"
                :class="['rounded-lg border p-2 text-center text-sm transition-colors', size === key ? 'border-black bg-gray-100 font-medium text-black' : 'border-gray-200 hover:border-gray-300']"
                @click="size = key"
              >
                {{ t(`products.labels.sizes.${key}`) }}
                <span class="block text-xs text-gray-500">{{ dims.width }} × {{ dims.height }} mm</span>
              </button>
            </div>
          </div>

          <div>
            <p class="label">{{ t('products.labels.preview') }}</p>
            <div class="flex justify-center overflow-hidden rounded-lg bg-gray-100 pt-1" :style="previewBox">
              <iframe v-if="preview" :srcdoc="preview" :style="previewStyle" class="box-content border border-gray-300 bg-white" :title="t('products.labels.preview')" />
            </div>
            <p class="mt-1 text-xs text-gray-500">{{ t('products.labels.hint') }}</p>
          </div>

          <div class="divide-y rounded-lg border">
            <div v-for="p in products" :key="p.id" class="flex items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-gray-900">{{ p.name }}</p>
                <p class="font-mono text-xs text-gray-500">{{ p.barcode ? formatBarcodeText(p.barcode) : t('products.labels.noBarcode') }}</p>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" class="flex h-7 w-7 items-center justify-center rounded border hover:bg-gray-50" :aria-label="t('products.labels.fewer')" @click="setCopies(p.id, (copies[p.id] || 0) - 1)"><MinusIcon class="h-3.5 w-3.5" /></button>
                <input :value="copies[p.id]" type="number" min="0" max="500" class="input h-7 w-14 px-1 text-center text-sm" :aria-label="t('products.labels.copies')" @input="setCopies(p.id, $event.target.value)" />
                <button type="button" class="flex h-7 w-7 items-center justify-center rounded border hover:bg-gray-50" :aria-label="t('products.labels.more')" @click="setCopies(p.id, (copies[p.id] || 0) + 1)"><PlusIcon class="h-3.5 w-3.5" /></button>
                <button
                  v-if="p.stockQuantity > 0"
                  type="button"
                  class="ms-1 rounded px-1.5 py-1 text-xs text-primary-600 hover:bg-primary-50"
                  :title="t('products.labels.oneEachInStock')"
                  @click="setCopies(p.id, p.stockQuantity)"
                >
                  = {{ t('products.labels.stockShort', { n: p.stockQuantity }) }}
                </button>
              </div>
            </div>
          </div>
          <p v-if="missing.length" class="text-xs text-amber-700">{{ t('products.labels.missing', { n: missing.length }) }}</p>
        </div>

        <div class="flex items-center justify-between gap-3 border-t bg-gray-50 p-4">
          <button v-if="products.length === 1" class="btn-secondary inline-flex items-center gap-2" @click="copyBarcode">
            <ClipboardDocumentIcon class="h-5 w-5" /> {{ copied ? t('common.copied') : t('products.copyBarcode') }}
          </button>
          <span v-else class="text-sm text-gray-600">{{ t('products.labels.count', { n: totalLabels }) }}</span>
          <button class="btn-primary inline-flex items-center gap-2" :disabled="!totalLabels || printing" @click="print">
            <PrinterIcon class="h-5 w-5" /> {{ t('products.labels.print', { n: totalLabels }) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

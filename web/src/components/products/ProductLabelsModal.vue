<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ClipboardDocumentIcon, Cog6ToothIcon, MinusIcon, PlusIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { DEFAULT_PRODUCT_LABEL, labelTemplatesApi } from '@/api/labelTemplates';
import { formatBarcodeText } from '@/utils/barcode';
import { layoutKey, normalizeLayout, printLabels, productLabel, labelContext } from '@/utils/labelRenderer';
import BarcodeView from '@/components/ui/BarcodeView.vue';
import LabelPreview from '@/components/ui/LabelPreview.vue';

/**
 * Product barcode stickers (name, selling price, barcode), for one product or a selection. Size, margins and
 * layout come from each product's category template in Settings > Label templates; there is no second setting here.
 */
const props = defineProps({ isOpen: Boolean, products: { type: Array, default: () => [] } });
const emit = defineEmits(['close']);
const { t } = useI18n();

const copies = ref({});
const templates = ref({}); // categoryId -> template
const loading = ref(false);
const keyOf = (p) => p.categoryId || p.category?.id || '';

watch(
  () => [props.isOpen, props.products],
  async () => {
    if (!props.isOpen) return;
    copies.value = Object.fromEntries(props.products.map((p) => [p.id, 1]));
    loading.value = true;
    try {
      const ids = [...new Set(props.products.map(keyOf))];
      const entries = await Promise.all(ids.map(async (id) => [id, id ? await labelTemplatesApi.getByCategory(id).catch(() => ({ ...DEFAULT_PRODUCT_LABEL })) : { ...DEFAULT_PRODUCT_LABEL }]));
      templates.value = Object.fromEntries(entries);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
const setCopies = (id, n) => (copies.value[id] = Math.max(0, Math.min(500, Math.floor(Number(n) || 0))));
const totalLabels = computed(() => props.products.reduce((s, p) => s + (copies.value[p.id] || 0), 0));

const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const ctx = computed(() => labelContext(settings.value));
const tplOf = (p) => templates.value[keyOf(p)] || DEFAULT_PRODUCT_LABEL;

const first = computed(() => props.products.find((p) => p.barcode));
const previewLayout = computed(() => (first.value ? normalizeLayout(tplOf(first.value)) : null));
const previewLabel = computed(() => (first.value ? productLabel(first.value, tplOf(first.value), ctx.value) : null));
const sizeText = (p) => {
  const l = normalizeLayout(tplOf(p));
  return `${l.width} × ${l.height} mm`;
};

const missing = computed(() => props.products.filter((p) => !p.barcode));
function print() {
  // One print job; products whose category templates differ are grouped by layout.
  const groups = new Map();
  for (const p of props.products) {
    const n = copies.value[p.id] || 0;
    if (!n || !p.barcode) continue;
    const layout = normalizeLayout(tplOf(p));
    const key = layoutKey(layout);
    if (!groups.has(key)) groups.set(key, { layout, labels: [] });
    const label = productLabel(p, tplOf(p), ctx.value);
    for (let i = 0; i < n; i++) groups.get(key).labels.push(label);
  }
  if (groups.size) printLabels([...groups.values()], { title: t('products.labels.title') });
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
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-medium text-gray-700">{{ t('products.labels.preview') }}</span>
              <RouterLink :to="{ name: 'label-templates' }" class="inline-flex items-center gap-1 text-primary-600 hover:underline" @click="emit('close')">
                <Cog6ToothIcon class="h-4 w-4" /> {{ t('labelTemplates.editTemplate') }}
              </RouterLink>
            </div>
            <LabelPreview v-if="previewLabel && !loading" :layout="previewLayout" :labels="[previewLabel]" :fill="false" :title="t('products.labels.preview')" />
            <p v-else class="text-sm text-gray-500">{{ t('common.loading') }}</p>
            <p v-if="previewLayout" class="mt-1 text-xs text-gray-500">
              {{ t('labelTemplates.usingTemplate', { size: $ltr(`${previewLayout.width} × ${previewLayout.height} mm`), paper: t(`labelTemplates.layout.paper_${previewLayout.paper}`) }) }}
            </p>
          </div>

          <div class="divide-y rounded-lg border">
            <div v-for="p in products" :key="p.id" class="flex items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-gray-900">{{ p.name }}</p>
                <p class="font-mono text-xs text-gray-500">
                  {{ p.barcode ? formatBarcodeText(p.barcode) : t('products.labels.noBarcode') }}
                  <span v-if="p.barcode && !loading" class="ms-1 font-sans text-gray-400">· {{ $ltr(sizeText(p)) }}</span>
                </p>
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
          <button class="btn-primary inline-flex items-center gap-2" :disabled="!totalLabels || loading" @click="print">
            <PrinterIcon class="h-5 w-5" /> {{ t('products.labels.print', { n: totalLabels }) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

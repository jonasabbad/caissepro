<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ClipboardDocumentIcon, Cog6ToothIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { formatImei, soldUnitsApi } from '@/api/soldUnits';
import { labelTemplatesApi } from '@/api/labelTemplates';
import { deviceLabel, labelContext, normalizeLayout, printLabels } from '@/utils/labelRenderer';
import { formatCurrency } from '@/utils/format';
import LabelPreview from '@/components/ui/LabelPreview.vue';
import { conditionBadge } from '@/utils/soldUnitDisplay';

/**
 * Phone sticker. The template comes from Settings > Label templates (the brand / device-type variant when one
 * matches, otherwise the default device template); the preview and the print use the same renderer and settings.
 */
const props = defineProps({ isOpen: Boolean, unit: { type: Object, default: null } });
const emit = defineEmits(['close']);
const { t } = useI18n();

const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const ctx = computed(() => labelContext(settings.value));

const tpl = ref(null);
const loadError = ref(false);
watch(
  () => [props.isOpen, props.unit?.id],
  async () => {
    if (!props.isOpen || !props.unit) return;
    tpl.value = null;
    loadError.value = false;
    try {
      tpl.value = await labelTemplatesApi.getForSoldUnit(props.unit.brand, props.unit.deviceType);
    } catch {
      loadError.value = true;
    }
  },
  { immediate: true },
);
const layout = computed(() => (tpl.value ? normalizeLayout(tpl.value) : null));
const label = computed(() => (tpl.value && props.unit ? deviceLabel(props.unit, tpl.value, ctx.value) : null));
const copies = ref(1);
watch(
  () => props.isOpen,
  (o) => o && (copies.value = 1),
);
function print() {
  if (!label.value) return;
  const n = Math.max(1, Math.min(200, Math.floor(copies.value) || 1));
  printLabels([{ layout: layout.value, labels: Array(n).fill(label.value) }], { title: t('soldUnits.printLabel') });
}

const code = computed(() => (props.unit ? soldUnitsApi.labelCode(props.unit) : ''));
const identifier = computed(() => (props.unit ? (props.unit.imei ? formatImei(props.unit.imei) : props.unit.serialNumber || '-') : '-'));
const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.unit?.imei || props.unit?.serialNumber || code.value);
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
      <div class="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b p-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('soldUnits.barcodeLabel') }}</h3>
          <button class="rounded-lg p-2 hover:bg-gray-100" :aria-label="t('common.close')" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div v-if="unit" class="space-y-4 overflow-y-auto p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-bold text-gray-900">{{ unit.brand }} {{ unit.model }}</h4>
              <p class="text-sm text-gray-500">{{ [unit.storage, unit.color].filter(Boolean).join(' - ') }}</p>
              <p class="mt-1 font-mono text-sm text-gray-600">{{ unit.imei ? 'IMEI' : t('soldUnits.serialNumber') }} {{ identifier }}</p>
            </div>
            <div class="text-end">
              <span :class="['rounded-full px-3 py-1 text-xs font-medium', conditionBadge(unit.condition)]">{{ t(`soldUnits.conditions.${unit.condition}`) }}</span>
              <p class="mt-1 text-lg font-bold text-black">{{ formatCurrency(unit.salePrice) }}</p>
            </div>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between text-sm">
              <span class="font-medium text-gray-700">{{ t('labelTemplates.livePreview') }}</span>
              <RouterLink :to="{ name: 'label-templates' }" class="inline-flex items-center gap-1 text-primary-600 hover:underline" @click="emit('close')">
                <Cog6ToothIcon class="h-4 w-4" /> {{ t('labelTemplates.editTemplate') }}
              </RouterLink>
            </div>
            <LabelPreview v-if="label" :layout="layout" :labels="[label]" :fill="false" :title="t('labelTemplates.livePreview')" />
            <p v-else-if="loadError" class="text-sm text-danger-600">{{ t('common.genericError') }}</p>
            <p v-else class="text-sm text-gray-500">{{ t('common.loading') }}</p>
            <p v-if="layout" class="mt-1 text-xs text-gray-500">
              {{ t('labelTemplates.usingTemplate', { size: $ltr(`${layout.width} × ${layout.height} mm`), paper: t(`labelTemplates.layout.paper_${layout.paper}`) }) }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-700" for="unit-copies">{{ t('products.labels.copies') }}</label>
            <input id="unit-copies" v-model.number="copies" type="number" min="1" max="200" class="input w-20 py-1.5 text-center text-sm" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-3 border-t bg-gray-50 p-4">
          <button class="btn-secondary inline-flex items-center gap-2" @click="copy">
            <ClipboardDocumentIcon class="h-5 w-5" /> {{ copied ? t('common.copied') : t('soldUnits.copyImei') }}
          </button>
          <button class="btn-primary inline-flex items-center gap-2" :disabled="!label" @click="print"><PrinterIcon class="h-5 w-5" /> {{ t('soldUnits.printLabel') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

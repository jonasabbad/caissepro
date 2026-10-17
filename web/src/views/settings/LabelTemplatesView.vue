<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { ComputerDesktopIcon, DevicePhoneMobileIcon, DeviceTabletIcon, PlusIcon, TagIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { categoriesApi } from '@/api/products';
import { deviceCatalogApi } from '@/api/deviceCatalog';
import { labelTemplatesApi, SOLD_UNITS_KEY } from '@/api/labelTemplates';
import { useActivity } from '@/composables/useActivity';
import { useAuthStore } from '@/stores/auth';
import Toast from '@/components/ui/Toast.vue';
import { currentLocale } from '@/i18n';
import { barcodeSvg, formatBarcodeText } from '@/utils/barcode';
import { LABEL_SIZES, labelsDocument } from '@/utils/printFrame';

const { t } = useI18n();
const auth = useAuthStore();
const queryClient = useQueryClient();
const { activityType } = useActivity();
const isPhoneSeller = computed(() => activityType.value === 'phone_seller');
const toast = ref({ show: false, message: '', type: 'success' });
const ok = (message) => (toast.value = { show: true, message, type: 'success' });
const fail = (message) => (toast.value = { show: true, message, type: 'error' });
const storeName = computed(() => auth.storeName || t('common.myStore'));

// Device categories are handled by the per-device template, not as product categories.
const DEVICE_SLUGS = ['smartphones', 'tablettes', 'pc-portables', 'macbooks'];
const { data: allCategories, isLoading, isError, refetch } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });
const categories = computed(() => (allCategories.value || []).filter((c) => !isPhoneSeller.value || !DEVICE_SLUGS.includes(c.slug || '')));

const selected = ref(null); // category id or SOLD_UNITS_KEY
const isUnits = computed(() => selected.value === SOLD_UNITS_KEY);
const selectedCategory = computed(() => (!selected.value || isUnits.value ? null : categories.value.find((c) => c.id === selected.value) || null));
const fields = ref({});
const saving = ref(false);
const loadingTpl = ref(false);

function applyTemplate(tpl, isDevice) {
  fields.value = {
    includeQr: tpl.includeQr ?? true,
    includeName: tpl.includeName ?? true,
    includeImei: tpl.includeImei ?? isDevice,
    includePrice: tpl.includePrice ?? true,
    includeCondition: tpl.includeCondition ?? isDevice,
    includeSpecs: tpl.includeSpecs ?? isDevice,
    includeStorage: tpl.includeStorage ?? tpl.includeSpecs ?? isDevice,
    includeColor: tpl.includeColor ?? tpl.includeSpecs ?? isDevice,
    includeBatteryHealth: tpl.includeBatteryHealth ?? false,
    hideBrand: tpl.hideBrand ?? false,
    includeCompany: tpl.includeCompany ?? true,
    includeBarcode: tpl.includeBarcode ?? !isDevice,
  };
}
async function load(key) {
  loadingTpl.value = true;
  try {
    applyTemplate(key === SOLD_UNITS_KEY ? await labelTemplatesApi.getForSoldUnits() : await labelTemplatesApi.getByCategory(key), key === SOLD_UNITS_KEY);
  } finally {
    loadingTpl.value = false;
  }
}

// ── Device variants (per brand and/or device type) ──
const { data: variants, refetch: refetchVariants } = useQuery({ queryKey: ['label-template-variants'], queryFn: () => labelTemplatesApi.listSoldUnitVariants(), enabled: isPhoneSeller });
const { data: catalogBrands } = useQuery({
  queryKey: ['device-catalog-brands-all'],
  queryFn: async () => {
    const lists = await Promise.all(['phone', 'tablet', 'laptop', 'macbook'].map((d) => deviceCatalogApi.getBrands(d)));
    const m = new Map();
    for (const l of lists) for (const b of l) m.set(b.name.toLowerCase(), b.name);
    return [...m.values()].sort();
  },
  enabled: isPhoneSeller,
});
const TOP_BRANDS = ['Apple', 'Samsung', 'Google', 'Xiaomi', 'Huawei', 'Honor'];
const brandChoices = computed(() => {
  const seen = new Set(TOP_BRANDS.map((b) => b.toLowerCase()));
  return [...TOP_BRANDS, ...(catalogBrands.value || []).filter((b) => !seen.has(b.toLowerCase()))];
});
const DEVICE_TYPES = [
  { value: 'phone', icon: DevicePhoneMobileIcon },
  { value: 'tablet', icon: DeviceTabletIcon },
  { value: 'laptop', icon: ComputerDesktopIcon },
  { value: 'macbook', icon: ComputerDesktopIcon },
];
const PRESETS = [
  { brand: 'Apple', deviceType: 'phone', key: 'iphone', icon: DevicePhoneMobileIcon },
  { brand: 'Samsung', deviceType: 'phone', key: 'galaxy', icon: DevicePhoneMobileIcon },
  { brand: 'Google', deviceType: 'phone', key: 'pixel', icon: DevicePhoneMobileIcon },
  { brand: 'Apple', deviceType: 'tablet', key: 'ipad', icon: DeviceTabletIcon },
  { brand: 'Apple', deviceType: 'macbook', key: 'macbook', icon: ComputerDesktopIcon },
];
const typeLabel = (type) => (type ? t(`tradeIn.${type}`) : t('labelTemplates.anyDevice'));
const scopeLabel = (v) => [v.brand, v.deviceType && typeLabel(v.deviceType)].filter(Boolean).join(' • ') || t('labelTemplates.globalFallback');
const variantIcon = (v) => (v.deviceType === 'tablet' ? DeviceTabletIcon : v.deviceType === 'laptop' || v.deviceType === 'macbook' ? ComputerDesktopIcon : DevicePhoneMobileIcon);
const editingVariantId = ref(null);
const creatingVariant = ref(false);
const draftBrand = ref('');
const draftType = ref('');
const editingVariant = computed(() => (editingVariantId.value && !creatingVariant.value ? (variants.value || []).find((v) => v.id === editingVariantId.value) || null : null));
const appliesTo = computed(() => {
  const b = draftBrand.value.trim();
  const ty = draftType.value;
  if (!b && !ty) return '';
  if (b && ty) return t('labelTemplates.appliesToBrandAndType', { brand: b, type: typeLabel(ty) });
  return b ? t('labelTemplates.appliesToBrandOnly', { brand: b }) : t('labelTemplates.appliesToTypeOnly', { type: typeLabel(ty) });
});
const presetExists = (p) => (variants.value || []).some((v) => (v.brand || '').toLowerCase() === p.brand.toLowerCase() && v.deviceType === p.deviceType);

function select(key) {
  selected.value = key;
  editingVariantId.value = null;
  creatingVariant.value = false;
  load(key);
}
function editVariant(v) {
  selected.value = SOLD_UNITS_KEY;
  editingVariantId.value = v.id;
  creatingVariant.value = false;
  applyTemplate(v, true);
}
async function startVariant(preset) {
  selected.value = SOLD_UNITS_KEY;
  editingVariantId.value = null;
  creatingVariant.value = true;
  draftBrand.value = preset?.brand || '';
  draftType.value = preset?.deviceType || '';
  await load(SOLD_UNITS_KEY);
}
async function usePreset(p) {
  const existing = (variants.value || []).find((v) => (v.brand || '').toLowerCase() === p.brand.toLowerCase() && v.deviceType === p.deviceType);
  if (existing) editVariant(existing);
  else await startVariant(p);
}
function cancelVariant() {
  creatingVariant.value = false;
  draftBrand.value = '';
  draftType.value = '';
  select(SOLD_UNITS_KEY);
}

async function saveVariant() {
  let brand;
  let deviceType;
  if (creatingVariant.value) {
    brand = draftBrand.value.trim() || null;
    deviceType = draftType.value || null;
    if (!brand && !deviceType) return fail(t('labelTemplates.variantScopeRequired'));
  } else if (editingVariant.value) {
    brand = editingVariant.value.brand ?? null;
    deviceType = editingVariant.value.deviceType ?? null;
  } else return;
  saving.value = true;
  try {
    const saved = await labelTemplatesApi.saveSoldUnitVariant({ brand, deviceType, ...fields.value });
    await refetchVariants();
    queryClient.invalidateQueries({ queryKey: ['label-template-variants'] });
    creatingVariant.value = false;
    if (saved?.id) editingVariantId.value = saved.id;
    ok(t('labelTemplates.variantSaved'));
  } catch {
    fail(t('common.error'));
  } finally {
    saving.value = false;
  }
}
async function deleteVariant(v) {
  if (!v.id || !window.confirm(t('labelTemplates.confirmDeleteVariant', { name: scopeLabel(v) }))) return;
  try {
    await labelTemplatesApi.deleteSoldUnitVariant(v.id);
    if (editingVariantId.value === v.id) select(SOLD_UNITS_KEY);
    await refetchVariants();
    ok(t('labelTemplates.variantDeleted'));
  } catch {
    fail(t('common.error'));
  }
}

async function save() {
  if (!selected.value) return;
  if (isUnits.value && (creatingVariant.value || editingVariant.value)) return saveVariant();
  saving.value = true;
  try {
    if (isUnits.value) await labelTemplatesApi.saveForSoldUnits(fields.value);
    else await labelTemplatesApi.save({ categoryId: selected.value, ...fields.value });
    ok(t('labelTemplates.saveSuccess'));
  } catch {
    fail(t('common.error'));
  } finally {
    saving.value = false;
  }
}
async function reset() {
  if (!selected.value) return;
  const tpl = await labelTemplatesApi.resetToDefault(selected.value);
  applyTemplate(tpl, isUnits.value);
  ok(t('labelTemplates.resetSuccess'));
}

// Apply the current configuration to other categories.
const showApply = ref(false);
const chosen = ref(new Set());
const allChosen = computed(() => categories.value.length > 0 && categories.value.every((c) => chosen.value.has(c.id)));
function toggleAll() {
  if (allChosen.value) chosen.value = new Set();
  else chosen.value = new Set(categories.value.map((c) => c.id));
}
function toggle(id) {
  const s = new Set(chosen.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  chosen.value = s;
}
async function applySelected() {
  if (!chosen.value.size) return fail(t('labelTemplates.selectAtLeastOne'));
  saving.value = true;
  try {
    await Promise.all([...chosen.value].map((id) => labelTemplatesApi.save({ categoryId: id, ...fields.value })));
    ok(t('labelTemplates.savedToCategories', { count: chosen.value.size }));
    showApply.value = false;
    chosen.value = new Set();
  } catch {
    fail(t('common.error'));
  } finally {
    saving.value = false;
  }
}
async function applyAll() {
  saving.value = true;
  try {
    const jobs = categories.value.map((c) => labelTemplatesApi.save({ categoryId: c.id, ...fields.value }));
    if (isPhoneSeller.value) jobs.push(labelTemplatesApi.saveForSoldUnits(fields.value));
    await Promise.all(jobs);
    ok(t('labelTemplates.savedToAll'));
    showApply.value = false;
  } catch {
    fail(t('common.error'));
  } finally {
    saving.value = false;
  }
}

// ── Field list and live preview ──
const FIELDS = computed(() => [
  { key: 'includeName', label: isUnits.value ? t('labelTemplates.deviceName') : t('labelTemplates.productName') },
  ...(isUnits.value
    ? [
        { key: 'hideBrand', label: t('labelTemplates.hideBrand'), hint: t('labelTemplates.hideBrandHint') },
        { key: 'includeImei', label: t('labelTemplates.imeiSerial'), hint: t('labelTemplates.imeiSerialHint') },
        { key: 'includeStorage', label: t('labelTemplates.storage') },
        { key: 'includeColor', label: t('labelTemplates.color') },
        { key: 'includeBatteryHealth', label: t('labelTemplates.batteryHealth') },
        { key: 'includeCondition', label: t('labelTemplates.condition'), hint: t('labelTemplates.conditionHint') },
      ]
    : []),
  { key: 'includePrice', label: t('labelTemplates.price') },
  { key: 'includeCompany', label: t('labelTemplates.companyName') },
]);
const sampleName = computed(() => (isUnits.value ? (fields.value.hideBrand ? '15 Pro Max' : 'iPhone 15 Pro Max') : 'Coque silicone'));
const samplePrice = computed(() => (isUnits.value ? '15 500 DH' : '49 DH'));
// Preview built with the same renderer as printing: products on compact labels, devices on standard ones.
// The barcode is always printed (it identifies the item); QR codes are only used for repairs.
const previewDims = computed(() => (isUnits.value ? LABEL_SIZES.standard : LABEL_SIZES.compact));
const previewHtml = computed(() => {
  const f = fields.value;
  const code = isUnits.value ? '353456789012345' : '2001234567893';
  const details = isUnits.value
    ? [[f.includeStorage && '256 GB', f.includeColor && 'Noir'].filter(Boolean).join(' - '), f.includeCondition && t('soldUnits.conditions.new'), f.includeBatteryHealth && '100%'].filter(Boolean).join(' · ')
    : '';
  return labelsDocument(
    [
      {
        lines: [
          f.includeName && { text: sampleName.value, size: isUnits.value ? 8.5 : 7.5, bold: isUnits.value },
          details && { text: details, size: 7, bold: false },
          f.includePrice && { text: samplePrice.value, size: isUnits.value ? 9.5 : 10 },
        ],
        barcodeSvg: barcodeSvg(code),
        barcodeText: !isUnits.value || f.includeImei ? formatBarcodeText(code) : '',
        footer: f.includeCompany ? storeName.value : '',
      },
    ],
    { ...previewDims.value, lang: currentLocale() },
  );
});

watch(
  categories,
  (list) => {
    if (selected.value) return;
    if (isPhoneSeller.value) select(SOLD_UNITS_KEY);
    else if (list?.length) select(list[0].id);
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('labelTemplates.title') }}</h1>
      <p class="text-gray-500 mt-1">{{ t('labelTemplates.subtitle') }}</p>
    </div>

    <div v-if="isLoading" class="card p-12 text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      <p class="text-gray-500 mt-2">{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="isError" class="card p-12 text-center">
      <h3 class="font-medium text-gray-900">{{ t('common.error') }}</h3>
      <button class="btn-primary mt-4" @click="refetch()">{{ t('common.retry') }}</button>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: what to configure -->
      <div class="card p-4 space-y-2 h-fit">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{{ t('labelTemplates.configureByCategory') }}</h2>
        <template v-if="isPhoneSeller">
          <button
            :class="[
              'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-start',
              isUnits && !editingVariant && !creatingVariant ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            ]"
            @click="select(SOLD_UNITS_KEY)"
          >
            <DevicePhoneMobileIcon :class="['w-5 h-5 shrink-0', isUnits ? 'text-primary-600' : 'text-gray-400']" />
            <div class="min-w-0">
              <span class="font-medium text-sm text-gray-900">{{ t('nav.soldUnits') }}</span>
              <p class="text-xs text-gray-500">{{ t('labelTemplates.devicesLabel') }}</p>
            </div>
          </button>
          <div v-if="isUnits || variants?.length" class="ps-4 space-y-1.5">
            <div
              v-for="v in variants || []"
              :key="v.id"
              :class="[
                'group flex items-stretch rounded-lg border overflow-hidden',
                editingVariantId === v.id ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50',
              ]"
            >
              <button class="flex-1 flex items-center gap-2.5 p-2.5 text-start min-w-0" @click="editVariant(v)">
                <component :is="variantIcon(v)" :class="['w-4 h-4 shrink-0', editingVariantId === v.id ? 'text-primary-600' : 'text-stone-400']" />
                <div class="min-w-0">
                  <div class="text-xs font-semibold truncate">{{ v.brand || t('labelTemplates.allBrands') }}</div>
                  <div class="text-xs text-stone-500 truncate">{{ v.deviceType ? typeLabel(v.deviceType) : t('labelTemplates.anyDevice') }}</div>
                </div>
              </button>
              <button class="px-2 text-stone-400 hover:text-red-500 sm:opacity-0 group-hover:opacity-100" :title="t('labelTemplates.deleteVariant')" @click.stop="deleteVariant(v)">
                <TrashIcon class="w-4 h-4" />
              </button>
            </div>
            <p v-if="isUnits && !variants?.length" class="text-xs text-stone-500 px-1">{{ t('labelTemplates.noVariantsHint') }}</p>
            <button
              v-if="isUnits"
              :class="[
                'w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed text-start text-sm',
                creatingVariant ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-300 text-stone-600 hover:border-stone-400 hover:bg-stone-50',
              ]"
              @click="startVariant()"
            >
              <PlusIcon class="w-4 h-4" /> {{ t('labelTemplates.addVariant') }}
            </button>
          </div>
          <div v-if="categories.length" class="border-t border-gray-100 my-2" />
        </template>
        <button
          v-for="c in categories"
          :key="c.id"
          :class="['w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-start', selected === c.id ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50']"
          @click="select(c.id)"
        >
          <TagIcon :class="['w-5 h-5 shrink-0', selected === c.id ? 'text-primary-600' : 'text-gray-400']" />
          <span class="font-medium text-sm text-gray-900">{{ c.name }}</span>
        </button>
        <p v-if="!categories.length" class="text-sm text-gray-500 p-2">{{ t('labelTemplates.noCategoriesHint') }}</p>
      </div>

      <!-- Right: fields and preview -->
      <div class="lg:col-span-2 space-y-6">
        <div v-if="!selected" class="card p-12 text-center text-gray-500">{{ t('labelTemplates.selectCategoryPrompt') }}</div>
        <template v-else>
          <div class="card p-6 space-y-5">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">
                {{ t('labelTemplates.configureFor') }}
                <span class="text-primary-600">
                  {{ creatingVariant ? t('labelTemplates.newVariant') : editingVariant ? scopeLabel(editingVariant) : isUnits ? t('nav.soldUnits') : selectedCategory?.name }}
                </span>
              </h2>
              <p class="text-sm text-gray-500 mt-1">
                <template v-if="isUnits && !creatingVariant && !editingVariant">{{ t('labelTemplates.globalFallbackHint') }}</template>
                <template v-else-if="editingVariant">{{ t('labelTemplates.editingVariantHint', { scope: scopeLabel(editingVariant) }) }}</template>
                <template v-else>{{ t('labelTemplates.selectFieldsToShow') }}</template>
              </p>
            </div>

            <div v-if="isUnits && !creatingVariant && !editingVariant" class="rounded-lg border border-stone-200 p-4">
              <p class="text-sm font-medium text-gray-900">{{ t('labelTemplates.quickPresets') }}</p>
              <p class="text-xs text-gray-500 mb-3">{{ t('labelTemplates.quickPresetsHint') }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in PRESETS"
                  :key="p.key"
                  :class="['inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm', presetExists(p) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-stone-200 hover:border-stone-300']"
                  :title="presetExists(p) ? t('labelTemplates.presetExists') : ''"
                  @click="usePreset(p)"
                >
                  <component :is="p.icon" class="w-4 h-4" /> {{ t(`labelTemplates.presets.${p.key}`) }}
                </button>
              </div>
            </div>

            <div v-if="creatingVariant" class="space-y-4 rounded-lg border border-primary-200 bg-primary-50/40 p-4">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-medium text-gray-700">{{ t('labelTemplates.variantBrand') }}</label>
                  <button v-if="draftBrand" class="text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1" @click="draftBrand = ''">
                    <XMarkIcon class="w-3.5 h-3.5" /> {{ t('labelTemplates.clearBrand') }}
                  </button>
                </div>
                <div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  <button
                    v-for="b in brandChoices"
                    :key="b"
                    type="button"
                    :class="[
                      'px-3 py-1.5 rounded-lg border text-sm font-medium',
                      draftBrand.toLowerCase() === b.toLowerCase() ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                    ]"
                    @click="draftBrand = b"
                  >
                    {{ b }}
                  </button>
                </div>
              </div>
              <div>
                <label class="text-sm font-medium text-gray-700">{{ t('labelTemplates.variantDeviceType') }}</label>
                <p class="text-xs text-gray-500 mb-2">{{ t('labelTemplates.deviceTypeOptional') }}</p>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="d in DEVICE_TYPES"
                    :key="d.value"
                    type="button"
                    :class="['flex flex-col items-center gap-1.5 p-3 rounded-lg border text-sm', draftType === d.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 bg-white hover:border-stone-300']"
                    @click="draftType = draftType === d.value ? '' : d.value"
                  >
                    <component :is="d.icon" class="w-5 h-5" /> {{ typeLabel(d.value) }}
                  </button>
                </div>
              </div>
              <p class="text-sm text-primary-700">{{ appliesTo || t('labelTemplates.pickScopeHint') }}</p>
            </div>

            <div v-if="loadingTpl" class="text-sm text-gray-500">{{ t('common.loading') }}</div>
            <div v-else class="space-y-2">
              <label v-for="f in FIELDS" :key="f.key" class="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                <input v-model="fields[f.key]" type="checkbox" class="mt-0.5 rounded" />
                <span>
                  <span class="text-sm font-medium text-gray-900">{{ f.label }}</span>
                  <span v-if="f.hint" class="block text-xs text-gray-500">{{ f.hint }}</span>
                </span>
              </label>
            </div>

            <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <button class="btn-primary" :disabled="saving" @click="save">{{ creatingVariant ? t('labelTemplates.createVariant') : t('common.save') }}</button>
              <button v-if="creatingVariant" class="btn-secondary" @click="cancelVariant">{{ t('common.cancel') }}</button>
              <template v-else-if="!editingVariant">
                <button class="btn-secondary" @click="showApply = !showApply">{{ t('labelTemplates.applyToOthers') }}</button>
                <button class="btn-ghost" @click="reset">{{ t('labelTemplates.resetToDefault') }}</button>
              </template>
            </div>

            <div v-if="showApply" class="rounded-lg border border-gray-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-gray-900">{{ t('labelTemplates.applyTo') }}</p>
                  <p class="text-xs text-gray-500">{{ t('labelTemplates.selectCategoriesToApply') }}</p>
                </div>
                <button class="text-sm text-primary-600" @click="toggleAll">{{ allChosen ? t('labelTemplates.deselectAll') : t('labelTemplates.selectAll') }}</button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label v-for="c in categories" :key="c.id" class="flex items-center gap-2 text-sm"><input type="checkbox" :checked="chosen.has(c.id)" class="rounded" @change="toggle(c.id)" /> {{ c.name }}</label>
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="btn-primary" :disabled="saving || !chosen.size" @click="applySelected">{{ t('labelTemplates.applyToSelected', { count: chosen.size }) }}</button>
                <button class="btn-secondary" :disabled="saving" @click="applyAll">{{ t('labelTemplates.applyToAll') }}</button>
              </div>
            </div>
          </div>

          <div class="card p-6">
            <h3 class="font-semibold text-gray-900 mb-1">{{ t('labelTemplates.livePreview') }}</h3>
            <p class="text-xs text-gray-500 mb-4">{{ t('labelTemplates.previewNote', { size: $ltr(`${previewDims.width} × ${previewDims.height} mm`) }) }}</p>
            <div class="flex justify-center overflow-hidden rounded bg-gray-100 py-2" :style="{ height: `calc(${previewDims.height}mm * 2 + 16px)` }">
              <iframe
                :srcdoc="previewHtml"
                :title="t('labelTemplates.livePreview')"
                class="box-content border-2 border-dashed border-gray-300 bg-white"
                :style="{ width: `${previewDims.width}mm`, height: `${previewDims.height}mm`, transform: 'scale(2)', transformOrigin: 'top center' }"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>

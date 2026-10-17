<script setup>
import { intlLocale, ltr } from '@/i18n';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ClipboardDocumentIcon, PrinterIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { soldUnitsApi, formatImei } from '@/api/soldUnits';
import { labelTemplatesApi, DEFAULT_UNIT_LABEL } from '@/api/labelTemplates';
import { LABEL_SIZES, labelsDocument, printHtmlDocument, truncate } from '@/utils/printFrame';
import { currentLocale } from '@/i18n';
import { barcodeSvg } from '@/utils/barcode';
import BarcodeView from '@/components/ui/BarcodeView.vue';
import { conditionBadge } from '@/utils/soldUnitDisplay';

const props = defineProps({ isOpen: Boolean, unit: { type: Object, default: null } });
const emit = defineEmits(['close']);
const { t } = useI18n();

const copied = ref(false);
const code = computed(() => (props.unit ? soldUnitsApi.labelCode(props.unit) : ''));

const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const storeName = computed(() => settings.value?.storeName || settings.value?.tenantName || '');
const printing = computed(() => settings.value?.printing || {});

// Brand display options for labels (Settings > Impression).
const ABBREVIATIONS = {
  'Apple iPhone': 'IP',
  'Samsung Galaxy': 'SG',
  'Xiaomi Redmi': 'XR',
  'Xiaomi Poco': 'XP',
  Huawei: 'HW',
  Oppo: 'OP',
  Vivo: 'VV',
  Realme: 'RM',
  OnePlus: '1+',
  'Google Pixel': 'GP',
  Honor: 'HN',
  'Nothing Phone': 'NP',
};
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Google', 'Nothing', 'Huawei', 'Oppo', 'Vivo', 'Realme', 'OnePlus', 'Honor'];

function labelName(name) {
  const p = printing.value;
  if (p.showBrand === false) {
    for (const k of Object.keys(ABBREVIATIONS)) if (name.startsWith(k + ' ')) return name.replace(k + ' ', '');
    const words = name.split(' ');
    if (words.length > 1) {
      if (ABBREVIATIONS[words.slice(0, 2).join(' ')]) return words.slice(2).join(' ');
      if (BRANDS.includes(words[0])) return words.slice(1).join(' ');
    }
    return name;
  }
  if (p.simplifyBrand) {
    for (const b of BRANDS) if (name.startsWith(b + ' ')) return name.replace(b + ' ', '');
    return name;
  }
  if (p.shortenBrandNames) {
    for (const [full, short] of Object.entries(p.brandAbbreviations || ABBREVIATIONS)) if (name.startsWith(full)) return name.replace(full, short);
  }
  return name;
}


const identifier = computed(() => (props.unit ? (props.unit.imei ? formatImei(props.unit.imei) : props.unit.serialNumber || '-') : '-'));
const identifierLabel = computed(() => (props.unit ? (props.unit.imei ? 'IMEI' : t('soldUnits.serialNumber')) : 'ID'));
const priceText = computed(() =>
  ltr(props.unit ? new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(props.unit.salePrice) + ' DH' : '0 DH'),
);

async function copy() {
  const v = props.unit?.imei || props.unit?.serialNumber || '';
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}

async function printLabel() {
  const u = props.unit;
  if (!u) return;
  let tpl;
  try {
    tpl = await labelTemplatesApi.getForSoldUnit(u.brand, u.deviceType);
  } catch {
    tpl = { ...DEFAULT_UNIT_LABEL, includeSpecs: true };
  }
  const specs = [];
  if ((tpl.includeStorage ?? tpl.includeSpecs) && u.storage) specs.push(u.storage);
  if ((tpl.includeColor ?? tpl.includeSpecs) && u.color) specs.push(u.color);
  // Name, specs and price on top, then the barcode (IMEI or device reference) with its digits.
  const details = [
    specs.join(' - '),
    tpl.includeCondition && u.condition ? t(`soldUnits.conditions.${u.condition}`) : '',
    tpl.includeBatteryHealth && u.batteryHealth ? `${u.batteryHealth}%` : '',
  ].filter(Boolean);
  printHtmlDocument(
    labelsDocument(
      [
        {
          lines: [
            tpl.includeName && { text: truncate(labelName(`${u.brand} ${u.model}`), 26), size: 8.5 },
            details.length && { text: details.join(' · '), size: 7, bold: false },
            tpl.includePrice && { text: priceText.value, size: 9.5 },
          ],
          barcodeSvg: barcodeSvg(code.value),
          barcodeText: tpl.includeImei !== false ? code.value : '',
          footer: tpl.includeCompany ? storeName.value : '',
        },
      ],
      { ...LABEL_SIZES.standard, lang: currentLocale(), title: t('soldUnits.printLabel') },
    ),
  );
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative mx-4 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b p-4">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('soldUnits.barcodeLabel') }}</h3>
          <button class="rounded-lg p-2 hover:bg-gray-100" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div v-if="unit" class="space-y-6 p-6">
          <div class="text-center">
            <h4 class="text-xl font-bold text-gray-900">{{ unit.brand }} {{ unit.model }}</h4>
            <p class="text-sm text-gray-500">{{ unit.storage }} <span v-if="unit.color">- {{ unit.color }}</span></p>
          </div>
          <div class="flex justify-center">
            <div class="rounded-lg border bg-white p-4 shadow-sm"><BarcodeView :value="code" /></div>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-500">{{ identifierLabel }}</p>
            <p class="font-mono text-lg font-medium">{{ identifier }}</p>
          </div>
          <div class="text-center">
            <p class="text-xs text-gray-400">{{ t('soldUnits.barcodeContent') }}</p>
            <p class="font-mono text-sm text-gray-600">{{ code }}</p>
          </div>
          <div class="flex items-center justify-center gap-4">
            <span :class="['rounded-full px-3 py-1 text-sm font-medium', conditionBadge(unit.condition)]">{{ t(`soldUnits.conditions.${unit.condition}`) }}</span>
            <span class="text-xl font-bold text-black">{{ priceText }}</span>
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 border-t bg-gray-50 p-4">
          <button class="btn-secondary inline-flex items-center gap-2" @click="copy">
            <ClipboardDocumentIcon class="h-5 w-5" />
            <span>{{ copied ? t('common.copied') : t('soldUnits.copyImei') }}</span>
          </button>
          <button class="btn-primary inline-flex items-center gap-2" @click="printLabel"><PrinterIcon class="h-5 w-5" /> {{ t('soldUnits.printLabel') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

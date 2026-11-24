<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import DeviceCatalogSelect from '@/components/sold-units/DeviceCatalogSelect.vue';
import SearchableSelect from '@/components/ui/SearchableSelect.vue';
import Toast from '@/components/ui/Toast.vue';
import ProductImageInput from '@/components/products/ProductImageInput.vue';
import ScanButton from '@/components/scan/ScanButton.vue';
import { usePhoneScanHandler } from '@/composables/usePhoneScanner';
import { scanApi } from '@/api/scan';
import { soldUnitsApi, isValidImei } from '@/api/soldUnits';
import { apiErrorMessage } from '@/api/http';
import { suppliersApi } from '@/api/suppliers';
import { formatCurrency } from '@/utils/format';
import DevicePurchaseCard from '@/components/suppliers/DevicePurchaseCard.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

const unitId = computed(() => route.params.id);
const isEdit = computed(() => !!unitId.value);
const deviceType = computed(() => {
  const ty = route.query.type;
  return ['laptop', 'macbook', 'tablet', 'watch'].includes(ty) ? ty : 'phone';
});
const typeBadge = computed(
  () =>
    ({
      laptop: { icon: ComputerDesktopIcon, color: 'bg-gray-600' },
      macbook: { icon: ComputerDesktopIcon, color: 'bg-gray-400' },
      tablet: { icon: DeviceTabletIcon, color: 'bg-purple-500' },
      watch: { icon: ClockIcon, color: 'bg-rose-500' },
    })[deviceType.value] ?? { icon: DevicePhoneMobileIcon, color: 'bg-blue-500' },
);
const isPhone = computed(() => deviceType.value === 'phone');
const isComputer = computed(() => deviceType.value === 'laptop' || deviceType.value === 'macbook');

const device = ref({ brand: '', model: '', storage: '', ram: '', color: '', condition: 'new' });
const details = ref({
  imei: '',
  serialNumber: '',
  batteryHealth: 100,
  chargeCycles: undefined,
  purchasePrice: 0,
  salePrice: 0,
  hasWarranty: true,
  warrantyDays: 365,
  notes: '',
  supplierId: '',
  imageUrl: '',
  boxBarcode: '',
  // Where it was bought: supplier (optionally one of its orders) | other | unknown. Nothing here is required to add stock.
  purchaseSource: 'other',
  supplierOrderId: '',
  purchaseNote: '',
  purchasedAt: '',
});
const errors = ref({});
const saving = ref(false);
const toast = ref({ show: false, message: '', type: 'success' });

onMounted(() => {
  if (!isEdit.value && !route.query.type) router.replace('/app/sold-units/new');
});

const { data: unit, isLoading } = useQuery({ queryKey: ['sold-unit', unitId], queryFn: () => soldUnitsApi.getById(unitId.value), enabled: isEdit });
const { data: suppliers } = useQuery({ queryKey: ['suppliers-list'], queryFn: () => suppliersApi.getAll({ limit: 100 }) });
const supplierOptions = computed(() => (suppliers.value?.suppliers || []).map((s) => ({ value: s.id, label: s.name })));
const PURCHASE_SOURCES = ['supplier', 'other', 'unknown'];
const today = new Date().toISOString().slice(0, 10);
const bySupplier = computed(() => details.value.purchaseSource === 'supplier');
const costRecorded = computed(() => details.value.purchaseSource !== 'unknown');
// A device received with its order keeps that order as its purchase record (its origin is not edited here).
const lockedOrder = ref(null);
// Same query as the Purchase information card (shared cache): gives the linked order's number.
const { data: purchaseInfo } = useQuery({ queryKey: ['device-purchase', unitId], queryFn: () => soldUnitsApi.purchase(unitId.value), enabled: isEdit });
const lockedOrderNumber = computed(() => purchaseInfo.value?.order?.orderNumber || '');
// The chosen supplier's orders that can be linked (submitted or received; not drafts or cancelled ones).
const supplierIdForOrders = computed(() => (bySupplier.value && !lockedOrder.value ? details.value.supplierId : ''));
const { data: supplierOrders } = useQuery({
  queryKey: ['supplier-orders-of', supplierIdForOrders],
  queryFn: () => suppliersApi.getOrders(supplierIdForOrders.value),
  enabled: computed(() => !!supplierIdForOrders.value),
});
const orderOptions = computed(() =>
  (supplierOrders.value || [])
    .filter((o) => o.status !== 'draft' && o.status !== 'cancelled')
    .map((o) => ({ value: o.id, label: `${o.orderNumber} · ${new Date(o.receivedAt || o.orderedAt).toLocaleDateString()}` })),
);
// Another supplier: an order of the previous one no longer applies.
watch(
  () => details.value.supplierId,
  (id, old) => {
    if (old && id !== old) details.value.supplierOrderId = '';
  },
);

let loaded = false;
watch(unit, (u) => {
  if (!u || loaded) return;
  loaded = true;
  device.value = { brand: u.brand, model: u.model, storage: u.storage || '', ram: u.ram || '', color: u.color || '', condition: u.condition };
  details.value = {
    imei: u.imei || '',
    serialNumber: u.serialNumber || '',
    batteryHealth: u.batteryHealth ?? 100,
    chargeCycles: u.chargeCycles ?? undefined,
    purchasePrice: Number(u.purchasePrice),
    salePrice: Number(u.salePrice),
    hasWarranty: u.hasWarranty,
    warrantyDays: u.warrantyDays,
    notes: u.notes || '',
    supplierId: u.supplierId || '',
    imageUrl: u.imageUrl || '',
    // Devices added before the source was recorded: read from what they hold (as the server does).
    purchaseSource: u.purchaseSource || (u.supplierOrderId || u.supplierId ? 'supplier' : Number(u.purchasePrice) > 0 || u.tradeInAt ? 'other' : 'unknown'),
    supplierOrderId: u.supplierOrderId || '',
    purchaseNote: u.purchaseNote || '',
    purchasedAt: u.purchasedAt ? String(u.purchasedAt).slice(0, 10) : '',
  };
  if (u.supplierOrderId) lockedOrder.value = { id: u.supplierOrderId };
});

const profit = computed(() => details.value.salePrice - (costRecorded.value ? details.value.purchasePrice : 0));
const profitPercent = computed(() => (details.value.salePrice <= 0 ? 0 : ((profit.value / details.value.salePrice) * 100).toFixed(1)));

// Catalogue suggested price (when configured) pre-fills empty prices on new devices.
function onDeviceLoaded(d) {
  if (!d || isEdit.value || !d.basePrice) return;
  if (details.value.purchasePrice === 0) details.value.purchasePrice = Math.round(d.basePrice * 0.85);
  if (details.value.salePrice === 0) details.value.salePrice = d.basePrice;
}

// ── IMEI first: identify brand / model from the TAC (first 8 digits), without overwriting what was typed ──
const tac = ref({ status: 'idle', device: null, code: '', reason: '' }); // idle | loading | found | notFound | error
const tacSuggestion = ref(null);
const autofilled = ref(false);
let lastTac = '';
const deviceName = (d) => `${d.brand} ${d.model || ''}`.trim();
/** Fills what the TAC record supports: brand and model, or only the brand when the record names no model. */
function applyIdentified(d) {
  if (!d.model) {
    if (device.value.brand !== d.brand) device.value = { ...device.value, brand: d.brand, model: '', storage: '', ram: '', color: '' };
  } else {
    const sameModel = device.value.brand === d.brand && device.value.model === d.model;
    device.value = { ...device.value, brand: d.brand, model: d.model, ...(sameModel ? {} : { storage: '', ram: '', color: '' }) };
  }
  autofilled.value = true;
  tacSuggestion.value = null;
}
async function identify(code) {
  tac.value = { status: 'loading', device: null, code, reason: '' };
  tacSuggestion.value = null;
  autofilled.value = false;
  try {
    const r = await soldUnitsApi.lookupTac(code);
    if (lastTac !== code) return; // the IMEI changed meanwhile
    if (!r?.found || !r.device) return (tac.value = { status: 'notFound', device: null, code, reason: '' });
    const d = r.device;
    tac.value = { status: 'found', device: d, code, reason: '' };
    // Fill what is empty; anything already entered that differs is only replaced on confirmation.
    const conflict = (device.value.brand && device.value.brand !== d.brand) || (d.model && device.value.model && device.value.model !== d.model);
    if (conflict) tacSuggestion.value = d;
    else applyIdentified(d);
  } catch (e) {
    if (lastTac === code) tac.value = { status: 'error', device: null, code, reason: apiErrorMessage(e) };
  }
}
watch(
  () => details.value.imei,
  async (imei) => {
    if (!isPhone.value || isEdit.value) return;
    if (!imei || !isValidImei(imei)) {
      if (!imei || imei.length < 15) (tac.value = { status: 'idle', device: null, code: '', reason: '' }), (tacSuggestion.value = null), (lastTac = '');
      return;
    }
    const code = imei.slice(0, 8);
    if (code === lastTac) return;
    lastTac = code;
    await identify(code);
  },
);
const imeiInput = ref(null);

// Box barcode: a model this business already linked to it fills empty fields; a different model already entered is
// only replaced on confirmation; a new code is remembered for this model when the device is saved.
const box = ref({ status: 'idle', model: null }); // idle | loading | known | new | error
const boxSuggestion = ref(null);
const boxName = (m) => [m.brand, m.model, m.storage, m.color].filter(Boolean).join(' ');
function applyBox(m) {
  device.value = { ...device.value, brand: m.brand, model: m.model, ...(m.storage ? { storage: m.storage } : {}), ...(m.color ? { color: m.color } : {}) };
  boxSuggestion.value = null;
}
async function lookupBox(code) {
  const c = (code || '').trim();
  details.value.boxBarcode = c;
  boxSuggestion.value = null;
  if (!c) return (box.value = { status: 'idle', model: null });
  box.value = { status: 'loading', model: null };
  try {
    const r = await scanApi.lookup(c);
    const m = r.modelBarcode;
    if (!m) return (box.value = { status: 'new', model: null });
    box.value = { status: 'known', model: m };
    const conflict = (device.value.brand && device.value.brand !== m.brand) || (device.value.model && device.value.model !== m.model);
    if (conflict) boxSuggestion.value = m;
    else applyBox(m);
  } catch {
    box.value = { status: 'error', model: null };
  }
}
// A camera scan in the IMEI card: an IMEI goes to the IMEI field, anything else is treated as the box barcode.
// A paired phone's scans go through the same handler.
usePhoneScanHandler((code) => onDeviceScan(code));
function onDeviceScan(code) {
  const c = code.replace(/\s+/g, '');
  if (/^\d{15}$/.test(c)) details.value.imei = c;
  else lookupBox(c);
}
onMounted(() => {
  if (isPhone.value && !isEdit.value) setTimeout(() => imeiInput.value?.focus(), 50);
  // Handed over by "Scan to identify".
  if (!isEdit.value && typeof route.query.imei === 'string' && /^\d{15}$/.test(route.query.imei)) details.value.imei = route.query.imei;
  if (!isEdit.value && typeof route.query.box === 'string' && route.query.box) lookupBox(route.query.box);
});

const imeiCheck = computed(() => {
  const imei = details.value.imei;
  if (!isPhone.value || !imei) return null;
  if (imei.length !== 15) return { valid: false, message: t('soldUnits.imeiLength') };
  if (!/^\d{15}$/.test(imei)) return { valid: false, message: t('soldUnits.imeiNumeric') };
  return isValidImei(imei) ? { valid: true, message: t('soldUnits.imeiValid') } : { valid: false, message: t('soldUnits.imeiInvalid') };
});

function validate() {
  const e = {};
  if (!device.value.brand) e.brand = t('validation.required');
  if (!device.value.model) e.model = t('validation.required');
  if (!device.value.condition) e.condition = t('validation.required');
  if (isPhone.value) {
    if (!details.value.imei && !details.value.serialNumber) e.imei = t('soldUnits.imeiOrSerialRequired');
    if (details.value.imei && !imeiCheck.value?.valid) e.imei = imeiCheck.value?.message || t('soldUnits.imeiInvalid');
  }
  if (isComputer.value && !device.value.ram) e.ram = t('validation.required');
  if (costRecorded.value && details.value.purchasePrice < 0) e.purchasePrice = t('validation.positive');
  if (details.value.salePrice <= 0) e.salePrice = t('validation.positive');
  else if (costRecorded.value && details.value.salePrice < details.value.purchasePrice) e.salePrice = t('validation.priceTooLow');
  if (bySupplier.value && !lockedOrder.value && !details.value.supplierId) e.supplierId = t('soldUnits.purchaseSource.supplierRequired');
  errors.value = e;
  return Object.keys(e).length === 0;
}

const saveMutation = useMutation({
  mutationFn: (payload) => (isEdit.value ? soldUnitsApi.update(unitId.value, payload) : soldUnitsApi.create(payload)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['sold-units'] });
    queryClient.invalidateQueries({ queryKey: ['device-purchase'] });
    toast.value = { show: true, message: isEdit.value ? t('soldUnits.updateSuccess') : t('soldUnits.createSuccess'), type: 'success' };
    setTimeout(() => router.push('/app/sold-units'), 1000);
  },
  onError: (e) => {
    if (e.response?.data?.errors) errors.value = e.response.data.errors;
    toast.value = { show: true, message: e.response?.data?.message || t('common.error'), type: 'error' };
  },
});

function purchasePayload() {
  const d = details.value;
  const date = d.purchasedAt || null;
  if (d.purchaseSource === 'supplier')
    return { purchaseSource: 'supplier', supplierId: d.supplierId || null, supplierOrderId: d.supplierOrderId || null, purchasedAt: d.supplierOrderId ? null : date };
  if (d.purchaseSource === 'other') return { purchaseSource: 'other', purchaseNote: d.purchaseNote.trim() || null, purchasedAt: date };
  return { purchaseSource: 'unknown' };
}

async function submit() {
  if (!validate()) return;
  saving.value = true;
  try {
    await saveMutation.mutateAsync({
      brand: device.value.brand,
      model: device.value.model,
      storage: device.value.storage || undefined,
      ram: device.value.ram || undefined,
      color: device.value.color || undefined,
      condition: device.value.condition,
      imei: details.value.imei || undefined,
      serialNumber: details.value.serialNumber || undefined,
      batteryHealth: details.value.batteryHealth,
      chargeCycles: details.value.chargeCycles || undefined,
      purchasePrice: costRecorded.value ? details.value.purchasePrice || 0 : 0,
      salePrice: details.value.salePrice,
      hasWarranty: details.value.hasWarranty,
      warrantyDays: details.value.hasWarranty ? details.value.warrantyDays : 0,
      notes: details.value.notes || undefined,
      deviceType: deviceType.value,
      // A device received with its order keeps it: its purchase part is not sent.
      ...(lockedOrder.value ? {} : purchasePayload()),
      imageUrl: details.value.imageUrl || null,
      boxBarcode: !isEdit.value ? details.value.boxBarcode || null : undefined,
    });
  } finally {
    saving.value = false;
  }
}

const section = 'border-b pb-2 text-lg font-semibold text-gray-900';
</script>

<template>
  <div class="max-w-5xl px-4 sm:px-6 lg:px-8">
    <div class="mb-6 flex items-center gap-4">
      <RouterLink :to="isEdit ? '/app/sold-units' : '/app/sold-units/new'" class="rounded-lg p-2 hover:bg-gray-100"><ArrowLeftIcon class="h-5 w-5" /></RouterLink>
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-gray-900">{{ isEdit ? t('soldUnits.edit') : t('soldUnits.add') }}</h1>
          <span v-if="!isEdit" :class="['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white', typeBadge.color]">
            <component :is="typeBadge.icon" class="h-4 w-4" /> {{ t(`soldUnits.deviceTypes.${deviceType}.name`) }}
          </span>
        </div>
        <p class="text-sm text-gray-500">{{ isComputer ? t('soldUnits.formSubtitleComputer') : t('soldUnits.formSubtitle') }}</p>
      </div>
    </div>

    <!-- Where this phone or device was bought: supplier, order and its purchase invoice, cost -->
    <DevicePurchaseCard v-if="isEdit && !isLoading" :key="unitId" :unit-id="unitId" class="mb-6" />

    <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>

    <form v-else class="grid grid-cols-1 gap-6 lg:grid-cols-2" @submit.prevent="submit">
      <div class="space-y-6">
        <div v-if="isPhone" class="card space-y-3 border-2 border-gray-900 p-6">
          <h2 :class="section">{{ t('soldUnits.tac.title') }}</h2>
          <p class="text-sm text-gray-500">{{ t('soldUnits.tac.hint') }}</p>
          <div class="flex gap-2">
          <div class="relative flex-1">
            <input
              ref="imeiInput"
              v-model.trim="details.imei"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="15"
              placeholder="000000000000000"
              :aria-label="t('soldUnits.imei')"
              :class="['input py-3 font-mono text-xl tracking-widest', { 'input-error': errors.imei, 'border-green-500': imeiCheck?.valid }]"
              @keydown.enter.prevent
            />
            <div class="absolute end-3 top-1/2 -translate-y-1/2">
              <ArrowPathIcon v-if="tac.status === 'loading'" class="h-5 w-5 animate-spin text-gray-400" />
              <CheckCircleIcon v-else-if="imeiCheck?.valid" class="h-5 w-5 text-green-500" />
              <XCircleIcon v-else-if="details.imei" class="h-5 w-5 text-danger-500" />
            </div>
          </div>
          <ScanButton v-if="!isEdit" :title="t('scan.button')" @scan="onDeviceScan" />
          </div>
          <p v-if="imeiCheck" :class="['text-sm', imeiCheck.valid ? 'text-green-600' : 'text-danger-600']">{{ imeiCheck.message }}</p>
          <p v-if="errors.imei && !imeiCheck" class="text-sm text-danger-600">{{ errors.imei }}</p>

          <p v-if="tac.status === 'loading'" class="text-sm text-gray-500">{{ t('soldUnits.tac.loading') }}</p>
          <div v-else-if="tacSuggestion" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p class="text-amber-900">{{ t('soldUnits.tac.conflict', { found: deviceName(tacSuggestion), current: deviceName(device) }) }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-primary btn-sm" @click="applyIdentified(tacSuggestion)">{{ t('soldUnits.tac.useFound', { found: deviceName(tacSuggestion) }) }}</button>
              <button type="button" class="btn-secondary btn-sm" @click="tacSuggestion = null">{{ t('soldUnits.tac.keepMine') }}</button>
            </div>
          </div>
          <div v-else-if="tac.status === 'found'" class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <template v-if="tac.device.model">
              <p class="font-semibold">{{ t('soldUnits.tac.identified', { device: deviceName(tac.device) }) }}</p>
              <p v-if="autofilled">{{ t('soldUnits.tac.filled') }}</p>
              <p v-if="tac.device.modelVia === 'modelNumber'" class="text-xs">{{ t('soldUnits.tac.viaModelNumber', { value: tac.device.modelNumber }) }}</p>
            </template>
            <template v-else>
              <p class="font-semibold">{{ t('soldUnits.tac.brandOnly', { brand: tac.device.brand }) }}</p>
              <p v-if="autofilled">{{ t('soldUnits.tac.brandFilled') }}</p>
            </template>
            <p v-if="tac.device.sourceModelName && tac.device.sourceModelName !== tac.device.model" class="text-xs">{{ t('soldUnits.tac.sourceName', { name: tac.device.sourceModelName }) }}</p>
            <p v-if="tac.device.modelNumber" class="text-xs">{{ t('soldUnits.tac.modelNumber', { value: tac.device.modelNumber }) }}</p>
            <p class="text-xs text-green-800">
              {{ tac.device.source === 'own' ? t('soldUnits.tac.sourceOwn', { n: tac.device.seenCount }) : t('soldUnits.tac.sourceReference', { name: tac.device.sourceName }) }}
            </p>
            <p v-if="tac.device.model && !tac.device.inCatalog" class="mt-1 text-xs text-amber-800">{{ t('soldUnits.tac.notInCatalog') }}</p>
          </div>
          <p v-else-if="tac.status === 'notFound'" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{{ t('soldUnits.tac.notFound', { tac: tac.code }) }}</p>
          <div v-else-if="tac.status === 'error'" class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800" role="alert">
            <p>{{ t('soldUnits.tac.unavailable', { reason: tac.reason }) }}</p>
            <button type="button" class="btn-secondary btn-sm mt-2" @click="identify(tac.code)">{{ t('soldUnits.tac.retry') }}</button>
          </div>
          <p class="text-xs text-gray-400">{{ t('soldUnits.tac.privacy') }}</p>
          <div v-if="!isEdit" class="border-t border-gray-100 pt-3">
            <label class="label" for="box-barcode">{{ t('scan.boxBarcode') }}</label>
            <div class="flex gap-2">
              <input id="box-barcode" :value="details.boxBarcode" class="input font-mono" dir="ltr" autocomplete="off" @change="lookupBox($event.target.value)" @keydown.enter.prevent="lookupBox($event.target.value)" />
              <ScanButton :title="t('scan.boxBarcode')" @scan="lookupBox" />
            </div>
            <p v-if="box.status === 'loading'" class="mt-1 text-xs text-gray-500">{{ t('common.loading') }}</p>
            <div v-else-if="boxSuggestion" class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p class="text-amber-900">{{ t('scan.boxConflict', { found: boxName(boxSuggestion), current: deviceName(device) }) }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button type="button" class="btn-primary btn-sm" @click="applyBox(boxSuggestion)">{{ t('soldUnits.tac.useFound', { found: boxName(boxSuggestion) }) }}</button>
                <button type="button" class="btn-secondary btn-sm" @click="boxSuggestion = null">{{ t('soldUnits.tac.keepMine') }}</button>
              </div>
            </div>
            <p v-else-if="box.status === 'known'" class="mt-1 text-sm text-green-700">{{ t('scan.boxFilled', { device: boxName(box.model) }) }}</p>
            <p v-else-if="box.status === 'new'" class="mt-1 text-xs text-gray-500">{{ t('scan.boxNew') }}</p>
            <p v-else-if="box.status === 'error'" class="mt-1 text-xs text-danger-600">{{ t('common.genericError') }}</p>
            <p v-else class="mt-1 text-xs text-gray-500">{{ t('scan.boxBarcodeHint') }}</p>
          </div>
        </div>

        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.deviceInfo') }}</h2>
          <DeviceCatalogSelect v-model="device" :disabled="isEdit" :device-type="deviceType" @device-loaded="onDeviceLoaded" />
          <p v-if="errors.brand || errors.model" class="text-sm text-danger-600">{{ errors.brand || errors.model }}</p>
          <p v-if="errors.ram" class="text-sm text-danger-600">{{ t('soldUnits.ramRequired') }}</p>
          <ProductImageInput v-model="details.imageUrl" :name="`${device.brand} ${device.model}`" :label="t('soldUnits.photo')" />
        </div>

        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.identification') }}</h2>
          <div>
            <label class="label">{{ t('soldUnits.serialNumber') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
            <input
              v-model="details.serialNumber"
              type="text"
              :placeholder="isComputer ? 'C02XG2JHJG5H' : 'ABC123XYZ'"
              :class="['input font-mono', { 'input-error': errors.serialNumber }]"
              @keydown.enter.prevent
            />
            <p v-if="errors.serialNumber" class="mt-1 text-sm text-danger-600">{{ errors.serialNumber }}</p>
          </div>
        </div>

        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.batteryHealth') }}</h2>
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm text-gray-600">{{ t('soldUnits.batteryHealthPercent') }}</span>
              <span
                :class="[
                  'text-lg font-bold',
                  details.batteryHealth >= 80 ? 'text-green-600' : details.batteryHealth >= 60 ? 'text-amber-600' : 'text-red-600',
                ]"
              >
                {{ details.batteryHealth }}%
              </span>
            </div>
            <input v-model.number="details.batteryHealth" type="range" min="0" max="100" step="1" class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-black" />
            <div class="mt-1 flex justify-between text-xs text-gray-400"><span>0%</span><span>50%</span><span>100%</span></div>
          </div>
          <div>
            <label class="label">{{ t('soldUnits.chargeCycles') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
            <input v-model.number="details.chargeCycles" type="number" min="0" max="9999" class="input" :placeholder="t('soldUnits.chargeCyclesPlaceholder')" />
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.pricing') }}</h2>
          <div class="grid grid-cols-2 gap-4">
            <div v-if="costRecorded">
              <label class="label">{{ t('soldUnits.purchasePrice') }} *</label>
              <input v-model.number="details.purchasePrice" type="number" step="1" min="0" :class="['input', { 'input-error': errors.purchasePrice }]" />
              <p v-if="errors.purchasePrice" class="mt-1 text-sm text-danger-600">{{ errors.purchasePrice }}</p>
            </div>
            <div>
              <label class="label">{{ t('soldUnits.salePrice') }} *</label>
              <input v-model.number="details.salePrice" type="number" step="1" min="0" :class="['input', { 'input-error': errors.salePrice }]" />
              <p v-if="errors.salePrice" class="mt-1 text-sm text-danger-600">{{ errors.salePrice }}</p>
            </div>
          </div>
          <div v-if="costRecorded" class="rounded-lg bg-gray-50 p-4">
            <div class="flex items-center justify-between">
              <span class="text-gray-600">{{ t('soldUnits.profit') }}</span>
              <div class="text-end">
                <span :class="['text-xl font-bold', profit >= 0 ? 'text-success-600' : 'text-danger-600']">{{ formatCurrency(profit, 'DH', profit >= 0 ? '+' : '') }}</span>
                <span class="ms-2 text-sm text-gray-500">({{ profitPercent }}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Purchase source: supplier (optionally one of its orders), another source, or not recorded. Never required. -->
        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.purchaseSource.title') }}</h2>
          <p v-if="lockedOrder" class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{{ t('soldUnits.purchaseSource.locked', { order: lockedOrderNumber }) }}</p>
          <template v-else>
            <div class="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1" role="radiogroup" :aria-label="t('soldUnits.purchaseSource.title')">
              <button
                v-for="s in PURCHASE_SOURCES"
                :key="s"
                type="button"
                role="radio"
                :aria-checked="details.purchaseSource === s"
                :class="['rounded-md px-2 py-2 text-sm font-medium transition-colors', details.purchaseSource === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900']"
                @click="details.purchaseSource = s"
              >
                {{ t(`soldUnits.purchaseSource.${s}`) }}
              </button>
            </div>

            <template v-if="details.purchaseSource === 'supplier'">
              <div>
                <label class="label">{{ t('soldUnits.supplier') }} *</label>
                <SearchableSelect v-model="details.supplierId" :options="supplierOptions" :placeholder="t('common.none')" />
                <p v-if="errors.supplierId" class="mt-1 text-sm text-danger-600">{{ errors.supplierId }}</p>
              </div>
              <div v-if="details.supplierId">
                <label class="label">{{ t('soldUnits.purchaseSource.order') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
                <SearchableSelect v-if="orderOptions.length" v-model="details.supplierOrderId" :options="orderOptions" :placeholder="t('soldUnits.purchaseSource.orderNone')" />
                <p v-else class="text-sm text-gray-500">{{ t('soldUnits.purchaseSource.noOrders') }}</p>
                <p v-if="details.supplierOrderId" class="mt-1 text-xs text-gray-500">{{ t('soldUnits.purchaseSource.orderHint') }}</p>
              </div>
            </template>

            <div v-if="details.purchaseSource === 'other'">
              <label class="label">{{ t('soldUnits.purchaseSource.otherNote') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
              <input v-model="details.purchaseNote" type="text" maxlength="191" class="input" :placeholder="t('soldUnits.purchaseSource.otherNotePlaceholder')" />
            </div>

            <div v-if="details.purchaseSource === 'other' || (details.purchaseSource === 'supplier' && !details.supplierOrderId)">
              <label class="label">{{ t('soldUnits.purchaseSource.date') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
              <input v-model="details.purchasedAt" type="date" class="input" :max="today" />
            </div>

            <p v-if="details.purchaseSource === 'unknown'" class="text-sm text-gray-500">{{ t('soldUnits.purchaseSource.unknownHint') }}</p>
          </template>
        </div>

        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.warranty') }}</h2>
          <div class="flex items-center justify-between">
            <label class="label mb-0">{{ t('soldUnits.hasWarranty') }}</label>
            <button
              type="button"
              :class="[
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                details.hasWarranty ? 'bg-black' : 'bg-gray-200',
              ]"
              @click="details.hasWarranty = !details.hasWarranty"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  details.hasWarranty ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>
          <div v-if="details.hasWarranty">
            <label class="label">{{ t('soldUnits.warrantyDays') }}</label>
            <div class="flex gap-2">
              <button
                v-for="d in [30, 90, 180, 365]"
                :key="d"
                type="button"
                :class="['rounded-lg px-4 py-2 text-sm font-medium transition-colors', details.warrantyDays === d ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
                @click="details.warrantyDays = d"
              >
                {{ d }} {{ t('common.days') }}
              </button>
            </div>
            <input v-model.number="details.warrantyDays" type="number" min="0" class="input mt-2" :placeholder="t('soldUnits.customWarrantyDays')" />
          </div>
        </div>

        <div class="card space-y-4 p-6">
          <h2 :class="section">{{ t('soldUnits.notes') }}</h2>
          <textarea
            v-model="details.notes"
            rows="4"
            class="input"
            :placeholder="isComputer ? t('soldUnits.notesPlaceholderComputer') : t('soldUnits.notesPlaceholder')"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-4 pt-4 lg:col-span-2">
        <RouterLink to="/app/sold-units" class="btn-secondary">{{ t('common.cancel') }}</RouterLink>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? (isEdit ? t('common.updating') : t('common.creating')) : isEdit ? t('common.update') : t('common.create') }}
        </button>
      </div>
    </form>

    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, CubeIcon, DevicePhoneMobileIcon, PlusIcon, ShoppingCartIcon, ViewfinderCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { scanApi } from '@/api/scan';
import { formatImei } from '@/api/soldUnits';
import { apiErrorMessage } from '@/api/http';
import { formatCurrency } from '@/utils/format';
import { useBarcodeScanner } from '@/composables/useBarcodeScanner';
import CameraScanner from './CameraScanner.vue';
import { setPhoneScanFallback } from '@/composables/usePhoneScanner';
import ProductImage from '@/components/products/ProductImage.vue';
import DeviceImage from '@/components/sold-units/DeviceImage.vue';

/**
 * "Scan to identify", from any page: camera (or USB / Bluetooth scanner, or typing) → what CaissePro knows about
 * the code, with the next step. Prices shown are only those stored in CaissePro.
 */
const props = defineProps({ listenToScanner: { type: Boolean, default: false } });
const { t } = useI18n();
const router = useRouter();
const cameraOpen = ref(false);
const result = ref(null);
const loading = ref(false);
const error = ref('');

async function identify(code) {
  cameraOpen.value = false;
  result.value = { code };
  loading.value = true;
  error.value = '';
  try {
    result.value = await scanApi.lookup(code);
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
// Optional: a hardware scanner used on a page without its own scan handling.
if (props.listenToScanner) useBarcodeScanner(identify);
// A paired phone's scan on a page that does not handle scans itself.
onMounted(() => setPhoneScanFallback(identify));
onBeforeUnmount(() => setPhoneScanFallback(null));

function go(to) {
  result.value = null;
  router.push(to);
}
const deviceState = (u) => (u.soldAt ? 'sold' : u.reservedAt ? 'reserved' : 'inStock');
</script>

<template>
  <!-- Phones and tablets only; the result window below also shows a paired phone's scans on any screen. -->
  <button type="button" class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:hidden" :title="t('scan.identify')" :aria-label="t('scan.identify')" @click="cameraOpen = true">
    <ViewfinderCircleIcon class="h-5 w-5" />
  </button>
  <CameraScanner :open="cameraOpen" :title="t('scan.identify')" @scan="identify" @close="cameraOpen = false" />

  <Teleport to="body">
    <div v-if="result" class="modal-overlay" @click.self="result = null">
      <div class="modal-content max-w-lg" role="dialog" :aria-label="t('scan.resultTitle')">
        <div class="modal-header">
          <div>
            <h3 class="text-lg font-bold text-gray-900">{{ t('scan.resultTitle') }}</h3>
            <p class="font-mono text-sm text-gray-500" dir="ltr">{{ result.code }}</p>
          </div>
          <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="result = null"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div class="modal-body space-y-3">
          <p v-if="loading" class="flex items-center gap-2 text-sm text-gray-500"><ArrowPathIcon class="h-4 w-4 animate-spin" /> {{ t('common.loading') }}</p>
          <p v-else-if="error" class="rounded-lg bg-danger-50 p-3 text-sm text-danger-700" role="alert">{{ error }}</p>
          <template v-else>
            <!-- Products -->
            <div v-for="p in result.products || []" :key="p.id" class="flex gap-3 rounded-lg border border-gray-200 p-3">
              <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100"><ProductImage :src="p.imageUrl" :name="p.name" /></div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500"><CubeIcon class="me-1 inline h-3.5 w-3.5" />{{ t('scan.product') }}</p>
                <p class="font-semibold text-gray-900">{{ p.name }}</p>
                <p class="text-sm text-gray-600">{{ formatCurrency(p.retailPrice) }} · {{ t('scan.stock', { n: p.stockQuantity }) }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button class="btn-primary btn-sm" :disabled="p.stockQuantity <= 0" @click="go({ path: '/app/pos', query: { scan: result.code } })"><ShoppingCartIcon class="h-4 w-4" /> {{ t('scan.addToCart') }}</button>
                  <button class="btn-secondary btn-sm" @click="go(`/app/products/${p.id}/edit`)">{{ t('scan.open') }}</button>
                </div>
              </div>
            </div>

            <!-- Individual devices (IMEI / serial / reference) -->
            <div v-for="u in result.units || []" :key="u.id" class="flex gap-3 rounded-lg border border-gray-200 p-3">
              <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100"><DeviceImage :unit="u" size="sm" /></div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-500"><DevicePhoneMobileIcon class="me-1 inline h-3.5 w-3.5" />{{ t('scan.device') }} · {{ t(`scan.states.${deviceState(u)}`) }}</p>
                <p class="font-semibold text-gray-900">{{ u.brand }} {{ u.model }}</p>
                <p class="text-sm text-gray-600">{{ $ltr([u.storage, u.color].filter(Boolean).join(' · ')) }} · {{ formatCurrency(u.salePrice) }}</p>
                <p class="font-mono text-xs text-gray-500" dir="ltr">{{ u.imei ? formatImei(u.imei) : u.serialNumber || u.ref }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button v-if="!u.soldAt" class="btn-primary btn-sm" @click="go({ path: '/app/pos', query: { scan: u.imei || u.ref } })"><ShoppingCartIcon class="h-4 w-4" /> {{ t('scan.sell') }}</button>
                  <button class="btn-secondary btn-sm" @click="go({ path: '/app/sold-units', query: { q: u.imei || u.serialNumber || u.ref, stock: 'all' } })">{{ t('scan.open') }}</button>
                </div>
              </div>
            </div>

            <!-- Model from a learned box barcode: no individual phone, no price -->
            <div v-if="result.modelBarcode" class="rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm">
              <p class="font-semibold text-primary-900">{{ t('scan.boxModel', { device: [result.modelBarcode.brand, result.modelBarcode.model, result.modelBarcode.storage, result.modelBarcode.color].filter(Boolean).join(' ') }) }}</p>
              <p class="text-xs text-primary-800">{{ t('scan.boxModelHint') }}</p>
              <button class="btn-primary btn-sm mt-2" @click="go({ path: '/app/sold-units/form', query: { type: result.modelBarcode.deviceType || 'phone', box: result.code } })"><PlusIcon class="h-4 w-4" /> {{ t('scan.addDeviceOfModel') }}</button>
            </div>

            <!-- A valid IMEI that is not in stock: identification only -->
            <div v-if="result.imei" class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p class="font-semibold text-gray-900">{{ result.imei.device ? t('scan.imeiIdentified', { device: [result.imei.device.brand, result.imei.device.model].filter(Boolean).join(' ') }) : t('scan.imeiUnknown') }}</p>
              <p class="text-xs text-gray-500">{{ t('scan.imeiNotInStock') }}</p>
              <button class="btn-primary btn-sm mt-2" @click="go({ path: '/app/sold-units/form', query: { type: 'phone', imei: result.code } })"><PlusIcon class="h-4 w-4" /> {{ t('scan.addThisPhone') }}</button>
            </div>

            <!-- Unknown -->
            <div v-if="!result.found && !result.imei" class="rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm">
              <p class="font-semibold text-warning-900">{{ t('scan.unknown') }}</p>
              <p class="text-xs text-warning-800">{{ t('scan.unknownHint') }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="btn-primary btn-sm" @click="go({ path: '/app/products/new', query: { barcode: result.code } })"><PlusIcon class="h-4 w-4" /> {{ t('scan.createProduct') }}</button>
                <button class="btn-secondary btn-sm" @click="go({ path: '/app/sold-units/form', query: { type: 'phone', box: result.code } })">{{ t('scan.addDeviceWithBox') }}</button>
              </div>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="result = null">{{ t('common.close') }}</button>
          <button class="btn-primary" @click="(result = null), (cameraOpen = true)"><ViewfinderCircleIcon class="h-5 w-5" /> {{ t('scan.scanAnother') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

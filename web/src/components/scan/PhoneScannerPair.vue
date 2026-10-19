<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { ArrowPathIcon, CheckCircleIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { usePhoneScanner } from '@/composables/usePhoneScanner';
import { apiErrorMessage } from '@/api/http';
import { formatDateTime } from '@/utils/format';

/**
 * Header button "Phone scanner": shows a QR code that opens the scanner page on a phone; the phone's scans then
 * arrive on this screen. The link carries a one-time pairing token (12 hours, revoked by Disconnect or a new code).
 */
const { t } = useI18n();
const { state, paired, phoneSeen, pair, unpair, phoneUrl } = usePhoneScanner();
const open = ref(false);
const busy = ref(false);
const error = ref('');
const qr = ref('');
const host = ref('');
const copied = ref(false);

const url = computed(() => phoneUrl(host.value));
// A phone only opens its camera on https (or localhost, which a phone cannot use for this computer).
const needsHttps = computed(() => url.value.startsWith('http:'));
const onLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

watch(
  url,
  async (u) => {
    qr.value = u ? await QRCode.toDataURL(u, { width: 260, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '') : '';
  },
  { immediate: true },
);

async function create() {
  busy.value = true;
  error.value = '';
  try {
    await pair();
    host.value = state.lanAddresses[0] || '';
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
function show() {
  open.value = true;
  if (!host.value) host.value = state.lanAddresses[0] || '';
}
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* the address stays selectable */
  }
}
</script>

<template>
  <button
    type="button"
    class="relative hidden items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:flex"
    :title="t('scan.pair.button')"
    :aria-label="t('scan.pair.button')"
    @click="show"
  >
    <DevicePhoneMobileIcon class="h-5 w-5" />
    <span class="hidden xl:inline">{{ t('scan.pair.short') }}</span>
    <span v-if="paired" class="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" :class="state.error ? 'bg-warning-500' : 'bg-success-500'" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="open = false">
      <div class="modal-content max-w-md" role="dialog" :aria-label="t('scan.pair.title')">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-gray-900">{{ t('scan.pair.title') }}</h3>
          <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="open = false"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div class="modal-body space-y-4 text-sm">
          <template v-if="!paired">
            <p class="text-gray-700">{{ t('scan.pair.intro') }}</p>
            <ul class="list-disc space-y-1 ps-5 text-gray-600">
              <li>{{ t('scan.pair.step1') }}</li>
              <li>{{ t('scan.pair.step2') }}</li>
              <li>{{ t('scan.pair.step3') }}</li>
            </ul>
            <p v-if="error" class="rounded-lg bg-danger-50 p-3 text-danger-700" role="alert">{{ error }}</p>
          </template>

          <template v-else>
            <div class="flex justify-center">
              <img v-if="qr" :src="qr" :alt="t('scan.pair.qrAlt')" class="h-64 w-64 rounded-lg border border-gray-200" />
            </div>
            <p class="text-center text-gray-700">{{ t('scan.pair.scanQr') }}</p>

            <div v-if="onLocalhost && state.lanAddresses.length > 1">
              <label class="label text-xs" for="pair-host">{{ t('scan.pair.network') }}</label>
              <select id="pair-host" v-model="host" class="input py-1.5 text-sm" dir="ltr">
                <option v-for="a in state.lanAddresses" :key="a" :value="a">{{ a }}</option>
              </select>
            </div>
            <p v-else-if="onLocalhost && !state.lanAddresses.length" class="rounded-lg bg-warning-50 p-3 text-warning-900">{{ t('scan.pair.noNetwork') }}</p>

            <div class="flex gap-2">
              <input :value="url" readonly class="input font-mono text-xs" dir="ltr" :aria-label="t('scan.pair.link')" @focus="$event.target.select()" />
              <button type="button" class="btn-secondary" :title="t('scan.pair.copy')" @click="copy">
                <CheckCircleIcon v-if="copied" class="h-5 w-5 text-success-600" /><ClipboardDocumentIcon v-else class="h-5 w-5" />
              </button>
            </div>

            <div v-if="needsHttps" class="rounded-lg border border-warning-200 bg-warning-50 p-3 text-warning-900" role="alert">
              <p class="flex items-center gap-1.5 font-semibold"><ExclamationTriangleIcon class="h-5 w-5" /> {{ t('scan.pair.httpsTitle') }}</p>
              <p class="mt-1">{{ t('scan.pair.httpsHint') }}</p>
              <code class="mt-1 block rounded bg-white/70 px-2 py-1 font-mono text-xs" dir="ltr">npm run dev:phone</code>
            </div>

            <div class="rounded-lg bg-gray-50 p-3">
              <p v-if="state.error" class="flex items-center gap-1.5 text-warning-800"><ArrowPathIcon class="h-4 w-4 animate-spin" /> {{ t('scan.pair.reconnecting') }}</p>
              <p v-else-if="phoneSeen" class="flex items-center gap-1.5 font-medium text-success-700">
                <CheckCircleIcon class="h-5 w-5" /> {{ t('scan.pair.connected', { n: state.pairing.scanCount }) }}
              </p>
              <p v-else class="flex items-center gap-1.5 text-gray-600"><ArrowPathIcon class="h-4 w-4 animate-spin" /> {{ t('scan.pair.waiting') }}</p>
              <p v-if="state.lastCode" class="mt-1 text-xs text-gray-500">
                {{ t('scan.pair.lastScan') }} <span class="font-mono" dir="ltr">{{ state.lastCode }}</span>
              </p>
              <p class="mt-1 text-xs text-gray-500">{{ t('scan.pair.expires', { date: formatDateTime(state.pairing.expiresAt) }) }}</p>
            </div>
            <p class="text-xs text-gray-500">{{ t('scan.pair.security') }}</p>
          </template>
        </div>
        <div class="modal-footer">
          <template v-if="!paired">
            <button class="btn-secondary" @click="open = false">{{ t('common.close') }}</button>
            <button class="btn-primary" :disabled="busy" @click="create">{{ t('scan.pair.showQr') }}</button>
          </template>
          <template v-else>
            <button class="btn-secondary" @click="unpair">{{ t('scan.pair.disconnect') }}</button>
            <button class="btn-secondary" :disabled="busy" @click="create">{{ t('scan.pair.newQr') }}</button>
            <button class="btn-primary" @click="open = false">{{ t('common.close') }}</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

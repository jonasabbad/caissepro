<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ShoppingCartIcon,
  VideoCameraSlashIcon,
  ViewfinderCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { useBarcodeCamera } from '@/composables/useBarcodeCamera';
import { useScannerApp } from '@/composables/useScannerApp';
import { phoneScannerApi } from '@/api/scanner';
import { scanApi } from '@/api/scan';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { formatImei } from '@/api/soldUnits';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

/**
 * CaissePro Scanner (/scanner): the phone app, installable on the home screen. Camera preview, a big Scan button in
 * thumb reach, the scanned code and what CaissePro knows about it (stored name, selling price and stock only).
 * - account: CaissePro is signed in on this phone; results link to the POS and product pages.
 * - paired: opened from a computer's QR code (Phone button), no sign-in; each scan is also sent to that computer,
 *   whose open page handles it (POS: added to the cart). A valid pairing link wins over the account.
 * - signin: neither; sign in, or scan the computer's QR code.
 */
const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const TOKEN_KEY = 'caissepro_scanner_token';
const mode = ref('loading'); // loading | account | paired | signin
const paired = computed(() => mode.value === 'paired');
const ready = computed(() => mode.value === 'account' || mode.value === 'paired');

const video = ref(null);
const manual = ref('');
const busy = ref(false);
const result = ref(null);
const sent = ref(false);
const error = ref('');
const recent = ref([]);
const sendToScreen = ref(true);
const session = ref(null);
const linkExpired = ref(false);
const offline = ref(false);
let api = null;

const { status, error: cameraError, cameras, cameraId, start, stop, submit } = useBarcodeCamera(video, handle);
const app = useScannerApp();
const { canInstall, iosHint } = app;

async function handle(code) {
  busy.value = true;
  error.value = '';
  result.value = { code };
  sent.value = false;
  try {
    if (paired.value) {
      const r = await api.scan(code, sendToScreen.value);
      result.value = r.result;
      sent.value = r.sent;
    } else result.value = await scanApi.lookup(code);
    recent.value = [{ code, name: label(result.value) }, ...recent.value.filter((h) => h.code !== code)].slice(0, 8);
  } catch (e) {
    if (e?.response?.status === 401 && paired.value) return dropPairing(true);
    error.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

function label(r) {
  const p = r?.products?.[0];
  if (p) return p.name;
  const u = r?.units?.[0];
  if (u) return `${u.brand} ${u.model}`;
  if (r?.modelBarcode) return `${r.modelBarcode.brand} ${r.modelBarcode.model}`;
  if (r?.imei?.device) return `${r.imei.device.brand} ${r.imei.device.model}`;
  return t('scan.phone.unknownShort');
}

function scan() {
  result.value = null;
  error.value = '';
  start();
}
function submitManual() {
  const c = manual.value.trim();
  manual.value = '';
  if (!c) return;
  if (status.value === 'scanning') submit(c);
  else handle(c);
}

const deviceState = (u) => (u.soldAt ? 'sold' : u.reservedAt ? 'reserved' : 'inStock');
const stockClass = (n) => (n <= 0 ? 'text-danger-700' : n <= 3 ? 'text-warning-700' : 'text-success-700');

// The pairing token is kept on the phone (localStorage): the home screen app reopens still paired, until it expires.
function savedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
function saveToken(v) {
  try {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: kept in memory only */
  }
}

/** Without (or after) a pairing: this phone's own CaissePro sign-in, or the sign-in screen. */
async function useAccount() {
  await auth.initializeAuth().catch(() => undefined);
  mode.value = auth.isAuthenticated ? 'account' : 'signin';
}
async function dropPairing(expired) {
  stop();
  saveToken('');
  api = null;
  session.value = null;
  result.value = null;
  linkExpired.value = expired;
  await useAccount();
}
async function disconnect() {
  await api?.disconnect().catch(() => undefined);
  await dropPairing(false);
}

/** Opens the camera straight away when the phone already allowed it (e.g. launched from the home screen). */
async function autoStart() {
  try {
    const p = await navigator.permissions?.query({ name: 'camera' });
    if (p?.state === 'granted' && ready.value && status.value === 'idle') start();
  } catch {
    /* the browser cannot tell: wait for the Scan button */
  }
}

async function init() {
  // A pairing link brings its token in the #fragment (never sent to a server); it is removed from the address bar.
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('t') || '';
  if (fromLink) {
    saveToken(fromLink);
    router.replace({ path: '/scanner', hash: '' });
  }
  const token = fromLink || savedToken();
  if (token) {
    api = phoneScannerApi(token);
    try {
      session.value = await api.session();
      mode.value = 'paired';
    } catch (e) {
      if (e?.response?.status === 401) await dropPairing(true);
      else {
        offline.value = true;
        mode.value = 'paired';
      }
    }
  } else await useAccount();
  autoStart();
}
// A pairing link opened while the scanner is already showing only changes the #fragment.
const onHash = () => window.location.hash.includes('t=') && (stop(), (linkExpired.value = false), init());
onMounted(() => {
  app.attach();
  window.addEventListener('hashchange', onHash);
  init();
});
onBeforeUnmount(() => {
  app.detach();
  window.removeEventListener('hashchange', onHash);
});
</script>

<template>
  <div class="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col bg-gray-50">
    <!-- Top bar -->
    <header class="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3" style="padding-top: max(0.75rem, env(safe-area-inset-top))">
      <div class="min-w-0">
        <p class="font-bold text-gray-900">{{ t('scan.app.name') }}</p>
        <p v-if="paired && session" class="flex items-center gap-1 truncate text-xs text-success-700">
          <ComputerDesktopIcon class="h-3.5 w-3.5 shrink-0" /> {{ t('scan.phone.connectedTo', { name: [session.business, session.store].filter(Boolean).join(' · ') }) }}
        </p>
        <p v-else-if="mode === 'account'" class="truncate text-xs text-gray-500">{{ t('scan.app.signedInAs', { name: auth.currentUser?.firstName || auth.currentUser?.email }) }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <RouterLink v-if="mode === 'account'" to="/app/dashboard" class="rounded-lg border border-gray-200 p-2 text-gray-600" :title="t('scan.app.openApp')" :aria-label="t('scan.app.openApp')">
          <ArrowTopRightOnSquareIcon class="h-5 w-5" />
        </RouterLink>
        <LanguageSwitcher compact />
      </div>
    </header>

    <!-- Add to the home screen (hidden once installed or dismissed) -->
    <div v-if="canInstall || iosHint" class="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900">
      <ArrowDownTrayIcon class="mt-0.5 h-5 w-5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ t('scan.app.installTitle') }}</p>
        <p v-if="iosHint" class="text-xs">{{ t('scan.app.iosHint') }}</p>
        <button v-else type="button" class="btn-primary btn-sm mt-2" @click="app.install()">{{ t('scan.app.install') }}</button>
      </div>
      <button type="button" class="rounded p-1" :aria-label="t('common.close')" @click="app.dismiss()"><XMarkIcon class="h-4 w-4" /></button>
    </div>

    <div v-if="mode === 'loading'" class="flex flex-1 items-center justify-center text-sm text-gray-500">
      <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('common.loading') }}
    </div>

    <!-- Not signed in and not paired -->
    <div v-else-if="mode === 'signin'" class="flex flex-1 flex-col gap-3 p-4">
      <div v-if="linkExpired" class="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" role="alert">
        <p class="font-semibold">{{ t('scan.phone.linkInvalid') }}</p>
        <p class="mt-1">{{ t('scan.phone.linkInvalidHint') }}</p>
      </div>
      <div class="rounded-xl border border-gray-200 bg-white p-5 text-center">
        <ViewfinderCircleIcon class="mx-auto h-12 w-12 text-primary-600" />
        <p class="mt-2 text-lg font-semibold text-gray-900">{{ t('scan.app.welcome') }}</p>
        <p class="mt-1 text-sm text-gray-600">{{ t('scan.app.signinHint') }}</p>
        <RouterLink :to="{ path: '/login', query: { redirect: '/scanner' } }" class="btn-primary mt-4 h-12 w-full justify-center text-base">{{ t('scan.app.signin') }}</RouterLink>
        <p class="mt-4 flex items-start gap-2 text-start text-xs text-gray-500">
          <ComputerDesktopIcon class="h-4 w-4 shrink-0" /> {{ t('scan.app.pairHint') }}
        </p>
      </div>
    </div>

    <main v-else class="flex flex-1 flex-col gap-3 p-4">
      <p v-if="linkExpired" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" role="status">{{ t('scan.app.linkEndedAccount') }}</p>
      <div v-if="offline" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" role="alert">
        <p class="font-semibold">{{ t('scan.phone.offline') }}</p>
        <p class="mt-1">{{ t('scan.phone.offlineHint') }}</p>
      </div>

      <!-- Camera -->
      <div dir="ltr" class="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
        <video ref="video" class="h-full w-full object-cover" muted playsinline />
        <div v-if="status === 'scanning'" class="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80">
          <div class="absolute inset-x-2 top-1/2 h-0.5 bg-danger-500/80" />
        </div>
        <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/80" dir="auto">
          <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('scan.starting') }}
        </div>
        <div v-if="status === 'idle'" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white/80">
          <ViewfinderCircleIcon class="h-10 w-10" />
          <p dir="auto">{{ t('scan.phone.tapToScan') }}</p>
        </div>
        <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
          <VideoCameraSlashIcon class="h-8 w-8 text-white/70" />
          <p dir="auto">{{ t(`scan.errors.${cameraError}`) }}</p>
        </div>
      </div>
      <p v-if="status === 'scanning'" class="text-center text-xs text-gray-500">{{ t('scan.aim') }}</p>
      <select v-if="cameras.length > 1" v-model="cameraId" class="input py-1.5 text-sm" :aria-label="t('scan.camera')">
        <option v-for="(c, i) in cameras" :key="c.deviceId" :value="c.deviceId">{{ c.label || `${t('scan.camera')} ${i + 1}` }}</option>
      </select>

      <label v-if="paired" class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
        <span>
          <span class="font-medium text-gray-900">{{ t('scan.phone.sendToScreen') }}</span>
          <span class="block text-xs text-gray-500">{{ t('scan.phone.sendToScreenHint') }}</span>
        </span>
        <input v-model="sendToScreen" type="checkbox" class="h-5 w-5 rounded border-gray-300 text-primary-600" />
      </label>

      <!-- Result -->
      <section v-if="result" class="rounded-xl border border-gray-200 bg-white p-4" aria-live="polite">
        <p class="text-xs text-gray-500">{{ t('scan.phone.scanned') }}</p>
        <p class="font-mono text-lg font-semibold text-gray-900" dir="ltr">{{ result.code }}</p>
        <p v-if="busy" class="mt-2 flex items-center gap-2 text-sm text-gray-500"><ArrowPathIcon class="h-4 w-4 animate-spin" /> {{ t('common.loading') }}</p>
        <p v-else-if="error" class="mt-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-700" role="alert">{{ error }}</p>
        <template v-else>
          <p v-if="sent" class="mt-2 flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-800">
            <CheckCircleIcon class="h-5 w-5 shrink-0" /> {{ t('scan.phone.sent') }}
          </p>

          <div v-for="p in result.products || []" :key="p.id" class="mt-3 border-t border-gray-100 pt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('scan.product') }}<template v-if="p.category?.name || p.categoryName"> · {{ p.category?.name || p.categoryName }}</template></p>
            <p class="text-lg font-semibold text-gray-900">{{ p.name }}</p>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-lg bg-gray-50 p-2">
                <dt class="text-xs text-gray-500">{{ t('scan.phone.price') }}</dt>
                <dd class="text-base font-bold text-gray-900">{{ formatCurrency(p.retailPrice) }}</dd>
              </div>
              <div class="rounded-lg bg-gray-50 p-2">
                <dt class="text-xs text-gray-500">{{ t('scan.phone.stock') }}</dt>
                <dd class="text-base font-bold" :class="stockClass(p.stockQuantity)">{{ p.stockQuantity }}</dd>
              </div>
            </dl>
            <div v-if="!paired" class="mt-3 grid grid-cols-2 gap-2">
              <button class="btn-primary justify-center" :disabled="p.stockQuantity <= 0" @click="router.push({ path: '/app/pos', query: { scan: result.code } })">
                <ShoppingCartIcon class="h-5 w-5" /> {{ t('scan.addToCart') }}
              </button>
              <button class="btn-secondary justify-center" @click="router.push(`/app/products/${p.id}/edit`)">{{ t('scan.open') }}</button>
            </div>
          </div>

          <div v-for="u in result.units || []" :key="u.id" class="mt-3 border-t border-gray-100 pt-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('scan.device') }} · {{ t(`scan.states.${deviceState(u)}`) }}</p>
            <dl class="mt-1 grid grid-cols-2 gap-2 text-sm">
              <div><dt class="text-xs text-gray-500">{{ t('scan.phone.brand') }}</dt><dd class="font-semibold text-gray-900">{{ u.brand }}</dd></div>
              <div><dt class="text-xs text-gray-500">{{ t('scan.phone.model') }}</dt><dd class="font-semibold text-gray-900">{{ u.model }}</dd></div>
              <div v-if="u.storage || u.color" class="col-span-2 text-gray-600">{{ $ltr([u.storage, u.color].filter(Boolean).join(' · ')) }}</div>
              <div class="rounded-lg bg-gray-50 p-2">
                <dt class="text-xs text-gray-500">{{ t('scan.phone.price') }}</dt>
                <dd class="text-base font-bold text-gray-900">{{ formatCurrency(u.salePrice) }}</dd>
              </div>
              <div class="rounded-lg bg-gray-50 p-2">
                <dt class="text-xs text-gray-500">{{ t('scan.phone.stock') }}</dt>
                <dd class="text-base font-bold" :class="u.soldAt ? 'text-danger-700' : 'text-success-700'">{{ u.soldAt ? 0 : 1 }}</dd>
              </div>
            </dl>
            <p class="mt-1 font-mono text-xs text-gray-500" dir="ltr">{{ u.imei ? formatImei(u.imei) : u.serialNumber || u.ref }}</p>
            <div v-if="!paired && !u.soldAt" class="mt-3">
              <button class="btn-primary w-full justify-center" @click="router.push({ path: '/app/pos', query: { scan: u.imei || u.ref } })"><ShoppingCartIcon class="h-5 w-5" /> {{ t('scan.sell') }}</button>
            </div>
          </div>

          <div v-if="result.modelBarcode" class="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-3 text-sm">
            <p class="font-semibold text-primary-900">{{ t('scan.boxModel', { device: [result.modelBarcode.brand, result.modelBarcode.model, result.modelBarcode.storage, result.modelBarcode.color].filter(Boolean).join(' ') }) }}</p>
            <p class="text-xs text-primary-800">{{ t('scan.boxModelHint') }}</p>
          </div>

          <div v-if="result.imei" class="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p class="font-semibold text-gray-900">{{ result.imei.device ? t('scan.imeiIdentified', { device: [result.imei.device.brand, result.imei.device.model].join(' ') }) : t('scan.imeiUnknown') }}</p>
            <p class="text-xs text-gray-500">{{ t('scan.imeiNotInStock') }}</p>
          </div>

          <div v-if="!result.found && !result.imei" class="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm" role="alert">
            <p class="flex items-center gap-1.5 font-semibold text-warning-900"><ExclamationTriangleIcon class="h-5 w-5" /> {{ t('scan.unknown') }}</p>
            <p class="mt-1 text-warning-800">{{ paired ? t('scan.phone.unknownPaired') : t('scan.unknownHint') }}</p>
            <button v-if="!paired" class="btn-primary mt-3 w-full justify-center" @click="router.push({ path: '/app/products/new', query: { barcode: result.code } })">
              <PlusIcon class="h-5 w-5" /> {{ t('scan.createProduct') }}
            </button>
          </div>
        </template>
      </section>

      <!-- Typed code / Bluetooth scanner -->
      <form class="flex gap-2" @submit.prevent="submitManual">
        <input v-model="manual" class="input font-mono" dir="ltr" autocomplete="off" inputmode="text" :placeholder="t('scan.manualPlaceholder')" :aria-label="t('scan.manualPlaceholder')" />
        <button type="submit" class="btn-secondary" :disabled="!manual.trim()">{{ t('scan.use') }}</button>
      </form>

      <section v-if="recent.length > 1" class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('scan.phone.recent') }}</p>
        <ul class="divide-y divide-gray-100 text-sm">
          <li v-for="h in recent.slice(1)" :key="h.code" class="flex items-center justify-between gap-2 py-1.5">
            <span class="truncate text-gray-800">{{ h.name }}</span>
            <span class="font-mono text-xs text-gray-500" dir="ltr">{{ h.code }}</span>
          </li>
        </ul>
      </section>

      <button v-if="paired" type="button" class="text-center text-sm text-gray-500 underline" @click="disconnect">{{ t('scan.phone.disconnect') }}</button>
    </main>

    <!-- Scan button in thumb reach -->
    <div v-if="ready" class="sticky bottom-0 z-20 border-t border-gray-200 bg-white/95 p-3 backdrop-blur" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
      <button
        type="button"
        class="btn-primary h-14 w-full justify-center text-lg"
        :disabled="status === 'starting' || status === 'scanning' || busy"
        @click="scan"
      >
        <ViewfinderCircleIcon class="h-6 w-6" />
        {{ status === 'scanning' ? t('scan.phone.scanning') : result ? t('scan.phone.scanNext') : t('scan.phone.scan') }}
      </button>
    </div>
  </div>
</template>

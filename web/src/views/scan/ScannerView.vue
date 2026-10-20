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
import { claimPhone, phoneScannerApi } from '@/api/scanner';
import { scanApi } from '@/api/scan';
import { apiErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { formatImei } from '@/api/soldUnits';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

/**
 * CaissePro Scanner (/scanner): the phone app, installable on the home screen. Camera preview, a big Scan button in
 * thumb reach, the scanned code and what CaissePro knows about it (stored name, selling price and stock only).
 * - device: this phone was authorized once with a computer's QR code (Phone → Add a phone). It keeps its own secret
 *   and reconnects by itself every time; its scans go to the computer it chose (changeable here).
 * - account: CaissePro is signed in on this phone; results link to the POS and product pages.
 * - signin: neither; sign in, or authorize the phone from a computer.
 */
const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const DEVICE_KEY = 'caissepro_scanner_device';
const OLD_KEYS = ['caissepro_scanner_token', 'phone_scanner_token']; // 12-hour links of the first version
const mode = ref('loading'); // loading | account | device | signin
const paired = computed(() => mode.value === 'device');
const ready = computed(() => mode.value === 'account' || mode.value === 'device');

const video = ref(null);
const manual = ref('');
const busy = ref(false);
const result = ref(null);
const sent = ref(false);
const target = ref(null); // computer of the last scan { name, online }
const error = ref('');
const recent = ref([]);
const session = ref(null);
const notice = ref(''); // why the phone is no longer authorized (or the QR code failed): i18n key
const offline = ref(false);
const retrying = ref(false);
let api = null;

const { status, error: cameraError, cameras, cameraId, start, stop, submit } = useBarcodeCamera(video, handle);
const app = useScannerApp();
const { canInstall, iosHint } = app;

const screens = computed(() => session.value?.screens || []);
const currentScreen = computed(() => screens.value.find((s) => s.id === session.value?.device?.screenId) || null);

// Server reasons → explanations shown on the phone.
const REASONS = {
  DEVICE_REVOKED: 'revoked',
  DEVICE_EXPIRED: 'expired',
  DEVICE_UNKNOWN: 'unknown',
  USER_DISABLED: 'userDisabled',
  PAIRING_USED: 'qrUsed',
  PAIRING_EXPIRED: 'qrExpired',
  PAIRING_INVALID: 'qrInvalid',
};
const reasonOf = (e) => REASONS[e?.response?.data?.error] || null;
const isNetwork = (e) => !e?.response;

async function handle(code) {
  busy.value = true;
  error.value = '';
  result.value = { code };
  sent.value = false;
  target.value = null;
  try {
    if (paired.value) {
      const r = await api.scan(code, true);
      result.value = r.result;
      sent.value = r.sent;
      target.value = r.target;
      offline.value = false;
    } else result.value = await scanApi.lookup(code);
    recent.value = [{ code, name: label(result.value) }, ...recent.value.filter((h) => h.code !== code)].slice(0, 8);
  } catch (e) {
    if (paired.value && e?.response?.status === 401) return forgetDevice(reasonOf(e) || 'unknown');
    if (isNetwork(e)) offline.value = true;
    error.value = isNetwork(e) ? t('scan.phone.offline') : apiErrorMessage(e);
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

// The device secret stays on this phone (localStorage), so the home screen app reconnects by itself.
function savedSecret() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    return localStorage.getItem(DEVICE_KEY) || '';
  } catch {
    return '';
  }
}
function saveSecret(v) {
  try {
    if (v) localStorage.setItem(DEVICE_KEY, v);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* private mode: kept in memory only (until the app is closed) */
  }
}

/** "iPhone", "Android · Pixel 7": a default name for this phone (renamable on the computer). */
function phoneName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
  if (m && !/^K$/.test(m[1])) return `Android · ${m[1].trim()}`.slice(0, 40);
  return /Android/.test(ua) ? 'Android' : '';
}

/** Without (or after) an authorized device: this phone's own CaissePro sign-in, or the sign-in screen. */
async function useAccount() {
  await auth.initializeAuth().catch(() => undefined);
  mode.value = auth.isAuthenticated ? 'account' : 'signin';
}
async function forgetDevice(reason) {
  stop();
  saveSecret('');
  api = null;
  session.value = null;
  result.value = null;
  notice.value = reason || '';
  await useAccount();
}
async function disconnect() {
  await api?.disconnect().catch(() => undefined);
  await forgetDevice('');
}

/** Connects with the saved secret; a network failure keeps the secret and retries. */
async function connect(token) {
  api = phoneScannerApi(token);
  try {
    session.value = await api.session();
    offline.value = false;
    mode.value = 'device';
    return true;
  } catch (e) {
    if (e?.response?.status === 401) {
      await forgetDevice(reasonOf(e) || 'unknown');
      return false;
    }
    offline.value = true;
    mode.value = 'device';
    return false;
  }
}
async function retry() {
  retrying.value = true;
  const token = savedSecret();
  if (token) await connect(token);
  retrying.value = false;
}

async function chooseTarget(screenId) {
  try {
    const d = await api.setTarget(screenId || null);
    session.value = { ...session.value, device: d };
  } catch (e) {
    if (e?.response?.status === 401) return forgetDevice(reasonOf(e) || 'unknown');
    error.value = apiErrorMessage(e);
  }
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
  // A QR code brings a one-time code in the #fragment (never sent to a server as part of the address); it is
  // exchanged for this phone's own secret, then removed from the address bar.
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('p') || params.get('t') || '';
  if (code) {
    router.replace({ path: '/scanner', hash: '' });
    try {
      const r = await claimPhone(code, phoneName());
      saveSecret(r.token);
      notice.value = 'paired';
    } catch (e) {
      notice.value = isNetwork(e) ? 'qrOffline' : reasonOf(e) || 'qrInvalid';
    }
  }
  const token = savedSecret();
  if (token) await connect(token);
  else await useAccount();
  autoStart();
}

// Coming back to the app: refresh the computers' status and notice a revoked phone.
function onVisible() {
  if (document.visibilityState === 'visible' && api && mode.value === 'device') connect(savedSecret());
}
// A QR code opened while the scanner is already showing only changes the #fragment.
const onHash = () => /(^|[#&])(p|t)=/.test(window.location.hash) && (stop(), (notice.value = ''), init());
const onOnline = () => offline.value && retry();
onMounted(() => {
  app.attach();
  window.addEventListener('hashchange', onHash);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  init();
});
onBeforeUnmount(() => {
  app.detach();
  window.removeEventListener('hashchange', onHash);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>


<template>
  <div class="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col bg-gray-50">
    <!-- Top bar -->
    <header class="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3" style="padding-top: max(0.75rem, env(safe-area-inset-top))">
      <div class="min-w-0">
        <p class="font-bold text-gray-900">{{ t('scan.app.name') }}</p>
        <p v-if="paired && session" class="truncate text-xs text-gray-500">{{ session.device.name }} · {{ [session.business, session.store].filter(Boolean).join(' · ') }}</p>
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
      <div v-if="notice && notice !== 'paired'" class="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900" role="alert">
        <p class="font-semibold">{{ t(`scan.phoneApp.reasons.${notice}.title`) }}</p>
        <p class="mt-1">{{ t(`scan.phoneApp.reasons.${notice}.hint`) }}</p>
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
      <p v-if="notice === 'paired'" class="flex items-center gap-1.5 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800" role="status">
        <CheckCircleIcon class="h-5 w-5 shrink-0" /> {{ t('scan.phoneApp.paired') }}
      </p>
      <div v-else-if="notice" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" role="status">
        <p class="font-semibold">{{ t(`scan.phoneApp.reasons.${notice}.title`) }}</p>
        <p class="mt-1">{{ mode === 'account' ? t('scan.phoneApp.usingAccount') : t(`scan.phoneApp.reasons.${notice}.hint`) }}</p>
      </div>
      <div v-if="offline" class="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900" role="alert">
        <p class="font-semibold">{{ t('scan.phone.offline') }}</p>
        <p class="mt-1">{{ t('scan.phoneApp.offlineHint') }}</p>
        <button type="button" class="btn-secondary btn-sm mt-2" :disabled="retrying" @click="retry"><ArrowPathIcon class="h-4 w-4" :class="retrying && 'animate-spin'" /> {{ t('common.retry') }}</button>
      </div>

      <!-- Where this phone's scans go -->
      <div v-if="paired && session" class="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
        <label class="flex items-center gap-2" for="scan-target">
          <ComputerDesktopIcon class="h-5 w-5 shrink-0 text-gray-500" />
          <span class="font-medium text-gray-900">{{ t('scan.phoneApp.sendTo') }}</span>
        </label>
        <select id="scan-target" class="input mt-2 py-2" :value="session.device.screenId || ''" @change="chooseTarget($event.target.value)">
          <option value="">{{ t('scan.phoneApp.lookupOnly') }}</option>
          <option v-for="s in screens" :key="s.id" :value="s.id">{{ s.name }}{{ s.userName ? ` (${s.userName})` : '' }} — {{ s.online ? t('scan.phoneApp.online') : t('scan.phoneApp.offline') }}</option>
        </select>
        <p v-if="currentScreen && !currentScreen.online" class="mt-1 text-xs text-warning-700">{{ t('scan.phoneApp.targetOffline', { name: currentScreen.name }) }}</p>
        <p v-else-if="!session.device.screenId" class="mt-1 text-xs text-gray-500">{{ t('scan.phoneApp.noTargetHint') }}</p>
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


      <!-- Result -->
      <section v-if="result" class="rounded-xl border border-gray-200 bg-white p-4" aria-live="polite">
        <p class="text-xs text-gray-500">{{ t('scan.phone.scanned') }}</p>
        <p class="font-mono text-lg font-semibold text-gray-900" dir="ltr">{{ result.code }}</p>
        <p v-if="busy" class="mt-2 flex items-center gap-2 text-sm text-gray-500"><ArrowPathIcon class="h-4 w-4 animate-spin" /> {{ t('common.loading') }}</p>
        <p v-else-if="error" class="mt-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-700" role="alert">{{ error }}</p>
        <template v-else>
          <p v-if="sent" class="mt-2 flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-800">
            <CheckCircleIcon class="h-5 w-5 shrink-0" /> {{ t('scan.phoneApp.sentTo', { name: target?.name }) }}
          </p>
          <p v-else-if="paired && target && !target.online" class="mt-2 flex items-center gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">
            <ExclamationTriangleIcon class="h-5 w-5 shrink-0" /> {{ t('scan.phoneApp.notSent', { name: target.name }) }}
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

      <button v-if="paired" type="button" class="text-center text-sm text-gray-500 underline" @click="disconnect">{{ t('scan.phoneApp.forget') }}</button>
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

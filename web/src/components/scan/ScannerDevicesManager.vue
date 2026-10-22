<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import {
  CheckCircleIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { scannerApi } from '@/api/scanner';
import { usePhoneScanner } from '@/composables/usePhoneScanner';
import { apiErrorMessage } from '@/api/http';
import { formatDateTime, hasManagerRole } from '@/utils/format';
import { settingsApi } from '@/api/misc';
import { useAuthStore } from '@/stores/auth';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

/**
 * Phone scanners: this computer (name, status), the phones authorized for this business (rename, where each one
 * sends its scans, revoke) and "Add a phone" (one-time QR code, valid 10 minutes). Used in the header's Phone
 * window and in Settings.
 */
const { t } = useI18n();
const { state, renameScreen, phoneUrl } = usePhoneScanner();

// "Show cost in CaissePro Scanner" (business setting; managers change it).
const auth = useAuthStore();
const canManage = computed(() => hasManagerRole(auth.currentUser?.roles));
const showCost = ref(false);
const savingCost = ref(false);
settingsApi
  .getTenantSettings()
  .then((r) => (showCost.value = !!r?.settings?.scannerShowCost))
  .catch(() => undefined);
async function toggleCost() {
  const next = !showCost.value;
  savingCost.value = true;
  try {
    await settingsApi.updatePreferences({ scannerShowCost: next });
    showCost.value = next;
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    savingCost.value = false;
  }
}

const devices = ref([]);
const screens = ref([]);
const loading = ref(true);
const error = ref('');

async function load() {
  try {
    const r = await scannerApi.devices();
    devices.value = r.devices;
    screens.value = r.screens;
    error.value = '';
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
// A phone added or removed elsewhere (event from the server) refreshes the list.
watch(() => state.devicesVersion, load);
let refresh = null;
onMounted(() => {
  load();
  refresh = setInterval(load, 20_000); // last seen / computers online
});
onBeforeUnmount(() => {
  clearInterval(refresh);
  clearInterval(pairPoll);
});

const screenName = (id) => screens.value.find((s) => s.id === id)?.name;
const seenRecently = (d) => d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 2 * 60_000;

// ── This computer ──
const editingScreen = ref(false);
const screenDraft = ref('');
function editScreen() {
  screenDraft.value = state.screen?.name || '';
  editingScreen.value = true;
}
async function saveScreen() {
  const n = screenDraft.value.trim();
  if (!n) return;
  await renameScreen(n).catch((e) => (error.value = apiErrorMessage(e)));
  editingScreen.value = false;
  load();
}

// ── Phones ──
const editingId = ref(null);
const nameDraft = ref('');
function editDevice(d) {
  editingId.value = d.id;
  nameDraft.value = d.name;
}
async function saveDevice(d) {
  const n = nameDraft.value.trim();
  if (n && n !== d.name) await scannerApi.updateDevice(d.id, { name: n }).catch((e) => (error.value = apiErrorMessage(e)));
  editingId.value = null;
  load();
}
async function setTarget(d, screenId) {
  await scannerApi.updateDevice(d.id, { screenId: screenId || null }).catch((e) => (error.value = apiErrorMessage(e)));
  load();
}
const toRevoke = ref(null);
async function revoke() {
  const d = toRevoke.value;
  toRevoke.value = null;
  await scannerApi.revokeDevice(d.id).catch((e) => (error.value = apiErrorMessage(e)));
  load();
}

// ── Add a phone ──
const pairing = ref(null); // { id, token, expiresAt, status, device }
const qr = ref('');
const host = ref('');
const copied = ref(false);
let pairPoll = null;
const url = computed(() => (pairing.value ? phoneUrl(pairing.value.token, host.value) : ''));
const needsHttps = computed(() => url.value.startsWith('http:'));
const onLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
watch(url, async (u) => (qr.value = u ? await QRCode.toDataURL(u, { width: 260, margin: 1, errorCorrectionLevel: 'M' }).catch(() => '') : ''));

async function addPhone() {
  error.value = '';
  try {
    const r = await scannerApi.pair(state.screen?.id);
    host.value = host.value || r.lanAddresses?.[0] || '';
    if (!state.lanAddresses.length) state.lanAddresses = r.lanAddresses || [];
    pairing.value = { id: r.pairing.id, token: r.token, expiresAt: r.pairing.expiresAt, status: 'waiting', device: null };
    clearInterval(pairPoll);
    pairPoll = setInterval(checkPairing, 2000);
  } catch (e) {
    error.value = apiErrorMessage(e);
  }
}
async function checkPairing() {
  if (!pairing.value) return clearInterval(pairPoll);
  const r = await scannerApi.pairing(pairing.value.id).catch(() => null);
  if (!r || r.status === 'waiting') return;
  clearInterval(pairPoll);
  pairing.value = { ...pairing.value, status: r.status, device: r.device, token: r.status === 'used' ? '' : pairing.value.token };
  if (r.status === 'used') load();
}
function closePairing() {
  clearInterval(pairPoll);
  pairing.value = null;
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
  <div class="space-y-5 text-sm">
    <p v-if="error" class="rounded-lg bg-danger-50 p-3 text-danger-700" role="alert">{{ error }}</p>

    <!-- Cost in the phone app -->
    <section class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
      <div class="min-w-0">
        <p id="scanner-cost-label" class="font-medium text-gray-900">{{ t('scan.devices.showCost') }}</p>
        <p class="mt-0.5 text-xs text-gray-500">{{ t('scan.devices.showCostHint') }}</p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="showCost"
        aria-labelledby="scanner-cost-label"
        :disabled="!canManage || savingCost"
        :title="canManage ? '' : t('scan.devices.managersOnly')"
        :class="['relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', showCost ? 'bg-primary-600' : 'bg-gray-300']"
        @click="toggleCost"
      >
        <span :class="['inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', showCost ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5']" />
      </button>
    </section>

    <!-- This computer -->
    <section class="rounded-lg border border-gray-200 p-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('scan.devices.thisComputer') }}</p>
      <div v-if="editingScreen" class="mt-1 flex gap-2">
        <input v-model="screenDraft" class="input py-1.5" maxlength="40" :aria-label="t('scan.devices.computerName')" @keydown.enter.prevent="saveScreen" />
        <button type="button" class="btn-primary btn-sm" @click="saveScreen"><CheckIcon class="h-4 w-4" /></button>
        <button type="button" class="btn-secondary btn-sm" @click="editingScreen = false"><XMarkIcon class="h-4 w-4" /></button>
      </div>
      <div v-else class="mt-1 flex items-center justify-between gap-2">
        <p class="flex min-w-0 items-center gap-2 font-medium text-gray-900">
          <ComputerDesktopIcon class="h-5 w-5 shrink-0 text-gray-500" />
          <span class="truncate">{{ state.screen?.name || '…' }}</span>
          <span class="h-2 w-2 shrink-0 rounded-full" :class="state.online ? 'bg-success-500' : 'bg-warning-500'" :title="state.online ? t('scan.devices.receiving') : t('scan.pair.reconnecting')" />
        </p>
        <button v-if="state.screen" type="button" class="rounded p-1 text-gray-500 hover:bg-gray-100" :title="t('scan.devices.rename')" :aria-label="t('scan.devices.rename')" @click="editScreen">
          <PencilSquareIcon class="h-4 w-4" />
        </button>
      </div>
      <p class="mt-1 text-xs text-gray-500">{{ state.online ? t('scan.devices.receivingHint') : t('scan.pair.reconnecting') }}</p>
      <p v-if="state.lastScan" class="mt-1 text-xs text-gray-500">
        {{ t('scan.devices.lastScan', { device: state.lastScan.deviceName }) }} <span class="font-mono" dir="ltr">{{ state.lastScan.code }}</span>
      </p>
    </section>

    <!-- Add a phone -->
    <section v-if="pairing" class="rounded-lg border border-primary-200 bg-primary-50/40 p-3">
      <div class="flex items-center justify-between">
        <p class="font-semibold text-gray-900">{{ t('scan.devices.addPhone') }}</p>
        <button type="button" class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="closePairing"><XMarkIcon class="h-4 w-4" /></button>
      </div>
      <template v-if="pairing.status === 'waiting'">
        <div class="mt-2 flex justify-center"><img v-if="qr" :src="qr" :alt="t('scan.pair.qrAlt')" class="h-56 w-56 rounded-lg border border-gray-200 bg-white" /></div>
        <p class="mt-2 text-center text-gray-700">{{ t('scan.devices.scanOnce') }}</p>
        <p class="text-center text-xs text-gray-500">{{ t('scan.devices.qrValid', { date: formatDateTime(pairing.expiresAt) }) }}</p>
        <div v-if="onLocalhost && state.lanAddresses.length > 1" class="mt-2">
          <label class="label text-xs" for="pair-host">{{ t('scan.pair.network') }}</label>
          <select id="pair-host" v-model="host" class="input py-1.5 text-sm" dir="ltr">
            <option v-for="a in state.lanAddresses" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <p v-else-if="onLocalhost && !state.lanAddresses.length" class="mt-2 rounded-lg bg-warning-50 p-2 text-warning-900">{{ t('scan.pair.noNetwork') }}</p>
        <div class="mt-2 flex gap-2">
          <input :value="url" readonly class="input font-mono text-xs" dir="ltr" :aria-label="t('scan.pair.link')" @focus="$event.target.select()" />
          <button type="button" class="btn-secondary" :title="t('scan.pair.copy')" @click="copy">
            <CheckCircleIcon v-if="copied" class="h-5 w-5 text-success-600" /><ClipboardDocumentIcon v-else class="h-5 w-5" />
          </button>
        </div>
        <div v-if="needsHttps" class="mt-2 rounded-lg border border-warning-200 bg-warning-50 p-2 text-warning-900" role="alert">
          <p class="flex items-center gap-1.5 font-semibold"><ExclamationTriangleIcon class="h-5 w-5" /> {{ t('scan.pair.httpsTitle') }}</p>
          <p class="mt-1">{{ t('scan.pair.httpsHint') }}</p>
          <code class="mt-1 block rounded bg-white/70 px-2 py-1 font-mono text-xs" dir="ltr">npm run dev:phone</code>
        </div>
      </template>
      <p v-else-if="pairing.status === 'used'" class="mt-2 flex items-center gap-1.5 font-medium text-success-700">
        <CheckCircleIcon class="h-5 w-5" /> {{ t('scan.devices.added', { name: pairing.device?.name }) }}
      </p>
      <div v-else class="mt-2 flex items-center justify-between gap-2 text-warning-900">
        <span>{{ t('scan.devices.qrExpired') }}</span>
        <button type="button" class="btn-secondary btn-sm" @click="addPhone">{{ t('scan.pair.newQr') }}</button>
      </div>
    </section>

    <!-- Phones -->
    <section>
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('scan.devices.phones') }}</p>
        <button v-if="!pairing || pairing.status !== 'waiting'" type="button" class="btn-primary btn-sm" @click="addPhone"><PlusIcon class="h-4 w-4" /> {{ t('scan.devices.addPhone') }}</button>
      </div>
      <p v-if="loading" class="text-gray-500">{{ t('common.loading') }}</p>
      <p v-else-if="!devices.length" class="rounded-lg bg-gray-50 p-3 text-gray-600">{{ t('scan.devices.none') }}</p>
      <ul v-else class="divide-y divide-gray-100 rounded-lg border border-gray-200">
        <li v-for="d in devices" :key="d.id" class="space-y-2 p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div v-if="editingId === d.id" class="flex gap-2">
                <input v-model="nameDraft" class="input py-1.5" maxlength="40" :aria-label="t('scan.devices.phoneName')" @keydown.enter.prevent="saveDevice(d)" />
                <button type="button" class="btn-primary btn-sm" @click="saveDevice(d)"><CheckIcon class="h-4 w-4" /></button>
              </div>
              <p v-else class="flex items-center gap-2 font-medium text-gray-900">
                <DevicePhoneMobileIcon class="h-5 w-5 shrink-0 text-gray-500" />
                <span class="truncate">{{ d.name }}</span>
                <span class="h-2 w-2 shrink-0 rounded-full" :class="seenRecently(d) ? 'bg-success-500' : 'bg-gray-300'" />
              </p>
              <p class="mt-0.5 text-xs text-gray-500">
                {{ d.lastSeenAt ? t('scan.devices.lastSeen', { date: formatDateTime(d.lastSeenAt) }) : '' }} · {{ t('scan.devices.scans', { n: d.scanCount }) }}
                <template v-if="d.authorizedBy"> · {{ t('scan.devices.authorizedBy', { name: d.authorizedBy }) }}</template>
              </p>
            </div>
            <div class="flex shrink-0 gap-1">
              <button type="button" class="rounded p-1 text-gray-500 hover:bg-gray-100" :title="t('scan.devices.rename')" :aria-label="t('scan.devices.rename')" @click="editDevice(d)">
                <PencilSquareIcon class="h-4 w-4" />
              </button>
              <button type="button" class="rounded px-2 py-1 text-xs font-medium text-danger-700 hover:bg-danger-50" @click="toRevoke = d">{{ t('scan.devices.revoke') }}</button>
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs text-gray-600">
            <span class="shrink-0">{{ t('scan.devices.sendsTo') }}</span>
            <select class="input py-1 text-xs" :value="d.screenId || ''" @change="setTarget(d, $event.target.value)">
              <option value="">{{ t('scan.devices.noComputer') }}</option>
              <option v-for="s in screens" :key="s.id" :value="s.id">{{ s.name }}{{ s.id === state.screen?.id ? ` (${t('scan.devices.thisOne')})` : '' }}{{ s.online ? ' ●' : '' }}</option>
            </select>
          </label>
          <p v-if="d.screenId && !screenName(d.screenId)" class="text-xs text-warning-700">{{ t('scan.devices.computerGone') }}</p>
        </li>
      </ul>
      <p class="mt-2 text-xs text-gray-500">{{ t('scan.devices.security') }}</p>
    </section>

    <ConfirmModal
      :show="!!toRevoke"
      :title="t('scan.devices.revokeTitle', { name: toRevoke?.name })"
      :message="t('scan.devices.revokeMessage')"
      :confirm-text="t('scan.devices.revoke')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="revoke"
      @cancel="toRevoke = null"
    />
  </div>
</template>

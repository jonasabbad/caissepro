<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, VideoCameraSlashIcon, XMarkIcon } from '@heroicons/vue/24/outline';

/**
 * Camera barcode scanner (EAN-13 / EAN-8 / UPC / Code 128 / Code 39 / ITF — product, box, IMEI and serial barcodes).
 * Uses the browser's native BarcodeDetector when it has one, otherwise ZXing (@zxing/browser, MIT). The same window
 * accepts a USB / Bluetooth scanner or typing in its field, so it also works without a camera.
 * Emits `scan(code)` once per opening (a repeated read of the same code is ignored), then the caller closes it.
 */
const props = defineProps({ open: Boolean, title: { type: String, default: '' } });
const emit = defineEmits(['scan', 'close']);
const { t } = useI18n();

const video = ref(null);
const manualInput = ref(null);
const manual = ref('');
const status = ref('idle'); // idle | starting | scanning | error
const error = ref(''); // insecure | denied | nocamera | failed
const cameras = ref([]);
const cameraId = ref('');
let controls = null;
let stream = null;
let rafId = 0;
let done = false;

const FORMATS_NATIVE = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

function feedback() {
  try {
    navigator.vibrate?.(60);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio: the result is shown anyway */
  }
}

function deliver(raw) {
  const code = String(raw || '').trim();
  if (!code || done) return;
  done = true;
  feedback();
  stop();
  emit('scan', code);
}

function stop() {
  cancelAnimationFrame(rafId);
  try {
    controls?.stop();
  } catch {
    /* already stopped */
  }
  controls = null;
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
  if (video.value) video.value.srcObject = null;
}

const backFirst = (list) => [...list].sort((a, b) => Number(/back|rear|environment|arrière/i.test(b.label)) - Number(/back|rear|environment|arrière/i.test(a.label)));

async function start() {
  stop();
  done = false;
  error.value = '';
  if (!window.isSecureContext) return ((status.value = 'error'), (error.value = 'insecure'));
  if (!navigator.mediaDevices?.getUserMedia) return ((status.value = 'error'), (error.value = 'nocamera'));
  status.value = 'starting';
  await nextTick();
  try {
    const constraints = { video: cameraId.value ? { deviceId: { exact: cameraId.value } } : { facingMode: { ideal: 'environment' } }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Camera names are only readable once permission is granted.
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    cameras.value = backFirst(devices);
    if (!cameraId.value) cameraId.value = stream.getVideoTracks()[0]?.getSettings?.().deviceId || cameras.value[0]?.deviceId || '';
    video.value.srcObject = stream;
    await video.value.play();
    status.value = 'scanning';
    if ('BarcodeDetector' in window) {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const detector = new window.BarcodeDetector({ formats: FORMATS_NATIVE.filter((f) => supported.includes(f)) });
      const tick = async () => {
        if (!stream || done) return;
        try {
          const found = await detector.detect(video.value);
          if (found[0]?.rawValue) return deliver(found[0].rawValue);
        } catch {
          /* frame not ready */
        }
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } else {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
      const hints = new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF],
        ],
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      controls = await reader.decodeFromStream(stream, video.value, (result) => result && deliver(result.getText()));
    }
  } catch (e) {
    stop();
    status.value = 'error';
    error.value = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'nocamera' : 'failed';
  }
}

function submitManual() {
  deliver(manual.value);
  manual.value = '';
}
function close() {
  stop();
  emit('close');
}

watch(
  () => props.open,
  async (o) => {
    if (o) {
      manual.value = '';
      await nextTick();
      manualInput.value?.focus();
      start();
    } else stop();
  },
  { immediate: true },
);
watch(cameraId, (id, old) => old && id && id !== old && props.open && start());
onBeforeUnmount(stop);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="close">
      <div class="modal-content max-w-md" role="dialog" :aria-label="title || t('scan.title')">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-gray-900">{{ title || t('scan.title') }}</h3>
          <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="close"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div dir="ltr" class="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
            <video ref="video" class="h-full w-full object-cover" muted playsinline />
            <div v-if="status === 'scanning'" class="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80">
              <div class="absolute inset-x-2 top-1/2 h-0.5 bg-danger-500/80" />
            </div>
            <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('scan.starting') }}
            </div>
            <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
              <VideoCameraSlashIcon class="h-8 w-8 text-white/70" />
              <p>{{ t(`scan.errors.${error}`) }}</p>
              <button v-if="error !== 'insecure'" type="button" class="btn-secondary btn-sm" @click="start">{{ t('common.retry') }}</button>
            </div>
          </div>
          <p v-if="status === 'scanning'" class="text-center text-xs text-gray-500">{{ t('scan.aim') }}</p>
          <div v-if="cameras.length > 1">
            <label class="label text-xs" for="scan-camera">{{ t('scan.camera') }}</label>
            <select id="scan-camera" v-model="cameraId" class="input py-1.5 text-sm">
              <option v-for="(c, i) in cameras" :key="c.deviceId" :value="c.deviceId">{{ c.label || `${t('scan.camera')} ${i + 1}` }}</option>
            </select>
          </div>
          <form class="flex gap-2" @submit.prevent="submitManual">
            <input
              ref="manualInput"
              v-model="manual"
              class="input font-mono"
              dir="ltr"
              inputmode="text"
              autocomplete="off"
              :placeholder="t('scan.manualPlaceholder')"
              :aria-label="t('scan.manualPlaceholder')"
            />
            <button type="submit" class="btn-primary" :disabled="!manual.trim()">{{ t('scan.use') }}</button>
          </form>
          <p class="text-xs text-gray-500">{{ t('scan.usbHint') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

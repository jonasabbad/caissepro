<script setup>
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, VideoCameraSlashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { useBarcodeCamera } from '@/composables/useBarcodeCamera';

/**
 * Camera barcode scanner window (see useBarcodeCamera for formats and decoding). The same window accepts a USB /
 * Bluetooth scanner or typing in its field, so it also works without a camera.
 * Emits `scan(code)` once per opening (a repeated read of the same code is ignored), then the caller closes it.
 */
const props = defineProps({ open: Boolean, title: { type: String, default: '' } });
const emit = defineEmits(['scan', 'close']);
const { t } = useI18n();

const video = ref(null);
const manualInput = ref(null);
const manual = ref('');
const { status, error, cameras, cameraId, start, stop, submit } = useBarcodeCamera(video, (code) => emit('scan', code));

function submitManual() {
  submit(manual.value);
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
            <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/80" dir="auto">
              <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('scan.starting') }}
            </div>
            <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
              <VideoCameraSlashIcon class="h-8 w-8 text-white/70" />
              <p dir="auto">{{ t(`scan.errors.${error}`) }}</p>
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

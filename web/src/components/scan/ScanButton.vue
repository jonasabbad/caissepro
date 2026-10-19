<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ViewfinderCircleIcon } from '@heroicons/vue/24/outline';
import CameraScanner from './CameraScanner.vue';

/** Button that opens the camera scanner and emits `scan(code)`; `label` shows text next to the icon. */
defineProps({ label: { type: String, default: '' }, title: { type: String, default: '' }, buttonClass: { type: String, default: 'btn-secondary' } });
const emit = defineEmits(['scan']);
const { t } = useI18n();
const open = ref(false);
function onScan(code) {
  open.value = false;
  emit('scan', code);
}
</script>

<template>
  <button type="button" :class="[buttonClass, 'inline-flex shrink-0 items-center gap-2']" :title="title || t('scan.button')" :aria-label="title || t('scan.button')" @click="open = true">
    <ViewfinderCircleIcon class="h-5 w-5" />
    <span v-if="label">{{ label }}</span>
  </button>
  <CameraScanner :open="open" :title="title" @scan="onScan" @close="open = false" />
</template>

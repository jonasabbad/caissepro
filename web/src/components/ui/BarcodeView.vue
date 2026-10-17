<script setup>
import { computed } from 'vue';
import { barcodeSvg, formatBarcodeText } from '@/utils/barcode';

/** On-screen barcode with its digits underneath. */
const props = defineProps({ value: { type: String, default: '' }, height: { type: String, default: '3.5rem' } });
const svg = computed(() => barcodeSvg(props.value));
</script>

<template>
  <div v-if="value" class="inline-flex flex-col items-center">
    <!-- eslint-disable-next-line vue/no-v-html -- SVG built locally by JsBarcode from the product code -->
    <div v-if="svg" class="w-56 max-w-full" :style="{ height }" v-html="svg" />
    <span class="mt-1 font-mono text-sm tracking-wider text-gray-800">{{ formatBarcodeText(value) }}</span>
  </div>
</template>

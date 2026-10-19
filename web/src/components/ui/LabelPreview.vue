<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { normalizeLayout, pageOf, renderLabelsDocument } from '@/utils/labelRenderer';

/**
 * Shows the first printed page of a sticker layout, rendered by the same code as printing and scaled to fit.
 * `labels` fill the page (repeated if needed) so roll widths and sheets look like the real output.
 */
const props = defineProps({
  layout: { type: Object, required: true },
  labels: { type: Array, default: () => [] },
  fill: { type: Boolean, default: true },
  maxHeight: { type: Number, default: 260 },
  title: { type: String, default: 'Preview' },
});
const MM = 96 / 25.4;
const box = ref(null);
const width = ref(320);
let ro;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width));
  if (box.value) ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());

const l = computed(() => normalizeLayout(props.layout));
const page = computed(() => pageOf(l.value));
const html = computed(() => {
  if (!props.labels.length) return '';
  const n = props.fill ? page.value.perPage : Math.min(props.labels.length, page.value.perPage);
  const labels = Array.from({ length: n }, (_, i) => props.labels[i % props.labels.length]);
  return renderLabelsDocument([{ layout: l.value, labels }], { preview: true, title: props.title });
});
const scale = computed(() => {
  const w = page.value.width * MM;
  const h = page.value.height * MM;
  return Math.min(3, (width.value - 8) / w, props.maxHeight / h);
});
const frameStyle = computed(() => ({
  width: `${page.value.width}mm`,
  height: `${page.value.height}mm`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}));
const holderStyle = computed(() => ({ width: `${page.value.width * MM * scale.value}px`, height: `${page.value.height * MM * scale.value}px` }));
</script>

<template>
  <!-- dir="ltr": a physical preview of the sticker; in right-to-left pages the scaled frame would leave its box. -->
  <div ref="box" dir="ltr" class="flex w-full justify-center rounded-lg bg-gray-100 p-2">
    <div :style="holderStyle" class="overflow-hidden shadow-sm">
      <iframe v-if="html" :srcdoc="html" :style="frameStyle" class="box-content border-0 bg-white" :title="title" />
    </div>
  </div>
</template>

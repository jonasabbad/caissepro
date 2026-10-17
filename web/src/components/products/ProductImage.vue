<script setup>
import { computed, ref, watch } from 'vue';
import { PhotoIcon } from '@heroicons/vue/24/outline';

/** A product photo, or a neutral placeholder with the product's initials when there is none (or it fails to load). */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm (cart thumbnail) | md (grid card)
});

const failed = ref(false);
watch(
  () => props.src,
  () => (failed.value = false),
);
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w[0] || ''))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join(''),
);
// A stable soft tint per product so placeholders are easy to tell apart.
const TINTS = ['bg-slate-100 text-slate-500', 'bg-sky-50 text-sky-600', 'bg-emerald-50 text-emerald-600', 'bg-amber-50 text-amber-600', 'bg-rose-50 text-rose-600', 'bg-violet-50 text-violet-600'];
const tint = computed(() => TINTS[[...props.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length]);
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="name"
    loading="lazy"
    decoding="async"
    class="h-full w-full object-cover"
    @error="failed = true"
  />
  <div v-else :class="['flex h-full w-full flex-col items-center justify-center select-none', tint]" :aria-label="name" role="img">
    <PhotoIcon :class="size === 'sm' ? 'h-4 w-4 opacity-60' : 'h-7 w-7 opacity-50'" />
    <span v-if="size !== 'sm' && initials" class="mt-1 text-sm font-semibold tracking-wide opacity-80">{{ initials }}</span>
  </div>
</template>

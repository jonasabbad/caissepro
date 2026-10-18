<script setup>
import { computed, ref, watch } from 'vue';
import { ComputerDesktopIcon, DevicePhoneMobileIcon, DeviceTabletIcon, ClockIcon } from '@heroicons/vue/24/outline';

/** A device's own photo, or a neutral placeholder showing its type and brand when it has none (or it fails to load). */
const props = defineProps({
  unit: { type: Object, required: true },
  size: { type: String, default: 'md' }, // sm (table thumbnail) | md (card)
});
const failed = ref(false);
watch(
  () => props.unit.imageUrl,
  () => (failed.value = false),
);
const ICONS = { phone: DevicePhoneMobileIcon, tablet: DeviceTabletIcon, laptop: ComputerDesktopIcon, macbook: ComputerDesktopIcon, watch: ClockIcon };
const icon = computed(() => ICONS[props.unit.deviceType] || DevicePhoneMobileIcon);
const TINTS = { phone: 'from-sky-50 to-blue-100 text-blue-500', tablet: 'from-indigo-50 to-violet-100 text-violet-500', laptop: 'from-gray-50 to-gray-200 text-gray-500', macbook: 'from-slate-50 to-slate-200 text-slate-500', watch: 'from-emerald-50 to-teal-100 text-teal-600' };
const tint = computed(() => TINTS[props.unit.deviceType] || TINTS.phone);
const alt = computed(() => [props.unit.brand, props.unit.model].filter(Boolean).join(' '));
</script>

<template>
  <img v-if="unit.imageUrl && !failed" :src="unit.imageUrl" :alt="alt" loading="lazy" decoding="async" class="h-full w-full object-cover" @error="failed = true" />
  <div v-else :class="['flex h-full w-full select-none flex-col items-center justify-center bg-gradient-to-br', tint]" role="img" :aria-label="alt">
    <component :is="icon" :class="size === 'sm' ? 'h-5 w-5' : 'h-10 w-10 opacity-70'" />
    <span v-if="size !== 'sm' && unit.brand" class="mt-1.5 max-w-[90%] truncate text-xs font-semibold uppercase tracking-wide opacity-80">{{ unit.brand }}</span>
  </div>
</template>

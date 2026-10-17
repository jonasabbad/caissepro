<script setup>
import { computed } from 'vue';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  title: String,
  value: String,
  subtitle: String,
  change: Number,
  icon: [Object, Function],
  color: { type: String, default: 'blue' }, // blue | green | amber | red
});
const COLORS = {
  blue: { border: 'border-s-black', bg: 'bg-gray-100', icon: 'text-black' },
  green: { border: 'border-s-success-500', bg: 'bg-success-50', icon: 'text-success-600' },
  amber: { border: 'border-s-gray-400', bg: 'bg-gray-100', icon: 'text-gray-600' },
  red: { border: 'border-s-danger-500', bg: 'bg-danger-50', icon: 'text-danger-600' },
};
const c = computed(() => COLORS[props.color] || COLORS.blue);
const changeClass = computed(() => (props.change == null ? '' : props.change >= 0 ? 'text-success-600' : 'text-danger-600'));
</script>

<template>
  <div :class="['bg-white rounded-xl shadow-sm border border-gray-100 p-5 border-s-4', c.border]">
    <div class="flex items-start justify-between mb-4">
      <div :class="['w-12 h-12 rounded-xl flex items-center justify-center', c.bg]"><component :is="icon" :class="['w-6 h-6', c.icon]" /></div>
      <div v-if="change != null" :class="['flex items-center text-sm font-medium', changeClass]">
        <component :is="change >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon" class="w-4 h-4 me-1" />
        <span>{{ $ltr(`${change >= 0 ? '+' : ''}${change.toFixed(1)}%`) }}</span>
      </div>
    </div>
    <div class="text-sm font-medium text-gray-500">{{ title }}</div>
    <div class="text-2xl font-bold text-gray-900 mt-1">{{ value }}</div>
    <div v-if="subtitle" class="text-sm text-gray-500 mt-1">{{ subtitle }}</div>
  </div>
</template>

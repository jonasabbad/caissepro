<script setup>
// Placeholder wordmark. Replace with your own logo artwork.
import { APP_CONFIG } from '@/config/constants';

defineProps({ size: { type: String, default: 'md' }, light: Boolean });
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-2 font-extrabold tracking-tight',
      light ? 'text-white' : 'text-gray-900',
      size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl',
    ]"
  >
    <span
      :class="[
        'inline-flex items-center justify-center rounded-xl bg-gray-900 font-black text-white',
        light && 'bg-white text-gray-900',
        size === 'lg' ? 'h-14 w-14 text-2xl' : size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg',
      ]"
      >CP</span
    >
    {{ APP_CONFIG.name }}
  </span>
</template>

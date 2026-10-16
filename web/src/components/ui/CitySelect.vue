<script setup>
import SearchableSelect from './SearchableSelect.vue';
import { MOROCCAN_CITIES } from '@/config/cities';

defineProps({ modelValue: { type: String, default: '' }, placeholder: { type: String, default: '' }, disabled: Boolean });
defineEmits(['update:modelValue']);
const options = MOROCCAN_CITIES.map((c) => ({ value: c, label: c }));
</script>

<template>
  <SearchableSelect
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder || '-'"
    :disabled="disabled"
    allow-custom
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

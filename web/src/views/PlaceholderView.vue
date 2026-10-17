<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="card p-8 text-center text-gray-500">
    <p class="font-medium text-gray-900">{{ route.name }}</p>
    <p class="mt-1 text-sm">{{ $t('common.underConstruction') }}</p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
    <p class="text-6xl font-extrabold text-gray-900">404</p>
    <p class="mt-4 text-lg text-gray-600">{{ t('errors.notFound') }}</p>
    <RouterLink to="/" class="btn-primary mt-8">{{ t('common.backToHome') }}</RouterLink>
  </div>
</template>

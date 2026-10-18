<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

const route = useRoute();
const { t, te } = useI18n();
// The page's translated title when one exists (e.g. subscription → subscription.title), else the route name.
const title = computed(() => {
  const name = String(route.name ?? '');
  const key = [`nav.${name}`, `${name}.title`].find((k) => te(k));
  return key ? t(key) : name;
});
</script>

<template>
  <div class="card p-8 text-center text-gray-500">
    <p class="font-medium text-gray-900">{{ title }}</p>
    <p class="mt-1 text-sm">{{ $t('common.underConstruction') }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { locale, t } = useI18n();
const route = useRoute();

// Some public pages force their language (e.g. /ar).
const effectiveLocale = computed(() => route.meta?.locale ?? locale.value);
const isRtl = computed(() => effectiveLocale.value === 'ar');

watch(
  effectiveLocale,
  (l) => {
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
  },
  { immediate: true },
);

const updateAvailable = ref(false);
const onUpdate = () => (updateAvailable.value = true);
const reload = () => window.location.reload();
onMounted(() => window.addEventListener('sw-update-available', onUpdate));
onUnmounted(() => window.removeEventListener('sw-update-available', onUpdate));
</script>

<template>
  <div :dir="isRtl ? 'rtl' : 'ltr'" :class="{ 'font-arabic': isRtl }">
    <Transition name="slide-down">
      <div
        v-if="updateAvailable"
        class="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-between gap-3 bg-blue-600 px-4 py-3 text-white shadow-lg"
      >
        <span class="text-sm font-medium">{{ t('pwa.updateAvailable') }}</span>
        <button class="rounded-md bg-white px-3 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50" @click="reload">
          {{ t('pwa.refresh') }}
        </button>
      </div>
    </Transition>
    <RouterView />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckIcon, LanguageIcon } from '@heroicons/vue/24/outline';
import { LOCALES, LOCALE_NAMES } from '@/i18n';
import { useAuthStore } from '@/stores/auth';

/** Language menu (Français / English / العربية). The choice is kept on this device and saved to the signed-in user. */
defineProps({ compact: { type: Boolean, default: false } });
const { locale } = useI18n();
const auth = useAuthStore();
const open = ref(false);
const root = ref(null);
const SHORT = { fr: 'FR', en: 'EN', ar: 'ع' };

function choose(l) {
  open.value = false;
  auth.setLanguage(l);
}
const onDoc = (e) => root.value && !root.value.contains(e.target) && (open.value = false);
onMounted(() => document.addEventListener('click', onDoc));
onBeforeUnmount(() => document.removeEventListener('click', onDoc));
</script>

<template>
  <div ref="root" class="relative" data-testid="language-switcher">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      :aria-label="LOCALE_NAMES[locale]"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <LanguageIcon class="h-4 w-4" />
      <span>{{ compact ? SHORT[locale] : LOCALE_NAMES[locale] }}</span>
    </button>
    <ul v-if="open" role="listbox" class="absolute end-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <li v-for="l in LOCALES" :key="l">
        <button
          type="button"
          role="option"
          :aria-selected="l === locale"
          :lang="l"
          :class="['flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-gray-50', l === locale ? 'font-semibold text-gray-900' : 'text-gray-700']"
          @click="choose(l)"
        >
          {{ LOCALE_NAMES[l] }}
          <CheckIcon v-if="l === locale" class="h-4 w-4" />
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
// Platform announcements, shown to admins until dismissed (dismissals kept in localStorage).
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { announcementsApi } from '@/api/misc';
import { useAuthStore } from '@/stores/auth';
import { Roles } from '@/config/constants';

const DISMISSED_KEY = 'dismissed_announcements';

const { locale } = useI18n();
const isRtl = computed(() => locale.value === 'ar');
const auth = useAuthStore();
const isAdmin = computed(() => auth.currentUser?.roles?.includes(Roles.ADMIN));

const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const dismissed = ref(readDismissed());

const { data } = useQuery({ queryKey: ['announcements'], queryFn: () => announcementsApi.getActive(), staleTime: 300_000 });
const visible = computed(() => (data.value ?? []).filter((a) => !dismissed.value.includes(a.id)));

function dismiss(id) {
  dismissed.value = [...dismissed.value, id];
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.value));
}

const iconFor = (type) => (type === 'warning' ? ExclamationTriangleIcon : type === 'success' ? CheckCircleIcon : InformationCircleIcon);
const classFor = (type) =>
  type === 'warning'
    ? 'bg-amber-50 border-b border-amber-200 text-amber-700'
    : type === 'success'
      ? 'bg-green-50 border-b border-green-200 text-green-700'
      : 'bg-blue-50 border-b border-blue-200 text-blue-700';
</script>

<template>
  <div v-if="isAdmin && visible.length > 0" :dir="isRtl ? 'rtl' : 'ltr'" class="print:hidden">
    <div v-for="a in visible" :key="a.id" :class="[classFor(a.type), 'flex items-start justify-between gap-3 px-4 py-3']">
      <div class="flex flex-1 items-start gap-3">
        <component :is="iconFor(a.type)" class="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div class="flex-1 text-start">
          <h3 class="text-sm font-medium">{{ a.title }}</h3>
          <p class="mt-0.5 text-sm opacity-90">{{ a.body }}</p>
        </div>
      </div>
      <button class="flex-shrink-0 p-1 transition-opacity hover:opacity-70" :aria-label="`Dismiss ${a.title}`" @click="dismiss(a.id)">
        <XMarkIcon class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

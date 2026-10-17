<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, CheckIcon, PhoneIcon, WrenchScrewdriverIcon, XCircleIcon } from '@heroicons/vue/24/outline';
import { publicHttp } from '@/api/http';
import { intlLocale } from '@/i18n';
import BrandLogo from '@/components/brand/BrandLogo.vue';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

/** Public page opened by scanning the QR code on a repair ticket: status, estimated date, store contact. */
const { t } = useI18n();
const route = useRoute();
const data = ref(null);
const loading = ref(true);
const notFound = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await publicHttp.get(`/public/repairs/${encodeURIComponent(route.params.token)}`);
    data.value = res.data.data;
    notFound.value = false;
  } catch {
    notFound.value = true;
  } finally {
    loading.value = false;
  }
}
// Status changes show up without reloading while the page stays open.
let timer;
onMounted(() => {
  load();
  timer = setInterval(load, 60_000);
});
onBeforeUnmount(() => clearInterval(timer));
watchEffect(() => (document.title = data.value ? `${t('tracking.title')} — ${data.value.repair.repairNumber}` : t('tracking.title')));

const repair = computed(() => data.value?.repair);
const store = computed(() => data.value?.store);
const day = (d) => (d ? new Date(d).toLocaleDateString(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const when = (d) => (d ? new Date(d).toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const STEPS = ['received', 'in_progress', 'completed', 'delivered'];
const reached = computed(() => {
  const s = repair.value?.status;
  return { pending: 0, in_progress: 1, completed: 2, delivered: 3 }[s] ?? 0;
});
const cancelled = computed(() => repair.value?.status === 'cancelled');
const tel = computed(() => (store.value?.phone ? `tel:${store.value.phone.replace(/\s/g, '')}` : ''));
</script>

<template>
  <div class="min-h-screen bg-gray-50 px-4 py-6">
    <div class="mx-auto max-w-md">
      <div class="mb-6 flex items-center justify-between">
        <BrandLogo size="sm" />
        <LanguageSwitcher compact />
      </div>

      <div v-if="loading && !data" class="flex justify-center py-20"><div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" /></div>

      <div v-else-if="notFound" class="card p-8 text-center">
        <XCircleIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <h1 class="text-lg font-semibold text-gray-900">{{ t('tracking.notFound') }}</h1>
        <p class="mt-2 text-sm text-gray-500">{{ t('tracking.notFoundHint') }}</p>
      </div>

      <template v-else-if="repair">
        <div class="card overflow-hidden">
          <div class="border-b bg-gray-900 px-5 py-4 text-white">
            <p class="text-xs uppercase tracking-wider text-white/60">{{ t('tracking.title') }}</p>
            <h1 class="mt-1 text-xl font-bold">{{ t('tracking.number', { number: repair.repairNumber }) }}</h1>
            <p class="mt-0.5 text-sm text-white/80">{{ store?.name }}</p>
          </div>

          <div class="space-y-5 p-5">
            <div :class="['flex items-start gap-3 rounded-lg p-3', cancelled ? 'bg-red-50 text-red-800' : repair.status === 'completed' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800']">
              <component :is="cancelled ? XCircleIcon : repair.status === 'completed' || repair.status === 'delivered' ? CheckIcon : WrenchScrewdriverIcon" class="mt-0.5 h-5 w-5 shrink-0" />
              <p class="text-sm font-medium">{{ t(`tracking.messages.${repair.status}`) }}</p>
            </div>

            <ol v-if="!cancelled" class="flex items-start justify-between" :aria-label="t('tracking.title')">
              <li v-for="(s, i) in STEPS" :key="s" class="flex flex-1 flex-col items-center text-center">
                <div class="flex w-full items-center">
                  <div :class="['h-0.5 flex-1', i === 0 ? 'opacity-0' : i <= reached ? 'bg-gray-900' : 'bg-gray-200']" />
                  <div :class="['flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', i <= reached ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500']">
                    <CheckIcon v-if="i < reached || (i === reached && i === 3)" class="h-4 w-4" />
                    <span v-else>{{ i + 1 }}</span>
                  </div>
                  <div :class="['h-0.5 flex-1', i === STEPS.length - 1 ? 'opacity-0' : i < reached ? 'bg-gray-900' : 'bg-gray-200']" />
                </div>
                <span :class="['mt-1.5 text-xs', i <= reached ? 'font-semibold text-gray-900' : 'text-gray-500']" :aria-current="i === reached ? 'step' : undefined">{{ t(`tracking.steps.${s}`) }}</span>
              </li>
            </ol>

            <dl class="divide-y text-sm">
              <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('tracking.device') }}</dt><dd class="text-end font-medium text-gray-900">{{ repair.deviceDescription }}</dd></div>
              <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('tracking.received') }}</dt><dd class="text-end text-gray-900">{{ day(repair.receivedAt) }}</dd></div>
              <div v-if="!cancelled && !repair.completedAt" class="flex justify-between gap-4 py-2">
                <dt class="text-gray-500">{{ t('tracking.eta') }}</dt>
                <dd :class="['text-end', repair.estimatedCompletionAt ? 'font-semibold text-gray-900' : 'text-gray-500']">{{ repair.estimatedCompletionAt ? day(repair.estimatedCompletionAt) : t('tracking.etaUnknown') }}</dd>
              </div>
              <div v-if="repair.completedAt" class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('tracking.completedOn') }}</dt><dd class="text-end text-gray-900">{{ day(repair.completedAt) }}</dd></div>
              <div v-if="repair.deliveredAt" class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('tracking.deliveredOn') }}</dt><dd class="text-end text-gray-900">{{ day(repair.deliveredAt) }}</dd></div>
            </dl>

            <div v-if="store?.phone || store?.address" class="rounded-lg bg-gray-50 p-3 text-sm">
              <p class="font-medium text-gray-900">{{ t('tracking.contact') }}</p>
              <p v-if="store.address" class="mt-1 text-gray-600">{{ store.address }}<template v-if="store.city">, {{ store.city }}</template></p>
              <a v-if="tel" :href="tel" class="btn-primary mt-3 inline-flex w-full items-center justify-center gap-2"><PhoneIcon class="h-4 w-4" /> {{ t('tracking.call') }} {{ store.phone }}</a>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>{{ t('tracking.lastUpdate', { date: when(repair.updatedAt) }) }}</span>
          <button class="inline-flex items-center gap-1 hover:text-gray-900" :disabled="loading" @click="load"><ArrowPathIcon :class="['h-3.5 w-3.5', loading && 'animate-spin']" /> {{ t('tracking.refresh') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowRightIcon } from '@heroicons/vue/20/solid';
import { loadLocale } from '@/i18n';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

/** Public home page: a welcome and the way into the app. No store data is loaded here. */
const { t, locale } = useI18n();
const route = useRoute();

// /ar shows the page in Arabic whatever language is saved on this device.
const forced = computed(() => route.meta.locale);
const ready = ref(!forced.value);
if (forced.value) loadLocale(forced.value).finally(() => (ready.value = true));
const lang = computed(() => forced.value ?? locale.value);
const tr = (key) => t(key, {}, { locale: ready.value ? lang.value : locale.value });

// Signed in on this device: go straight to the app (the router asks to sign in again if the session has ended).
const signedIn = (() => {
  try {
    return !!JSON.parse(localStorage.getItem('auth_tokens') || 'null')?.accessToken;
  } catch {
    return false;
  }
})();
const target = signedIn ? '/app' : '/login';
const year = new Date().getFullYear();

watchEffect(() => (document.title = `${tr('app.name')} — ${tr('app.tagline')}`));
</script>

<template>
  <div class="home">
    <div class="home-glow" aria-hidden="true" />
    <div class="home-grid" aria-hidden="true" />

    <header class="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
      <RouterLink to="/" class="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span class="home-mark" aria-hidden="true">C</span>
        <span class="text-base font-semibold tracking-tight text-gray-900">{{ tr('app.name') }}</span>
      </RouterLink>
      <LanguageSwitcher v-if="!forced" compact />
    </header>

    <main class="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-8 sm:px-6">
      <section class="home-hero mx-auto w-full max-w-2xl text-center">
        <p class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur">
          <span class="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
          {{ tr('app.tagline') }}
        </p>
        <h1 class="mt-6 text-balance font-semibold tracking-tight text-gray-900">
          <span class="block text-lg text-gray-500 sm:text-xl">{{ tr('home.welcome') }}</span>
          <span class="home-title mt-1 block text-5xl sm:text-6xl lg:text-7xl">{{ tr('app.name') }}</span>
        </h1>
        <p class="mx-auto mt-5 max-w-md text-pretty text-base leading-relaxed text-gray-600 sm:text-lg">{{ tr('home.message') }}</p>
        <div class="mt-9 flex justify-center">
          <RouterLink
            :to="target"
            class="group inline-flex h-12 items-center gap-2 rounded-xl bg-gray-900 px-6 text-sm font-semibold text-white shadow-lg shadow-gray-900/15 transition-all hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {{ signedIn ? tr('home.openApp') : tr('home.signIn') }}
            <ArrowRightIcon class="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </RouterLink>
        </div>
      </section>
    </main>

    <footer class="relative z-10 px-4 pb-6 text-center text-xs text-gray-400">© {{ year }} {{ tr('app.name') }}. {{ tr('home.rights') }}</footer>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: rgb(248 250 252);
}
/* Soft blue light from the top, as in the sidebar. */
.home-glow {
  position: absolute;
  inset: -20% -10% auto;
  height: 80%;
  background:
    radial-gradient(45% 55% at 50% 30%, rgb(var(--c-brand-500) / 0.16), transparent 70%),
    radial-gradient(30% 35% at 78% 18%, rgb(var(--c-brand-300) / 0.18), transparent 70%),
    radial-gradient(28% 30% at 20% 22%, rgb(var(--c-brand-200) / 0.22), transparent 70%);
  pointer-events: none;
}
/* Faint grid that fades out towards the edges. */
.home-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(15 23 42 / 0.045) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(15 23 42 / 0.045) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(60% 55% at 50% 40%, #000 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(60% 55% at 50% 40%, #000 30%, transparent 75%);
  pointer-events: none;
}
.home-mark {
  display: grid;
  height: 2.25rem;
  width: 2.25rem;
  place-items: center;
  border-radius: 0.625rem;
  background: linear-gradient(135deg, rgb(var(--c-brand-400)), rgb(var(--c-brand-700)));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.25),
    0 4px 12px -2px rgb(var(--c-brand-600) / 0.5);
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.home-title {
  line-height: 1.05;
  letter-spacing: -0.035em;
  background: linear-gradient(180deg, rgb(var(--c-ink)) 30%, rgb(var(--c-brand-700)));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  padding-bottom: 0.06em;
}
.home-hero {
  animation: home-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes home-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-hero {
    animation: none;
  }
}
</style>

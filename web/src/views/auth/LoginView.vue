<script setup>
import { ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/auth';
import { Roles } from '@/config/constants';
import BrandLogo from '@/components/brand/BrandLogo.vue';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const submitting = ref(false);

watchEffect(() => (document.title = `${t('auth.login')} — CaissePro`));

async function submit() {
  if (!email.value || !password.value) {
    error.value = t('errors.required');
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const res = await auth.login(email.value, password.value);
    if (!res.success) {
      error.value = res.error || t('auth.invalidCredentials');
      return;
    }
    if (auth.currentUser?.roles?.includes(Roles.SUPER_ADMIN)) router.push('/app/superadmin');
    else router.push(route.query.redirect || '/app/dashboard');
  } finally {
    submitting.value = false;
  }
}

const inputClass =
  'w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-colors';
</script>

<template>
  <div class="relative flex min-h-screen flex-col justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
    <div class="absolute end-4 top-4"><LanguageSwitcher /></div>
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <RouterLink to="/" class="mb-10 flex justify-center">
        <BrandLogo size="lg" />
      </RouterLink>
      <div>
        <div v-if="error" class="mb-6 rounded-r-lg border-l-4 border-red-500 bg-red-50 p-4">
          <p class="text-sm text-red-700">{{ error }}</p>
        </div>
        <form class="space-y-5" @submit.prevent="submit">
          <div>
            <label for="email" class="mb-2 block text-sm font-medium text-gray-900">{{ t('auth.email') }}</label>
            <input id="email" v-model="email" type="email" autocomplete="email" required :class="inputClass" />
          </div>
          <div>
            <label for="password" class="mb-2 block text-sm font-medium text-gray-900">{{ t('auth.password') }}</label>
            <div class="relative">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                :class="[inputClass, 'pe-10']"
              />
              <button
                type="button"
                class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                @click="showPassword = !showPassword"
              >
                <EyeSlashIcon v-if="showPassword" class="h-5 w-5" />
                <EyeIcon v-else class="h-5 w-5" />
              </button>
            </div>
          </div>
          <button
            type="submit"
            :disabled="submitting"
            class="mt-8 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50"
          >
            <span v-if="submitting" class="flex items-center justify-center gap-2">
              <svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              {{ t('common.loading') }}
            </span>
            <span v-else>{{ t('auth.loginButton') }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

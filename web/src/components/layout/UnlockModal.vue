<script setup>
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close']);
const { t } = useI18n();
const auth = useAuthStore();

const password = ref('');
const error = ref('');
const busy = ref(false);
const input = ref(null);

watch(
  () => props.show,
  async (v) => {
    if (!v) return;
    password.value = '';
    error.value = '';
    await nextTick();
    input.value?.focus();
  },
);

async function submit() {
  if (!password.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await auth.unlock(password.value);
    emit('close');
  } catch (e) {
    const status = e.response?.status;
    error.value = status === 400 || status === 401 ? t('sellerMode.wrongPassword') : e.response?.data?.message || t('common.error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="w-full max-w-sm rounded-xl bg-white">
      <div class="flex items-start justify-between p-6 pb-4">
        <div>
          <h3 class="text-lg font-bold text-gray-900">{{ t('sellerMode.unlockTitle') }}</h3>
          <p class="mt-0.5 text-sm text-gray-500">{{ t('sellerMode.unlockHint') }}</p>
        </div>
        <button class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" @click="emit('close')">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>
      <form class="space-y-4 px-6 pb-6" @submit.prevent="submit">
        <div>
          <label for="unlock-password" class="mb-2 block text-sm font-medium text-gray-700">{{ t('sellerMode.password') }}</label>
          <input
            id="unlock-password"
            ref="input"
            v-model="password"
            type="password"
            autocomplete="new-password"
            class="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
        </div>
        <button
          type="submit"
          :disabled="!password || busy"
          class="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
        >
          {{ t('sellerMode.unlock') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  show: Boolean,
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: 'Confirmer' },
  cancelText: { type: String, default: 'Annuler' },
  type: { type: String, default: 'danger' }, // danger | warning | info | success
  showCancel: { type: Boolean, default: true },
  loading: Boolean,
});
const emit = defineEmits(['confirm', 'cancel']);

const STYLES = {
  danger: { icon: ExclamationTriangleIcon, badge: 'bg-danger-100 text-danger-600', button: 'bg-danger-600 hover:bg-danger-700 text-white' },
  warning: { icon: ExclamationTriangleIcon, badge: 'bg-amber-100 text-amber-600', button: 'bg-amber-600 hover:bg-amber-700 text-white' },
  info: { icon: InformationCircleIcon, badge: 'bg-blue-100 text-blue-600', button: 'bg-blue-600 hover:bg-blue-700 text-white' },
  success: { icon: CheckCircleIcon, badge: 'bg-success-100 text-success-600', button: 'bg-success-600 hover:bg-success-700 text-white' },
};
const style = computed(() => STYLES[props.type] ?? STYLES.danger);

const confirm = () => !props.loading && emit('confirm');
const cancel = () => !props.loading && emit('cancel');
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-to-class="opacity-0">
      <div v-if="show" class="modal-overlay" @click.self="cancel">
        <div class="modal-content max-w-md">
          <div class="p-6">
            <div class="mb-4 flex justify-center">
              <div :class="['flex h-14 w-14 items-center justify-center rounded-full', style.badge]">
                <component :is="style.icon" class="h-7 w-7" />
              </div>
            </div>
            <h3 class="mb-2 text-center text-lg font-semibold text-gray-900">{{ title }}</h3>
            <p class="text-center text-gray-600">{{ message }}</p>
          </div>
          <div class="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <button
              v-if="showCancel"
              type="button"
              :disabled="loading"
              class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-50"
              @click="cancel"
            >
              {{ cancelText }}
            </button>
            <button
              type="button"
              :disabled="loading"
              :class="['flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50', style.button]"
              @click="confirm"
            >
              <span v-if="loading" class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                {{ confirmText }}
              </span>
              <span v-else>{{ confirmText }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

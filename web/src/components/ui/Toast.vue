<script setup>
import { watch } from 'vue';
import { CheckCircleIcon, ExclamationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  show: Boolean,
  message: { type: String, default: '' },
  type: { type: String, default: 'success' }, // success | error | info
  duration: { type: Number, default: 3000 }, // 0 = sticky
});
const emit = defineEmits(['close']);

watch(
  () => props.show,
  (v) => {
    if (v && props.duration !== 0) setTimeout(() => emit('close'), props.duration || 3000);
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div v-if="show" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div
          :class="[
            'flex min-w-72 items-center gap-3 rounded-xl px-4 py-3 shadow-lg',
            type === 'error' ? 'bg-danger-500 text-white' : type === 'info' ? 'bg-gray-800 text-white' : 'bg-success-500 text-white',
          ]"
        >
          <ExclamationCircleIcon v-if="type === 'error'" class="h-5 w-5 flex-shrink-0" />
          <CheckCircleIcon v-else class="h-5 w-5 flex-shrink-0" />
          <span class="font-medium">{{ message }}</span>
          <button class="ms-auto rounded-lg p-1 hover:bg-white/20" @click="emit('close')">
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

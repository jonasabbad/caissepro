<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, PhotoIcon, TrashIcon } from '@heroicons/vue/24/outline';
import { uploadsApi } from '@/api/uploads';
import { compressImage } from '@/utils/image';

/** Product photo picker: compresses in the browser, uploads, and emits the stored URL through v-model. */
const model = defineModel({ type: String, default: '' });
const props = defineProps({ name: { type: String, default: '' } });
const { t } = useI18n();

const input = ref(null);
const busy = ref(false);
const error = ref('');
const dragging = ref(false);

async function useFile(file) {
  if (!file) return;
  error.value = '';
  if (!file.type.startsWith('image/')) {
    error.value = t('products.image.invalid');
    return;
  }
  busy.value = true;
  try {
    model.value = await uploadsApi.image(await compressImage(file));
  } catch (e) {
    error.value = e.response?.data?.message || t('products.image.failed');
  } finally {
    busy.value = false;
    if (input.value) input.value.value = '';
  }
}
const onPick = (e) => useFile(e.target.files?.[0]);
function onDrop(e) {
  dragging.value = false;
  useFile(e.dataTransfer?.files?.[0]);
}
</script>

<template>
  <div>
    <label class="label">{{ t('products.image.label') }}</label>
    <div class="flex items-start gap-4">
      <button
        type="button"
        :class="[
          'relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-400',
        ]"
        :title="t('products.image.choose')"
        @click="input?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <img v-if="model" :src="model" :alt="props.name" class="h-full w-full object-cover" />
        <div v-else class="flex h-full w-full flex-col items-center justify-center text-gray-400">
          <PhotoIcon class="h-8 w-8" />
          <span class="mt-1 text-xs">{{ t('products.image.add') }}</span>
        </div>
        <div v-if="busy" class="absolute inset-0 flex items-center justify-center bg-white/70">
          <ArrowPathIcon class="h-6 w-6 animate-spin text-gray-600" />
        </div>
      </button>
      <div class="space-y-2 text-sm">
        <p class="text-gray-500">{{ t('products.image.hint') }}</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary px-3 py-1.5 text-sm" :disabled="busy" @click="input?.click()">
            {{ model ? t('products.image.replace') : t('products.image.choose') }}
          </button>
          <button v-if="model" type="button" class="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-danger-600 hover:bg-danger-50" :disabled="busy" @click="model = ''">
            <TrashIcon class="h-4 w-4" /> {{ t('products.image.remove') }}
          </button>
        </div>
        <p v-if="error" class="text-danger-600">{{ error }}</p>
      </div>
    </div>
    <input ref="input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onPick" />
  </div>
</template>

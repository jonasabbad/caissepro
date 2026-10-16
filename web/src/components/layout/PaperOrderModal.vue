<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { paperOrdersApi } from '@/api/misc';
import { formatShortDate } from '@/utils/format';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close']);
const { t } = useI18n();
const queryClient = useQueryClient();

const STATUS_CLASS = {
  new: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-amber-100 text-amber-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const paperType = ref('caisse');
const quantity = ref(5);
const note = ref('');
const sent = ref(false);

function reset() {
  paperType.value = 'caisse';
  quantity.value = 5;
  note.value = '';
  sent.value = false;
}
watch(
  () => props.show,
  (v) => v && reset(),
);

const { data } = useQuery({
  queryKey: ['paper-orders', 'mine'],
  queryFn: () => paperOrdersApi.getMine(),
  enabled: computed(() => props.show),
});
const history = computed(() => data.value ?? []);
const canSubmit = computed(() => quantity.value >= 1 && quantity.value <= 1000);

const { mutate, isPending, isError } = useMutation({
  mutationFn: () => paperOrdersApi.create({ paperType: paperType.value, quantity: quantity.value, note: note.value.trim() || undefined }),
  onSuccess: () => {
    sent.value = true;
    queryClient.invalidateQueries({ queryKey: ['paper-orders', 'mine'] });
  },
});

const submit = () => canSubmit.value && mutate();
const typeLabel = computed(() => ({ caisse: t('paperOrders.typeCaisse'), produits: t('paperOrders.typeProduits') }));
const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400';
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white">
      <div class="flex items-start justify-between p-6 pb-4">
        <div>
          <h3 class="text-lg font-bold text-gray-900">{{ t('paperOrders.title') }}</h3>
          <p class="mt-0.5 text-sm text-gray-500">{{ t('paperOrders.subtitle') }}</p>
        </div>
        <button class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600" @click="emit('close')">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <div v-if="sent" class="px-6 pb-6">
        <div class="flex flex-col items-center py-4 text-center">
          <CheckCircleIcon class="h-12 w-12 text-green-500" />
          <p class="mt-3 text-sm font-medium text-gray-900">{{ t('paperOrders.success') }}</p>
        </div>
      </div>

      <form v-else class="space-y-4 px-6 pb-6" @submit.prevent="submit">
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700">{{ t('paperOrders.type') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="type in ['caisse', 'produits']"
              :key="type"
              type="button"
              :class="[
                'rounded-lg border py-2.5 text-sm font-medium transition-colors',
                paperType === type ? 'border-stone-900 bg-stone-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300',
              ]"
              @click="paperType = type"
            >
              {{ typeLabel[type] }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700">{{ t('paperOrders.quantity') }}</label>
          <input v-model.number="quantity" type="number" min="1" max="1000" :class="inputClass" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium text-gray-700">{{ t('paperOrders.note') }}</label>
          <textarea v-model="note" rows="2" :placeholder="t('paperOrders.notePlaceholder')" :class="[inputClass, 'resize-none']" />
        </div>
        <p v-if="isError" class="text-sm text-red-600">{{ t('paperOrders.error') }}</p>
        <button
          type="submit"
          :disabled="!canSubmit || isPending"
          class="w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ isPending ? t('paperOrders.submitting') : t('paperOrders.submit') }}
        </button>
      </form>

      <div v-if="history.length > 0" class="border-t border-gray-100 px-6 py-4">
        <p class="mb-3 text-xs font-medium text-gray-400">{{ t('paperOrders.history') }}</p>
        <div class="space-y-2">
          <div v-for="o in history" :key="o.id" class="flex items-center justify-between text-sm">
            <div class="min-w-0">
              <span class="text-gray-900">{{ typeLabel[o.paperType] }}</span>
              <span class="text-gray-400"> × {{ o.quantity }}</span>
              <span class="block text-xs text-gray-400">{{ formatShortDate(o.createdAt) }}</span>
            </div>
            <span :class="['shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLASS[o.status]]">
              {{ t('paperOrders.status.' + o.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

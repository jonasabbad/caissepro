<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { CheckCircleIcon, MagnifyingGlassIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { soldUnitsApi, formatImei } from '@/api/soldUnits';
import { formatCurrency } from '@/utils/format';
import { conditionBadge } from '@/utils/soldUnitDisplay';

/** Picks which physical device (IMEI) of a catalogue product is being sold. */
const props = defineProps({ isOpen: Boolean, brand: String, model: String, storage: String });
const emit = defineEmits(['close', 'select']);
const { t } = useI18n();

const search = ref('');
const selectedId = ref(null);
const { data, isLoading, refetch } = useQuery({
  queryKey: computed(() => ['available-units', props.brand, props.model, props.storage]),
  queryFn: () => soldUnitsApi.getAvailableForProduct(props.brand, props.model, props.storage),
  enabled: computed(() => props.isOpen && !!props.brand && !!props.model),
});
const units = computed(() => {
  if (!data.value) return [];
  if (!search.value) return data.value;
  const q = search.value.toLowerCase();
  return data.value.filter(
    (u) => u.imei?.includes(q) || u.serialNumber?.toLowerCase().includes(q) || u.color?.toLowerCase().includes(q) || u.storage?.toLowerCase().includes(q),
  );
});
const selected = computed(() => data.value?.find((u) => u.id === selectedId.value) || null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      search.value = '';
      selectedId.value = null;
      refetch();
    }
  },
);

function confirm() {
  if (!selected.value) return;
  emit('select', selected.value);
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between p-5 border-b">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ t('soldUnits.selectUnit') }}</h3>
            <p class="text-sm text-gray-500">{{ brand }} {{ model }} {{ storage ? `- ${storage}` : '' }}</p>
          </div>
          <button class="p-2 hover:bg-gray-100 rounded-lg" @click="emit('close')"><XMarkIcon class="w-5 h-5" /></button>
        </div>
        <div class="p-4 border-b">
          <div class="relative">
            <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input v-model="search" type="text" :placeholder="t('soldUnits.searchByImei')" class="input ps-10" />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="isLoading" class="text-center py-8 text-gray-500">{{ t('common.loading') }}</div>
          <div v-else-if="!units.length" class="text-center py-8">
            <p class="font-medium text-gray-900">{{ t('soldUnits.noUnitsAvailable') }}</p>
            <p class="text-sm text-gray-500 mt-1">{{ t('soldUnits.noUnitsAvailableDesc') }}</p>
          </div>
          <div v-else class="space-y-2">
            <button
              v-for="u in units"
              :key="u.id"
              :class="['w-full p-4 rounded-lg border-2 text-start transition-all', selectedId === u.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300']"
              @click="selectedId = u.id"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 font-medium">{{ u.imei ? 'IMEI' : t('soldUnits.serialNumber') }}</span>
                    <span class="font-mono text-sm font-semibold text-gray-900">{{ u.imei ? formatImei(u.imei) : u.serialNumber || '-' }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <span v-if="u.storage">{{ u.storage }}</span>
                    <span v-if="u.color">{{ u.color }}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <span :class="['px-2 py-0.5 rounded text-xs font-medium', conditionBadge(u.condition)]">{{ t(`soldUnits.conditions.${u.condition}`) }}</span>
                    <span v-if="u.hasWarranty && u.warrantyDays" class="inline-flex items-center gap-1 text-xs text-green-700">
                      <ShieldCheckIcon class="w-3.5 h-3.5" /> {{ u.warrantyDays }} {{ t('common.days') }}
                    </span>
                  </div>
                </div>
                <div class="text-end shrink-0">
                  <p class="font-bold text-gray-900">{{ formatCurrency(u.salePrice) }}</p>
                  <p class="text-xs text-success-600">+{{ formatCurrency(u.profit) }}</p>
                  <CheckCircleIcon v-if="selectedId === u.id" class="w-6 h-6 text-black mt-2 ms-auto" />
                </div>
              </div>
              <p v-if="u.notes" class="text-xs text-gray-500 mt-2">{{ u.notes }}</p>
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between p-4 border-t">
          <p class="text-sm text-gray-500">{{ units.length }} {{ t('soldUnits.unitsAvailable') }}</p>
          <div class="flex gap-2">
            <button class="btn-secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
            <button class="btn-primary" :disabled="!selected" @click="confirm">{{ t('common.confirm') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

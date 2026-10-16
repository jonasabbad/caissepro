<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { formatCurrency } from '@/utils/format';

/** Confirms a return; the refund per line can be lowered (100 / 75 / 50 % shortcuts) to keep a retention. */
const props = defineProps({ isOpen: Boolean, items: { type: Array, default: () => [] }, customerName: String });
const emit = defineEmits(['close', 'confirm']);
const { t } = useI18n();

const refunds = ref({});
watch(
  () => props.items,
  (items) => {
    const next = {};
    items.forEach((i) => (next[i.productId] = i.refundAmount || i.originalAmount || i.total));
    refunds.value = next;
  },
  { immediate: true, deep: true },
);

const original = (i) => i.originalAmount || i.total;
const totalOriginal = computed(() => props.items.reduce((s, i) => s + original(i), 0));
const totalRefund = computed(() => Object.values(refunds.value).reduce((s, v) => s + (Number(v) || 0), 0));
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content max-w-lg">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-900">{{ t('returnMode.confirmTitle') }}</h3>
          <button class="p-1 hover:bg-gray-100 rounded" @click="emit('close')"><XMarkIcon class="w-5 h-5" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div v-if="customerName" class="bg-red-50 border border-red-200 rounded-lg p-3">
            <p class="text-sm text-red-700">{{ t('returnMode.originalCustomer') }}: <span class="font-semibold">{{ customerName }}</span></p>
          </div>
          <div class="space-y-3">
            <p class="text-sm font-medium text-gray-700">{{ t('returnMode.itemsToReturn') }}</p>
            <div v-for="item in items" :key="item.productId" class="bg-gray-50 rounded-lg p-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-medium text-gray-900">{{ item.product.name }}</p>
                  <p class="text-xs text-gray-500">{{ item.product.sku }}</p>
                </div>
                <div class="text-end">
                  <p class="text-xs text-gray-500">{{ t('returnMode.originalPrice') }}</p>
                  <p class="font-semibold text-gray-900">{{ formatCurrency(original(item)) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 shrink-0">{{ t('returnMode.refundAmount') }}:</label>
                <input v-model.number="refunds[item.productId]" type="number" step="0.01" min="0" :max="original(item)" class="input text-sm py-1 flex-1" />
              </div>
              <div class="flex gap-2">
                <button class="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" @click="refunds[item.productId] = original(item)">100%</button>
                <button class="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" @click="refunds[item.productId] = Math.round(original(item) * 0.75)">75%</button>
                <button class="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700" @click="refunds[item.productId] = Math.round(original(item) * 0.5)">50%</button>
              </div>
            </div>
          </div>
          <div class="border-t pt-3 space-y-2">
            <div class="flex justify-between text-sm"><span class="text-gray-600">{{ t('returnMode.totalOriginal') }}</span><span>{{ formatCurrency(totalOriginal) }}</span></div>
            <div class="flex justify-between text-lg font-bold">
              <span class="text-red-700">{{ t('returnMode.totalToRefund') }}</span><span class="text-red-700">{{ formatCurrency(totalRefund) }}</span>
            </div>
            <div v-if="totalRefund < totalOriginal" class="text-xs text-amber-700 bg-amber-50 rounded p-2">
              {{ t('returnMode.partialRefund') }}: {{ formatCurrency(totalOriginal - totalRefund) }} {{ t('returnMode.retained') }}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button class="btn-primary bg-red-600 hover:bg-red-700" :disabled="!items.length" @click="emit('confirm', refunds)">{{ t('returnMode.confirmReturn') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

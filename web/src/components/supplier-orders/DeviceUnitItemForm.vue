<script setup>
// Adds N identical devices to a supplier order; the global price is split evenly across units.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PlusIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import DeviceCatalogSelect from '@/components/sold-units/DeviceCatalogSelect.vue';

const props = defineProps({ deviceType: { type: String, required: true } });
const emit = defineEmits(['add-item', 'cancel']);
const { t } = useI18n();

const device = ref({ brand: '', model: '', storage: '', ram: '', color: '', condition: 'grade_a' });
const totalPrice = ref(0);
const salePrice = ref(0);
const quantity = ref(1);

const name = computed(() => [device.value.brand, device.value.model].filter(Boolean).join(' '));
const canAdd = computed(() => !!device.value.brand && !!device.value.model && quantity.value >= 1 && totalPrice.value > 0);

function add() {
  if (!canAdd.value) return;
  emit('add-item', {
    productName: name.value,
    quantityOrdered: quantity.value,
    unitCost: parseFloat((totalPrice.value / quantity.value).toFixed(2)),
    itemType: 'unit',
    deviceType: props.deviceType,
    brand: device.value.brand,
    model: device.value.model,
    defaultSalePrice: salePrice.value || undefined,
  });
}
</script>

<template>
  <div class="space-y-5 rounded-xl border border-blue-200 bg-blue-50/30 p-5">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold text-gray-900">{{ t('supplierOrders.form.addDevice') }}</h3>
        <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{{ t(`soldUnits.deviceTypes.${deviceType}.name`) }}</span>
      </div>
      <button type="button" class="rounded p-1 text-gray-400 hover:text-gray-600" @click="emit('cancel')"><XMarkIcon class="h-5 w-5" /></button>
    </div>
    <DeviceCatalogSelect v-model="device" :device-type="deviceType" simple />
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label class="label">{{ t('supplierOrders.form.globalPrice') }}</label>
        <div class="relative">
          <input v-model.number="totalPrice" type="number" step="0.01" min="0" class="input pe-12" placeholder="0.00" />
          <span class="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">DH</span>
        </div>
      </div>
      <div>
        <label class="label">{{ t('supplierOrders.form.salePrice') }}</label>
        <div class="relative">
          <input v-model.number="salePrice" type="number" step="0.01" min="0" class="input pe-12" placeholder="0.00" />
          <span class="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">DH</span>
        </div>
      </div>
      <div>
        <label class="label">{{ t('supplierOrders.table.quantity') }} *</label>
        <input v-model.number="quantity" type="number" min="1" max="100" class="input" />
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn-secondary text-sm" @click="emit('cancel')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn-primary inline-flex items-center gap-1 text-sm" :disabled="!canAdd" @click="add">
        <PlusIcon class="h-4 w-4" /> {{ t('supplierOrders.form.addToOrder') }}
      </button>
    </div>
  </div>
</template>

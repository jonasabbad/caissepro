<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowsRightLeftIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import DeviceCatalogSelect from '@/components/sold-units/DeviceCatalogSelect.vue';
import { formatCurrency } from '@/utils/format';

/** Captures the customer's device taken in exchange; it enters stock at its trade-in value. */
const props = defineProps({ isOpen: Boolean, cartTotal: { type: Number, default: 0 } });
const emit = defineEmits(['close', 'confirm']);
const { t } = useI18n();

const blankDevice = () => ({ brand: '', model: '', storage: '', ram: '', color: '', condition: 'grade_a' });
const deviceType = ref('phone');
const device = ref(blankDevice());
const imei = ref('');
const serialNumber = ref('');
const batteryHealth = ref(undefined);
const tradeInValue = ref(undefined);
const estimatedSalePrice = ref(undefined);
const notes = ref('');

const hasBattery = computed(() => deviceType.value !== 'laptop');
const value = computed(() => tradeInValue.value || 0);
const finalAmount = computed(() => Math.max(0, props.cartTotal - value.value));
const margin = computed(() => {
  if (!value.value || !estimatedSalePrice.value) return null;
  const profit = estimatedSalePrice.value - value.value;
  return { profit, percentage: Math.round((profit / value.value) * 100) };
});
const summary = computed(() => [device.value.brand, device.value.model, device.value.storage].filter(Boolean).join(' '));
const valid = computed(() => device.value.brand && device.value.model && device.value.condition && value.value > 0);

const TYPES = computed(() => [
  { value: 'phone', label: t('tradeIn.phone'), icon: '📱' },
  { value: 'tablet', label: t('tradeIn.tablet'), icon: '📲' },
  { value: 'laptop', label: t('tradeIn.laptop'), icon: '💻' },
  { value: 'macbook', label: t('tradeIn.macbook'), icon: '🍎' },
]);

watch(deviceType, () => {
  device.value = blankDevice();
  imei.value = '';
  serialNumber.value = '';
  batteryHealth.value = undefined;
});
watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    deviceType.value = 'phone';
    device.value = blankDevice();
    imei.value = '';
    serialNumber.value = '';
    batteryHealth.value = undefined;
    tradeInValue.value = undefined;
    estimatedSalePrice.value = undefined;
    notes.value = '';
  },
);

function confirm() {
  if (!valid.value) return;
  const d = device.value;
  emit('confirm', {
    brand: d.brand,
    model: d.model,
    deviceType: deviceType.value,
    condition: d.condition,
    tradeInValue: value.value,
    ...(d.storage && { storage: d.storage }),
    ...(d.ram && { ram: d.ram }),
    ...(d.color && { color: d.color }),
    ...(imei.value && { imei: imei.value }),
    ...(serialNumber.value && { serialNumber: serialNumber.value }),
    ...(batteryHealth.value && { batteryHealth: batteryHealth.value }),
    ...(estimatedSalePrice.value && { estimatedSalePrice: estimatedSalePrice.value }),
    ...(notes.value && { notes: notes.value }),
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content max-w-2xl max-h-[92vh] flex flex-col">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><ArrowsRightLeftIcon class="w-5 h-5 text-green-600" /></div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ t('tradeIn.title') }}</h3>
              <p class="text-sm text-gray-500">{{ t('tradeIn.enterDeviceInfo') }}</p>
            </div>
          </div>
          <button class="p-1 hover:bg-gray-100 rounded" @click="emit('close')"><XMarkIcon class="w-5 h-5" /></button>
        </div>

        <div class="modal-body overflow-y-auto space-y-5">
          <section class="space-y-3">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Appareil</h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                v-for="o in TYPES"
                :key="o.value"
                :class="[
                  'p-2.5 rounded-lg border text-center transition-all text-sm',
                  deviceType === o.value ? 'border-green-500 bg-green-50 text-green-700 font-medium shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                ]"
                @click="deviceType = o.value"
              >
                <span class="me-1">{{ o.icon }}</span> {{ o.label }}
              </button>
            </div>
            <DeviceCatalogSelect v-model="device" :device-type="deviceType" />
          </section>
          <hr class="border-gray-100" />

          <section class="space-y-3">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Identification</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-if="deviceType === 'phone'">
                <label class="label">{{ t('tradeIn.imei') }}</label>
                <input v-model="imei" type="text" class="input font-mono text-sm" placeholder="352000000000001" maxlength="15" />
              </div>
              <div>
                <label class="label">{{ t('tradeIn.serialNumber') }}</label>
                <input v-model="serialNumber" type="text" class="input font-mono text-sm" placeholder="C02Y1234..." />
              </div>
              <div v-if="hasBattery">
                <label class="label">{{ t('tradeIn.batteryHealth') }}</label>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-500">0%</span>
                  <span :class="['text-sm font-bold', (batteryHealth ?? 0) >= 80 ? 'text-green-600' : (batteryHealth ?? 0) >= 60 ? 'text-amber-600' : 'text-red-600']">
                    {{ batteryHealth ?? '-' }}%
                  </span>
                  <span class="text-xs text-gray-500">100%</span>
                </div>
                <input
                  :value="batteryHealth ?? 100"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                  @input="batteryHealth = Number($event.target.value)"
                />
              </div>
            </div>
          </section>
          <hr class="border-gray-100" />

          <section class="space-y-3">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Valorisation</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="label">{{ t('tradeIn.tradeInValue') }} *</label>
                <div class="relative">
                  <input
                    v-model.number="tradeInValue"
                    type="number"
                    class="input text-lg font-bold text-green-700 pe-12 border-green-300 focus:border-green-500 focus:ring-green-500"
                    placeholder="0"
                    min="0"
                    step="50"
                  />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-green-400 font-medium">DH</span>
                </div>
              </div>
              <div>
                <label class="label">{{ t('tradeIn.estimatedSalePrice') }}</label>
                <div class="relative">
                  <input
                    v-model.number="estimatedSalePrice"
                    type="number"
                    class="input pe-12"
                    :placeholder="value ? String(Math.round(value * 1.3)) : '0'"
                    min="0"
                    step="50"
                  />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400">DH</span>
                </div>
              </div>
            </div>
            <div
              v-if="margin"
              :class="['flex items-center gap-2 px-3 py-2 rounded-lg text-sm', margin.profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700']"
            >
              <span>{{ margin.profit >= 0 ? '↗' : '↘' }}</span>
              <span>{{ t('common.estimatedMargin') }} <strong>{{ formatCurrency(margin.profit) }}</strong> ({{ $ltr(`${margin.percentage > 0 ? '+' : ''}${margin.percentage}%`) }})</span>
            </div>
            <div>
              <label class="label">{{ t('tradeIn.notes') }}</label>
              <textarea v-model="notes" class="input text-sm" rows="2" :placeholder="t('tradeIn.notesPlaceholder')" />
            </div>
          </section>
        </div>

        <div class="border-t bg-gray-50 px-6 py-4 space-y-2 rounded-b-xl">
          <div v-if="summary" class="flex justify-between text-sm"><span class="text-gray-500">Appareil</span><span class="font-medium">{{ summary }}</span></div>
          <div class="flex justify-between text-sm"><span class="text-gray-500">{{ t('tradeIn.cartTotal') }}</span><span>{{ formatCurrency(cartTotal) }}</span></div>
          <div v-if="value > 0" class="flex justify-between text-sm text-green-700">
            <span>{{ t('tradeIn.tradeInDeduction') }}</span><span>{{ formatCurrency(value, 'DH', '-') }}</span>
          </div>
          <div class="flex justify-between text-lg font-bold"><span>{{ t('tradeIn.finalAmount') }}</span><span>{{ formatCurrency(finalAmount) }}</span></div>
          <div class="flex gap-3 pt-2">
            <button class="btn-secondary flex-1" @click="emit('close')">{{ t('tradeIn.cancel') }}</button>
            <button class="btn-primary flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed" :disabled="!valid" @click="confirm">
              {{ t('tradeIn.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

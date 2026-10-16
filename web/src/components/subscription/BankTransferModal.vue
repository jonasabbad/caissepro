<script setup>
// Renewal by bank transfer. Bank details come from platform settings (configured by the platform admin).
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { formatCurrency } from '@/utils/format';
import { APP_CONFIG } from '@/config/constants';

const props = defineProps({
  show: Boolean,
  amount: { type: Number, default: 0 },
  rib: { type: String, default: null },
  bankName: { type: String, default: null },
  accountHolderName: { type: String, default: null },
});
const emit = defineEmits(['close']);
const { t } = useI18n();

const qr = ref('');
const hasDetails = computed(() => !!props.rib);
// Moroccan RIB is 24 digits; the "same bank" account number is the 16-digit middle part.
const ribSameBank = computed(() => (props.rib && props.rib.length === 24 ? props.rib.slice(6, 22) : props.rib));

watch(
  () => [props.show, props.rib],
  async ([show]) => {
    if (!show || !props.rib) return;
    qr.value = await QRCode.toDataURL(
      JSON.stringify({ NOM: APP_CONFIG.name, RIB: props.rib, TITULAIRE: props.accountHolderName ?? '' }),
      { margin: 1, width: 320 },
    );
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6">
      <h3 class="text-lg font-bold text-gray-900">{{ t('subscription.bankTransfer.title') }}</h3>
      <p class="mt-1 text-sm text-gray-500">{{ t('subscription.bankTransfer.message') }}</p>

      <div v-if="hasDetails" class="mt-4 space-y-3 rounded-lg bg-gray-50 p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500">{{ t('subscription.bankTransfer.amount') }}</span>
          <span class="text-lg font-bold text-gray-900">{{ formatCurrency(amount) }}</span>
        </div>
        <div v-if="bankName" class="flex items-center justify-between">
          <span class="text-sm text-gray-500">{{ t('subscription.bankTransfer.bank') }}</span>
          <span class="text-sm font-medium text-gray-900">{{ bankName }}</span>
        </div>
        <div v-if="accountHolderName" class="flex items-center justify-between">
          <span class="text-sm text-gray-500">{{ t('subscription.bankTransfer.accountHolder') }}</span>
          <span class="text-sm font-medium text-gray-900">{{ accountHolderName }}</span>
        </div>
        <div>
          <span class="text-xs text-gray-500">{{ t('subscription.bankTransfer.ribSameBank') }}</span>
          <p class="select-all font-mono text-sm text-gray-900">{{ ribSameBank }}</p>
        </div>
        <div>
          <span class="text-xs text-gray-500">{{ t('subscription.bankTransfer.ribOtherBanks') }}</span>
          <p class="select-all font-mono text-sm text-gray-900">{{ rib }}</p>
        </div>
        <div class="flex flex-col items-center pt-2">
          <div class="rounded-lg bg-white p-2">
            <img v-if="qr" :src="qr" alt="RIB QR code" class="h-40 w-40" />
          </div>
          <p class="mt-2 text-center text-xs text-gray-500">{{ t('subscription.bankTransfer.qrCaption') }}</p>
        </div>
      </div>
      <p v-else class="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-700">{{ t('subscription.bankTransfer.notConfigured') }}</p>

      <p class="mt-4 text-sm text-gray-600">{{ t('subscription.bankTransfer.contactSupport') }}</p>
      <button class="mt-4 w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800" @click="emit('close')">
        {{ t('subscription.bankTransfer.close') }}
      </button>
    </div>
  </div>
</template>

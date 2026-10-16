<script setup>
// Top banner: expired / suspended / cancelled, expiring within 5 days, or plan limits reached.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExclamationCircleIcon, ExclamationTriangleIcon, ArrowUpCircleIcon } from '@heroicons/vue/24/outline';
import { useSubscriptionStore } from '@/stores/subscription';
import { useAuthStore } from '@/stores/auth';
import { Plans, Roles } from '@/config/constants';

const emit = defineEmits(['showBankTransfer']);
const { t } = useI18n();
const sub = useSubscriptionStore();
const auth = useAuthStore();

const gatewayEnabled = computed(() => sub.status?.platformSettings?.paymentGatewayEnabled ?? true);
const isExpired = computed(() => (sub.status?.expiresAt ? new Date(sub.status.expiresAt) < new Date() : false));
const isSuspended = computed(() => sub.status?.status === 'suspended');
const isCancelled = computed(() => sub.status?.status === 'cancelled');

const limitReached = computed(() => {
  const u = sub.usage;
  const l = sub.limits;
  if (!u || !l || (sub.status?.plan !== Plans.DEMARRAGE && sub.status?.plan !== Plans.PROFESSIONNEL)) return false;
  return (l.maxProducts != null && u.products >= l.maxProducts) || (l.maxStockUnits != null && u.stockUnits >= l.maxStockUnits);
});

const exceeded = computed(() => {
  const u = sub.usage;
  const l = sub.limits;
  if (!u || !l) return [];
  const out = [];
  if (l.maxProducts != null && u.products >= l.maxProducts)
    out.push({ key: 'products', label: t('subscription.limits.products'), current: u.products, max: l.maxProducts });
  if (l.maxStockUnits != null && u.stockUnits >= l.maxStockUnits)
    out.push({ key: 'stockUnits', label: t('subscription.limits.units'), current: u.stockUnits, max: l.maxStockUnits });
  return out;
});

const isLifetime = computed(() => sub.status?.plan === Plans.LIFETIME);
const isCashierOnly = computed(() => auth.currentUser?.roles?.includes(Roles.CASHIER) && auth.currentUser?.roles?.length === 1);
const visible = computed(
  () => !isCashierOnly.value && !isLifetime.value && (isSuspended.value || isCancelled.value || isExpired.value || sub.isExpiringSoon || limitReached.value),
);
</script>

<template>
  <div v-if="visible" class="print:hidden">
    <div v-if="isSuspended || isCancelled || isExpired" class="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-red-700">
      <div class="flex items-center gap-2 text-sm">
        <ExclamationCircleIcon class="h-5 w-5 shrink-0" />
        <span>
          {{ isSuspended ? t('subscription.banner.suspended') : isCancelled ? t('subscription.banner.cancelled') : t('subscription.banner.expired') }}
        </span>
      </div>
      <RouterLink v-if="gatewayEnabled" to="/app/subscription" class="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-800">
        {{ t('subscription.banner.renew') }}
      </RouterLink>
      <button v-else class="shrink-0 text-sm font-medium text-red-700 underline hover:text-red-800" @click="emit('showBankTransfer')">
        {{ t('subscription.banner.renew') }}
      </button>
    </div>

    <div v-else-if="sub.isExpiringSoon" class="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
      <div class="flex items-center gap-2 text-sm">
        <ExclamationTriangleIcon class="h-5 w-5 shrink-0" />
        <span>{{ t('subscription.expiringSoon', { days: sub.daysUntilExpiry }) }}</span>
      </div>
      <RouterLink v-if="gatewayEnabled" to="/app/subscription" class="shrink-0 text-sm font-medium text-amber-700 underline hover:text-amber-800">
        {{ t('subscription.banner.renew') }}
      </RouterLink>
      <button v-else class="shrink-0 text-sm font-medium text-amber-700 underline hover:text-amber-800" @click="emit('showBankTransfer')">
        {{ t('subscription.banner.renew') }}
      </button>
    </div>

    <div v-else-if="limitReached" class="border-b border-amber-200 bg-amber-50 px-4 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-4 text-xs">
          <div v-for="item in exceeded" :key="item.label" class="flex items-center gap-1.5">
            <span class="text-amber-700">{{ item.label }}</span>
            <span class="font-semibold text-amber-800">{{ item.current }}<span class="text-stone-400">/{{ item.max }}</span></span>
          </div>
        </div>
        <RouterLink
          :to="{ path: '/app/subscription', query: { exceeded: exceeded.map((e) => e.key).join(',') } }"
          class="flex shrink-0 items-center gap-1.5 text-xs font-medium text-amber-700 transition-colors hover:text-amber-800"
        >
          <ArrowUpCircleIcon class="h-3.5 w-3.5" /> {{ t('subscription.banner.upgrade') }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

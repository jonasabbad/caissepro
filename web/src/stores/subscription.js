import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { subscriptionsApi } from '@/api/subscriptions';
import { Plans } from '@/config/constants';

const DAY_MS = 86400_000;

export const useSubscriptionStore = defineStore('subscription', () => {
  const status = ref(null);
  const plans = ref([]);
  const payments = ref([]);
  const currentPayment = ref(null);
  const priceCalculation = ref(null);
  const usage = ref(null);
  const limits = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const blocked = ref(false);
  const blockedReason = ref(null);

  const isActive = computed(() => status.value?.status === 'active' || status.value?.status === 'trial');
  const daysUntilExpiry = computed(() => {
    if (!status.value?.expiresAt) return null;
    return Math.ceil((new Date(status.value.expiresAt).getTime() - Date.now()) / DAY_MS);
  });
  // Trials are not used: only a paid plan approaching its end date is "expiring soon".
  const isExpiringSoon = computed(
    () => status.value?.status !== 'trial' && daysUntilExpiry.value != null && daysUntilExpiry.value <= 5 && daysUntilExpiry.value > 0,
  );
  const hasDiscount = computed(() => (status.value?.customPricing?.discountPercent ?? 0) > 0);

  async function run(fn, fallbackMessage) {
    loading.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = e.message || fallbackMessage;
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStatus() {
    await run(async () => {
      status.value = await subscriptionsApi.getStatus();
      const s = status.value;
      if (s?.plan === Plans.LIFETIME) {
        blocked.value = false;
        blockedReason.value = null;
      } else if (s?.status === 'suspended' || s?.status === 'cancelled') {
        blocked.value = true;
        blockedReason.value = s.status;
      } else if (s?.status === 'active' && s?.plan && s?.expiresAt && new Date(s.expiresAt) < new Date()) {
        blocked.value = true;
        blockedReason.value = 'expired';
      } else {
        blocked.value = false;
        blockedReason.value = null;
      }
    }, 'Failed to fetch subscription status');
  }

  const fetchPlans = () => run(async () => (plans.value = await subscriptionsApi.getPlans()), 'Failed to fetch plans');
  const calculatePrice = (planId, months, isYearly) =>
    run(async () => (priceCalculation.value = await subscriptionsApi.calculatePrice(planId, months, isYearly)), 'Failed to calculate price');
  const fetchPayments = () => run(async () => (payments.value = await subscriptionsApi.getPayments()), 'Failed to fetch payments');

  async function createPayment(planId, months, isYearly) {
    const token = await run(() => subscriptionsApi.createPaymentToken(planId, months, isYearly), 'Failed to create payment');
    currentPayment.value = token;
    if (token) fetchPayments();
    return token;
  }

  async function verifyPayment(id) {
    const payment = await run(() => subscriptionsApi.verifyPayment(id), 'Failed to verify payment');
    if (payment) await fetchStatus();
    return payment;
  }

  async function fetchUsage() {
    try {
      const res = await subscriptionsApi.getUsage();
      usage.value = res.usage;
      limits.value = res.limits;
    } catch {
      /* non-blocking */
    }
  }

  const setBlocked = (v) => (blocked.value = v);
  const clearPayment = () => {
    currentPayment.value = null;
    priceCalculation.value = null;
  };

  return {
    status,
    plans,
    payments,
    currentPayment,
    priceCalculation,
    usage,
    limits,
    loading,
    error,
    blocked,
    blockedReason,
    isActive,
    isExpiringSoon,
    daysUntilExpiry,
    hasDiscount,
    fetchStatus,
    fetchPlans,
    calculatePrice,
    createPayment,
    fetchPayments,
    verifyPayment,
    fetchUsage,
    setBlocked,
    clearPayment,
  };
});

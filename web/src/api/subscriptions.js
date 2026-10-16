import { http } from './http';

export const subscriptionsApi = {
  async getStatus() {
    const { data } = await http.get('/subscriptions/status');
    return data.data.subscription;
  },
  async getPlans() {
    const { data } = await http.get('/subscriptions/plans');
    return data.data.plans;
  },
  async calculatePrice(planId, months, isYearly) {
    const { data } = await http.get('/subscriptions/calculate-price', { params: { planId, months, isYearly } });
    return data.data.calculation;
  },
  async createPaymentToken(planId, months, isYearly) {
    const { data } = await http.post('/subscriptions/payment-token', { planId, months, isYearly });
    return data.data.token;
  },
  async getPayments() {
    const { data } = await http.get('/subscriptions/payments');
    return data.data.payments;
  },
  async verifyPayment(id) {
    const { data } = await http.get(`/subscriptions/payments/${id}/verify`);
    return data.data.payment;
  },
  async getUsage() {
    const { data } = await http.get('/subscriptions/usage');
    return data.data;
  },
  async createLifetimePayment(amount) {
    const { data } = await http.post('/subscriptions/lifetime-payment', { amount });
    return data.data.payment;
  },
};

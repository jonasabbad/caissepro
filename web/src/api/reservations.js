import { http } from './http';

/** Deposits to give back when a reserved phone is sold to someone else or a reservation is cancelled. */
export const reservationRefundsApi = {
  async getAll(status, params = {}) {
    const { data } = await http.get('/phone-seller/reservation-refunds', { params: { ...params, ...(status && { status }) } });
    return data.data.refunds || [];
  },
  async getPending(params) {
    const { data } = await http.get('/phone-seller/reservation-refunds/pending', { params });
    return data.data.refunds || [];
  },
  getCompleted(params) {
    return this.getAll('completed', params);
  },
  getPartial(params) {
    return this.getAll('partial', params);
  },
  async getSummary(params) {
    const { data } = await http.get('/phone-seller/reservation-refunds/summary', { params });
    return data.data;
  },
  async getById(id) {
    const { data } = await http.get(`/phone-seller/reservation-refunds/${id}`);
    return data.data.refund;
  },
  async recordPayment(id, payload) {
    const { data } = await http.post(`/phone-seller/reservation-refunds/${id}/record-payment`, payload);
    return data.data.refund;
  },
};

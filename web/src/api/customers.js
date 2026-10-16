import { http } from './http';

export const customersApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/customers', {
      params: { query: p.query || '', page: p.page || 1, limit: p.limit || 50 },
    });
    return {
      customers: data.data?.customers || [],
      total: data.data?.meta?.total || 0,
      page: data.data?.meta?.page || p.page || 1,
      limit: data.data?.meta?.limit || p.limit || 50,
    };
  },
  async getById(id) {
    const { data } = await http.get(`/customers/${id}`);
    return data.data.customer;
  },
  async create(payload) {
    const { data } = await http.post('/customers', payload);
    return data.data.customer;
  },
  async update(id, payload) {
    const { data } = await http.put(`/customers/${id}`, payload);
    return data.data.customer;
  },
  async delete(id) {
    await http.delete(`/customers/${id}`);
  },
  async getTransactions(id) {
    const { data } = await http.get(`/customers/${id}/transactions`);
    return data.data.transactions;
  },
  async addPayment(id, payload) {
    const { data } = await http.post(`/customers/${id}/payments`, payload);
    return data.data;
  },
  async getPayments(id) {
    const { data } = await http.get(`/customers/${id}/payments`);
    return data.data;
  },
};

import { http } from './http';

export const suppliersApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/suppliers', { params: { query: p.query, page: p.page, limit: p.limit } });
    return { suppliers: data.data.suppliers || [], meta: data.data.meta };
  },
  async getById(id) {
    const { data } = await http.get(`/suppliers/${id}`);
    return data.data.supplier;
  },
  async create(payload) {
    const { data } = await http.post('/suppliers', payload);
    return data.data.supplier;
  },
  async update(id, payload) {
    const { data } = await http.put(`/suppliers/${id}`, payload);
    return data.data.supplier;
  },
  async delete(id) {
    await http.delete(`/suppliers/${id}`);
  },
  async getOrders(id) {
    const { data } = await http.get(`/suppliers/${id}/orders`);
    return data.data.orders;
  },
};

import { http } from './http';

export const repairsApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/repairs', {
      params: { query: p.query || undefined, status: p.status || undefined, repairerId: p.repairerId || undefined, paymentStatus: p.paymentStatus || undefined, dateFrom: p.dateFrom || undefined, dateTo: p.dateTo || undefined },
    });
    return data.data.repairs;
  },
  /** One page of the list: { repairs, meta: { total, totalPages, activeCount, … } }. */
  async getPage(p = {}) {
    const { data } = await http.get('/repairs', {
      params: { query: p.query || undefined, status: p.status || undefined, repairerId: p.repairerId || undefined, paymentStatus: p.paymentStatus || undefined, page: p.page || 1, limit: p.limit || 20 },
    });
    return data.data;
  },
  /** { [soldUnitId]: number of repairs } */
  async countsByUnit() {
    const { data } = await http.get('/repairs/counts-by-unit');
    return data.data.counts;
  },
  async getBySoldUnit(unitId) {
    const { data } = await http.get(`/repairs/by-unit/${unitId}`);
    return data.data.repairs;
  },
  async getById(id) {
    const { data } = await http.get(`/repairs/${id}`);
    return data.data.repair;
  },
  async create(payload) {
    const { data } = await http.post('/repairs', payload);
    return data.data.repair;
  },
  async update(id, payload) {
    const { data } = await http.put(`/repairs/${id}`, payload);
    return data.data.repair;
  },
  async updateStatus(id, status) {
    const { data } = await http.patch(`/repairs/${id}/status`, { status });
    return data.data.repair;
  },
  async delete(id) {
    await http.delete(`/repairs/${id}`);
  },
  async addExpense(id, payload) {
    const { data } = await http.post(`/repairs/${id}/expenses`, payload);
    return data.data.repair;
  },
  async removeExpense(id, expenseId) {
    const { data } = await http.delete(`/repairs/${id}/expenses/${expenseId}`);
    return data.data.repair;
  },
  /** Customer payment: { amount, method: cash|card|bank_transfer|check, reference? }. */
  async addPayment(id, payload) {
    const { data } = await http.post(`/repairs/${id}/payments`, payload);
    return data.data.repair;
  },
};

export const repairersApi = {
  /** Accepts a search string or `{ query }`. */
  async getAll(p) {
    const query = typeof p === 'string' ? p : p?.query;
    const { data } = await http.get('/repairers', { params: { query: query || undefined } });
    return data.data.repairers;
  },
  async create(payload) {
    const { data } = await http.post('/repairers', payload);
    return data.data.repairer;
  },
};

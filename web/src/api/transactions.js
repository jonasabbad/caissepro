import { http } from './http';

export const transactionsApi = {
  async getAll(p = {}) {
    try {
      const { data } = await http.get('/transactions', {
        params: {
          query: p.query,
          customerId: p.customerId,
          type: p.type,
          status: p.status,
          startDate: p.dateFrom,
          endDate: p.dateTo,
          page: p.page || 1,
          limit: p.limit || 20,
        },
      });
      return {
        transactions: data.data.transactions || [],
        total: data.data.meta?.total || 0,
        page: data.data.meta?.page || p.page || 1,
        limit: data.data.meta?.limit || p.limit || 20,
      };
    } catch {
      return { transactions: [], total: 0, page: p.page || 1, limit: p.limit || 20 };
    }
  },
  async exportCsv(p) {
    const { data } = await http.get('/transactions/export', {
      params: { type: p.type, status: p.status, startDate: p.dateFrom, endDate: p.dateTo },
      responseType: 'blob',
    });
    return data;
  },
  async getById(id) {
    const { data } = await http.get(`/transactions/${id}`);
    const tx = data.data.transaction;
    if (data.data.tradeInUnit) tx.tradeInUnit = data.data.tradeInUnit;
    return tx;
  },
  async addPayment(id, payload) {
    const { data } = await http.post(`/transactions/${id}/payment`, payload);
    return data.data.transaction;
  },
  async cancel(id, reason) {
    const { data } = await http.post(`/transactions/${id}/cancel`, { reason });
    return data.data.transaction;
  },
  async correct(id, payload) {
    const { data } = await http.patch(`/transactions/${id}/correct`, payload);
    return data.data.transaction;
  },
  async getReceipt(id) {
    const { data } = await http.get(`/transactions/${id}/receipt`, { responseType: 'blob' });
    return data;
  },
  async getSoldItems(p = {}) {
    const { data } = await http.get('/transactions/sold-items', { params: { query: p.query, page: p.page || 1, limit: p.limit || 50 } });
    return { items: data.data.items || [], meta: data.data.meta || { total: 0, page: 1, limit: 50, totalPages: 0 } };
  },
};

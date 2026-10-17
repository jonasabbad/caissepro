import { http } from './http';

export const EXPENSE_CATEGORIES = ['rent', 'salaries', 'utilities', 'telecom', 'transport', 'supplies', 'marketing', 'maintenance', 'fees', 'taxes', 'other'];
export const EXPENSE_METHODS = ['cash', 'card', 'bank_transfer'];

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const expensesApi = {
  /** { expenses, meta, totals: { count, amount } } — params: query, category, paymentMethod, dateFrom, dateTo, page, limit. */
  async getAll(p = {}) {
    const { data } = await http.get('/expenses', { params: clean(p) });
    return data.data;
  },
  async getById(id) {
    const { data } = await http.get(`/expenses/${id}`);
    return data.data.expense;
  },
  async create(payload) {
    const { data } = await http.post('/expenses', payload);
    return data.data.expense;
  },
  async update(id, payload) {
    const { data } = await http.put(`/expenses/${id}`, payload);
    return data.data.expense;
  },
  async remove(id) {
    await http.delete(`/expenses/${id}`);
  },
  /** Receipt image (data URL, already compressed) or PDF; returns the stored URL. */
  async uploadReceipt(dataUrl) {
    const { data } = await http.post('/uploads/files', { dataUrl });
    return data.data.url;
  },
};

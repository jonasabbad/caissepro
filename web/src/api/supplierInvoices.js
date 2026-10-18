import { http } from './http';

export const supplierInvoicesApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/supplier-invoices', {
      params: {
        query: p.query || undefined,
        supplierId: p.supplierId || undefined,
        status: p.status || undefined,
        paymentStatus: p.paymentStatus || undefined,
        dateFrom: p.dateFrom || undefined,
        dateTo: p.dateTo || undefined,
        page: p.page || 1,
        limit: p.limit || 20,
      },
    });
    return data.data;
  },
  async getById(id) {
    const { data } = await http.get(`/supplier-invoices/${id}`);
    return data.data.invoice;
  },
  async create(payload) {
    const { data } = await http.post('/supplier-invoices', payload);
    return data.data.invoice;
  },
  async fromOrder(orderId) {
    const { data } = await http.post(`/supplier-invoices/from-order/${orderId}`);
    return data.data.invoice;
  },
  async update(id, payload) {
    const { data } = await http.put(`/supplier-invoices/${id}`, payload);
    return data.data.invoice;
  },
  async confirm(id) {
    const { data } = await http.post(`/supplier-invoices/${id}/confirm`);
    return data.data.invoice;
  },
  async cancel(id, reason) {
    const { data } = await http.post(`/supplier-invoices/${id}/cancel`, { reason });
    return data.data.invoice;
  },
  async remove(id) {
    await http.delete(`/supplier-invoices/${id}`);
  },
  /** items: [{ itemId, quantity }]; omitted = everything still open. */
  async receive(id, items) {
    const { data } = await http.post(`/supplier-invoices/${id}/receive`, items ? { items } : {});
    return data.data.invoice;
  },
  async addPayment(id, payload) {
    const { data } = await http.post(`/supplier-invoices/${id}/payments`, payload);
    return data.data.invoice;
  },
  async voidPayment(id, paymentId, reason) {
    const { data } = await http.post(`/supplier-invoices/${id}/payments/${paymentId}/void`, { reason });
    return data.data.invoice;
  },
  async statement(supplierId, p = {}) {
    const { data } = await http.get(`/suppliers/${supplierId}/statement`, { params: { dateFrom: p.dateFrom || undefined, dateTo: p.dateTo || undefined } });
    return data.data;
  },
};

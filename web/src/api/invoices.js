import { http } from './http';

const base = (id, type) => (type === 'standalone' ? `/invoices/standalone/${id}` : `/invoices/${id}`);

export const invoicesApi = {
  /** { invoices, total, meta } — params: query, type, dateFrom, dateTo, isArchived, page, limit. */
  async getAll(params = {}) {
    const { data } = await http.get('/invoices', { params });
    return data.data;
  },
  async getById(id) {
    const { data } = await http.get(`/invoices/${id}`);
    return data.data.invoice;
  },
  async createStandalone(payload) {
    const { data } = await http.post('/invoices/standalone', payload);
    return data.data.invoice;
  },
  async updateStandalone(id, payload) {
    const { data } = await http.patch(`/invoices/standalone/${id}`, payload);
    return data.data.invoice;
  },
  async getQuarterlyTotals(year) {
    const { data } = await http.get('/invoices/quarterly-totals', { params: year ? { year } : {} });
    return data.data;
  },
  async delete(id, type) {
    await http.delete(base(id, type));
  },
  async archive(id) {
    await http.patch(`/invoices/${id}/archive`);
  },
  async unarchive(id) {
    await http.patch(`/invoices/${id}/unarchive`);
  },
  async calculateCustomPeriodIr(dateFrom, dateTo) {
    const { data } = await http.post('/invoices/ir/calculate-period', { dateFrom, dateTo });
    const d = data.data;
    return { totalRevenue: d.totalRevenue, irAmount: d.irAmount, flatTaxRate: d.flatTaxRate, invoiceCount: d.invoiceCount };
  },
  async calculateCustomPeriodTva(dateFrom, dateTo) {
    const { data } = await http.post('/invoices/tva/calculate-period', { dateFrom, dateTo });
    const d = data.data;
    return {
      tvaAmount: d.totalTax,
      taxableAmount: d.totalSales,
      taxRate: d.breakdown?.[0]?.rate || 0,
      invoiceCount: d.invoiceCount,
      startDate: d.period?.from || dateFrom,
      endDate: d.period?.to || dateTo,
    };
  },
};

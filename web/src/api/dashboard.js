import { http } from './http';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const dashboardApi = {
  async getKpis(startDate, endDate, storeId) {
    const { data } = await http.get('/dashboard/kpis', { params: clean({ startDate, endDate, storeId }) });
    return data.data.kpis;
  },
  async getSalesTrend(days = 30, startDate, endDate, storeId) {
    const { data } = await http.get('/dashboard/sales-trend', { params: clean({ days, startDate, endDate, storeId }) });
    return data.data.trend || [];
  },
  async getTopProducts(limit = 10, days = 30, startDate, endDate, storeId) {
    const { data } = await http.get('/dashboard/top-products', { params: clean({ limit, days, startDate, endDate, storeId }) });
    return data.data.products || [];
  },
  async getLowStock(limit = 10, storeId) {
    const { data } = await http.get('/dashboard/low-stock', { params: clean({ limit, storeId }) });
    return data.data.products || [];
  },
  async getPaymentBreakdown(startDate, endDate) {
    const { data } = await http.get('/dashboard/payment-breakdown', { params: clean({ startDate, endDate }) });
    return data.data.breakdown || [];
  },
  async getStoreBreakdown(startDate, endDate) {
    const { data } = await http.get('/dashboard/store-breakdown', { params: clean({ startDate, endDate }) });
    return data.data.breakdown || [];
  },
};

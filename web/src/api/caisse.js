import { http } from './http';

export const CaisseMovementType = Object.freeze({
  CASH_IN: 'cash_in',
  CASH_OUT: 'cash_out',
  SALE: 'sale',
  RETURN_REFUND: 'return_refund',
  RESERVATION_REFUND: 'reservation_refund',
  ADJUSTMENT: 'adjustment',
});

export const caisseApi = {
  /** { balance, dailySummary, movements, meta } — params: startDate, endDate, page, limit. */
  async getCaisse(storeId, params) {
    const { data } = await http.get(`/stores/${storeId}/caisse`, { params });
    return data.data;
  },
  async getBalance(storeId) {
    const { data } = await http.get(`/stores/${storeId}/caisse/balance`);
    return data.data.balance;
  },
  async recordCashIn(storeId, amount, reason) {
    const { data } = await http.post(`/stores/${storeId}/caisse/cash-in`, { amount, reason });
    return data.data.movement;
  },
  async recordCashOut(storeId, amount, reason) {
    const { data } = await http.post(`/stores/${storeId}/caisse/cash-out`, { amount, reason });
    return data.data.movement;
  },
  async adjustBalance(storeId, newBalance, reason) {
    const { data } = await http.post(`/stores/${storeId}/caisse/adjust`, { newBalance, reason });
    return data.data.movement;
  },
};

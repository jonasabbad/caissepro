import { http } from './http';

export const checkoutApi = {
  async previewCart(payload) {
    const { data } = await http.post('/checkout/preview', payload);
    return data.data.preview;
  },
  async checkout(payload) {
    const { data } = await http.post('/checkout', payload);
    return data.data.transaction;
  },
  async processReturn(payload) {
    const { data } = await http.post('/checkout/return', payload);
    return data.data.transaction;
  },
  /** Returns { transaction, tradeInUnits }. */
  async checkoutWithTradeIn(payload) {
    const { data } = await http.post('/checkout/trade-in', payload);
    return data.data;
  },
};

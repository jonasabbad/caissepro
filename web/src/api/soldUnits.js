import { http } from './http';

/** Luhn check for 15-digit IMEIs. */
export function isValidImei(imei) {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** 356938035643809 -> 35-693803-564380-9 */
export const formatImei = (imei) =>
  imei.length === 15 ? `${imei.slice(0, 2)}-${imei.slice(2, 8)}-${imei.slice(8, 14)}-${imei.slice(14)}` : imei;

export const soldUnitsApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/phone-seller/sold-units', {
      params: {
        query: p.query,
        deviceType: p.deviceType,
        brand: p.brand,
        model: p.model,
        storage: p.storage,
        condition: p.condition,
        sold: p.inStock === undefined ? undefined : !p.inStock,
        startDate: p.startDate,
        endDate: p.endDate,
        page: p.page || 1,
        limit: p.limit || 20,
      },
    });
    return {
      units: data.data.units || [],
      meta: data.data.meta || { total: 0, page: 1, limit: 20, totalPages: 0 },
    };
  },
  async getFilterOptions(params) {
    const { data } = await http.get('/phone-seller/sold-units/filter-options', { params });
    return data.data || { models: [], storage: [] };
  },
  async getInventory() {
    const { data } = await http.get('/phone-seller/sold-units/inventory');
    return data.data.units || [];
  },
  async getReserved() {
    const { data } = await http.get('/phone-seller/sold-units/reserved');
    return data.data.units || [];
  },
  async getSoldItems(p = {}) {
    const { data } = await http.get('/phone-seller/sold-units/sold', {
      params: { query: p.query, brand: p.brand, condition: p.condition, page: p.page || 1, limit: p.limit || 50 },
    });
    return {
      units: data.data.units || [],
      meta: data.data.meta || { total: 0, page: 1, limit: 50, totalPages: 0 },
    };
  },
  async markAsReturned(id) {
    const { data } = await http.post(`/phone-seller/sold-units/${id}/mark-returned`);
    return data.data.unit;
  },
  async completeReservation(id) {
    const { data } = await http.post(`/phone-seller/sold-units/${id}/complete-reservation`);
    return data.data.unit;
  },
  async getById(id) {
    const { data } = await http.get(`/phone-seller/sold-units/${id}`);
    return data.data.unit;
  },
  async getByImei(imei) {
    return (await this.getAll({ query: imei, limit: 1 })).units.find((u) => u.imei === imei) || null;
  },
  async create(payload) {
    const { data } = await http.post('/phone-seller/sold-units', payload);
    return data.data.unit;
  },
  async update(id, payload) {
    const { data } = await http.put(`/phone-seller/sold-units/${id}`, payload);
    return data.data.unit;
  },
  async markAsSold(id, transactionId, customerId) {
    const { data } = await http.post(`/phone-seller/sold-units/${id}/mark-sold`, { transactionId, customerId });
    return data.data.unit;
  },
  async delete(id) {
    await http.delete(`/phone-seller/sold-units/${id}`);
  },
  async getAvailableForProduct(brand, model, storage) {
    const { data } = await http.get('/phone-seller/sold-units/available', { params: { brand, model, storage } });
    return data.data?.units || [];
  },
  /** Value printed as the device barcode (scanning it in the POS finds the device). */
  labelCode(unit) {
    return unit.imei ? unit.imei : unit.ref;
  },
};

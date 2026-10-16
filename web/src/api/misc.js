import { http } from './http';

export const settingsApi = {
  async getTeam() {
    const { data } = await http.get('/settings/team');
    return data.data.users;
  },
  async getTenantSettings() {
    const { data } = await http.get('/settings/tenant');
    return data.data;
  },
  async updateBusinessInfo(payload) {
    const { data } = await http.patch('/settings/business-info', payload);
    return data.data;
  },
  async updateProfile(payload) {
    const { data } = await http.patch('/settings/profile', payload);
    return data.data;
  },
  async changePassword(payload) {
    const { data } = await http.post('/settings/change-password', payload);
    return data;
  },
  async updateStore(payload) {
    const { data } = await http.patch('/settings/store', payload);
    return data.data;
  },
  async updatePreferences(payload) {
    const { data } = await http.patch('/settings/preferences', payload);
    return data.data;
  },
  async updatePrintingSettings(payload) {
    const { data } = await http.patch('/settings/printing', payload);
    return data.data;
  },
  async updateLegalStatus(payload) {
    const { data } = await http.patch('/settings/legal-status', payload);
    return data.data;
  },
};

export const storesApi = {
  async getAll() {
    const { data } = await http.get('/stores');
    return data.data.stores;
  },
  async getActive() {
    const { data } = await http.get('/stores/active');
    return data.data.stores;
  },
};

export const announcementsApi = {
  async getActive() {
    const { data } = await http.get('/tenant/announcements/active');
    return data.data.announcements;
  },
};

export const paperOrdersApi = {
  async create(payload) {
    const { data } = await http.post('/paper-orders', payload);
    return data.data.order;
  },
  async getMine() {
    const { data } = await http.get('/paper-orders/mine');
    return data.data.orders;
  },
};

import { http } from './http';

const mapDevice = (d) => ({
  brand: d.brand,
  model: d.model,
  year: d.year,
  storageOptions: d.storageOptions || [],
  ramOptions: d.ramOptions || [],
  colors: d.colors || [],
  basePrice: d.basePrice || 0,
});

export const deviceCatalogApi = {
  async getBrands(deviceType) {
    const { data } = await http.get('/phone-seller/catalog/brands', { params: { deviceType } });
    return (data.data?.brands || []).map((name) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name }));
  },
  async getModelsByBrand(brand, deviceType) {
    const { data } = await http.get('/phone-seller/catalog/models', { params: { brand, deviceType } });
    return data.data?.models || [];
  },
  async getDevice(brand, model, deviceType) {
    const { data } = await http.get('/phone-seller/catalog/device', { params: { brand, model, deviceType } });
    const d = data.data;
    if (!d?.device) {
      return {
        brand,
        model,
        year: new Date().getFullYear(),
        storageOptions: d?.storageOptions || [],
        ramOptions: d?.ramOptions || [],
        colors: d?.colors || [],
        basePrice: d?.basePrice || 0,
        unknown: true,
      };
    }
    return mapDevice({ ...d.device, storageOptions: d.device.storageOptions || d.storageOptions, colors: d.device.colors || d.colors });
  },
  async searchDevices(q) {
    const { data } = await http.get('/phone-seller/catalog/search', { params: { q } });
    return (data.data?.devices || []).map(mapDevice);
  },
  async getAllDevices() {
    const { data } = await http.get('/phone-seller/catalog/all');
    return (data.data?.devices || []).map(mapDevice);
  },
};

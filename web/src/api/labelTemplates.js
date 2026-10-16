import { http } from './http';

// Label layouts per product category, plus one for phones (sold units).
// Templates are cached in localStorage so printing still works offline.

export const SOLD_UNITS_KEY = '__sold_units__';
const CACHE_KEY = 'label_templates_cache';

export const DEFAULT_PRODUCT_LABEL = {
  includeQr: true,
  includeName: true,
  includeImei: false,
  includePrice: true,
  includeCondition: false,
  includeSpecs: false,
  includeStorage: false,
  includeColor: false,
  includeBatteryHealth: false,
  hideBrand: false,
  includeCompany: true,
  includeBarcode: true,
};

export const DEFAULT_UNIT_LABEL = {
  ...DEFAULT_PRODUCT_LABEL,
  includeImei: true,
  includeCondition: true,
  includeStorage: true,
  includeColor: true,
  includeBatteryHealth: true,
  includeBarcode: false,
};

function readCache() {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')));
  } catch {
    return new Map();
  }
}
const cache = readCache();
const persist = () => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* ignore */
  }
};

async function fetchTemplate(key, defaults) {
  try {
    const { data } = await http.get(`/label-templates/${encodeURIComponent(key)}`);
    const tpl = data.data.template || data.data;
    cache.set(key, tpl);
    persist();
    return tpl;
  } catch {
    return cache.get(key) || { categoryId: key, ...defaults };
  }
}

async function saveTemplate(key, tpl) {
  const value = { ...tpl, categoryId: key };
  cache.set(key, value);
  persist();
  try {
    const { data } = await http.put(`/label-templates/${encodeURIComponent(key)}`, value);
    return data.data.template || data.data;
  } catch {
    return value;
  }
}

export const labelTemplatesApi = {
  getForSoldUnits: () => fetchTemplate(SOLD_UNITS_KEY, DEFAULT_UNIT_LABEL),
  saveForSoldUnits: (tpl) => saveTemplate(SOLD_UNITS_KEY, tpl),
  getByCategory: (categoryId) => fetchTemplate(categoryId, DEFAULT_PRODUCT_LABEL),
  save: (tpl) => saveTemplate(tpl.categoryId, tpl),
  async getAll() {
    try {
      const { data } = await http.get('/label-templates');
      return data.data.templates;
    } catch {
      return Array.from(cache.values());
    }
  },
  async getForSoldUnit(brand, deviceType) {
    try {
      const params = {};
      if (brand) params.brand = brand;
      if (deviceType) params.deviceType = deviceType;
      const { data } = await http.get('/label-templates/sold-units/resolve', { params });
      return data.data.template || data.data;
    } catch {
      return this.getForSoldUnits();
    }
  },
  async listSoldUnitVariants() {
    const { data } = await http.get('/label-templates/sold-units/variants');
    return data.data.variants || [];
  },
  async saveSoldUnitVariant(variant) {
    const { data } = await http.put('/label-templates/sold-units/variants', variant);
    return data.data.template || data.data;
  },
  async deleteSoldUnitVariant(id) {
    await http.delete(`/label-templates/sold-units/variants/${id}`);
  },
  async resetToDefault(key) {
    const defaults = { categoryId: key, ...(key === SOLD_UNITS_KEY ? DEFAULT_UNIT_LABEL : DEFAULT_PRODUCT_LABEL) };
    cache.set(key, defaults);
    persist();
    try {
      const { data } = await http.post(`/label-templates/${encodeURIComponent(key)}/reset`, defaults);
      return data.data.template || data.data;
    } catch {
      return defaults;
    }
  },
};

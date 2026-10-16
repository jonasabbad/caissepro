import { http } from './http';

export const productsApi = {
  async getAll(p = {}) {
    const { data } = await http.get('/products', {
      params: {
        query: p.query,
        categoryId: p.categoryId,
        status: p.status,
        lowStock: p.lowStock,
        sort: p.sort,
        page: p.page || 1,
        limit: p.limit || 50,
      },
    });
    return {
      products: data.data.products || [],
      meta: data.data.meta || { total: 0, page: p.page || 1, limit: p.limit || 50, totalPages: 1 },
    };
  },
  async getById(id) {
    const { data } = await http.get(`/products/${id}`);
    return data.data.product;
  },
  async getByBarcode(barcode) {
    const { data } = await http.get(`/products/barcode/${encodeURIComponent(barcode)}`);
    return data.success ? data.data.product : null;
  },
  async create(payload) {
    const { data } = await http.post('/products', payload);
    return data.data.product;
  },
  async createMany(products) {
    const { data } = await http.post('/products/bulk', { products });
    return data.data.products;
  },
  async update(id, payload) {
    const { data } = await http.put(`/products/${id}`, payload);
    return data.data.product;
  },
  async adjustStock(id, quantity, reason, opts) {
    const { data } = await http.post(`/products/${id}/adjust-stock`, {
      quantity,
      reason,
      type: opts?.type,
      packCostPrice: opts?.packCostPrice,
    });
    return data.data.product;
  },
  async archive(id) {
    const { data } = await http.post(`/products/${id}/archive`);
    return data.data.product;
  },
  async delete(id) {
    await http.delete(`/products/${id}`);
  },
  async getLowStock(limit) {
    const { data } = await http.get('/products/low-stock', { params: { limit } });
    return data.data.products;
  },
};

export const categoriesApi = {
  async getAll() {
    try {
      const { data } = await http.get('/categories');
      return data.data.categories;
    } catch (e) {
      if (e.response?.status === 404) return [];
      throw e;
    }
  },
  async getById(id) {
    const { data } = await http.get(`/categories/${id}`);
    return data.data.category;
  },
};

export const accessoryCatalogApi = {
  async getTemplates() {
    const { data } = await http.get('/accessory-catalog');
    return data.data.templates || [];
  },
};

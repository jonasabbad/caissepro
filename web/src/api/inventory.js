import { http } from './http';

/** Movement rows normalised for display ("purchase" is shown as a supplier order). */
export const inventoryMovementsApi = {
  async getAll(p = {}) {
    const type = p.type === 'supplier_order' ? 'purchase' : p.type;
    const { data } = await http.get('/inventory-movements', {
      params: { productId: p.productId, type, dateFrom: p.dateFrom, dateTo: p.dateTo },
    });
    return (data.data.movements || []).map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product?.name || 'Unknown',
      productSku: m.product?.sku || '',
      type: m.type === 'purchase' ? 'supplier_order' : m.type,
      quantity: m.quantity,
      previousStock: m.previousQuantity,
      newStock: m.newQuantity,
      reason: m.notes,
      reference: m.reference,
      createdAt: m.createdAt,
      createdBy: m.creator
        ? m.creator.firstName || m.creator.lastName
          ? `${m.creator.firstName || ''} ${m.creator.lastName || ''}`.trim()
          : m.creator.email || 'User'
        : null,
    }));
  },
  getByProduct(productId) {
    return this.getAll({ productId });
  },
};

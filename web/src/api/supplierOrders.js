import { http } from './http';

function mapOrder(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    supplierId: o.supplierId,
    supplierName: o.supplier?.name || o.supplierName || '',
    status: o.status,
    items: (o.items || []).map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      itemType: i.itemType,
      quantity: i.quantityOrdered ?? i.quantity,
      receivedQuantity: i.quantityReceived ?? i.receivedQuantity ?? 0,
      unitCost: Number(i.unitCost),
      total: Number(i.totalCost ?? i.total ?? 0),
      deviceType: i.deviceType,
      brand: i.brand,
      deviceModel: i.deviceModel,
      defaultSalePrice: i.defaultSalePrice ? Number(i.defaultSalePrice) : undefined,
      unitDetails: i.unitDetails ?? null,
    })),
    payments: (o.payments || []).map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      note: p.note,
      userName: p.user ? `${p.user.firstName} ${p.user.lastName}` : p.userName,
      createdAt: p.createdAt,
    })),
    subtotal: Number(o.totalAmount || 0),
    totalAmount: Number(o.totalAmount || 0),
    amountPaid: Number(o.amountPaid || 0),
    amountRemaining: Number(o.amountRemaining || 0),
    notes: o.notes,
    expectedDate: o.expectedDate,
    receivedDate: o.receivedAt || o.receivedDate,
    createdAt: o.createdAt,
    invoice: o.invoice || null,
  };
}

export const supplierOrdersApi = {
  async getAll(params = {}) {
    const { data } = await http.get('/supplier-orders', { params });
    return (data.data.orders || []).map(mapOrder);
  },
  async getById(id) {
    const { data } = await http.get(`/supplier-orders/${id}`);
    return mapOrder(data.data.order);
  },
  async create(payload) {
    const { data } = await http.post('/supplier-orders', payload);
    return mapOrder(data.data.order);
  },
  async update(id, payload) {
    const { data } = await http.put(`/supplier-orders/${id}`, payload);
    return mapOrder(data.data.order);
  },
  async receive(id, items, paymentAmount) {
    const { data } = await http.post(`/supplier-orders/${id}/receive`, { items, paymentAmount });
    return mapOrder(data.data.order);
  },
  async addPayment(id, amount) {
    const { data } = await http.post(`/supplier-orders/${id}/payment`, { amount });
    return mapOrder(data.data.order);
  },
  async submit(id) {
    const { data } = await http.post(`/supplier-orders/${id}/submit`);
    return mapOrder(data.data.order);
  },
  async updateItemUnits(id, itemId, units) {
    await http.patch(`/supplier-orders/${id}/items/${itemId}/units`, { units });
  },
  async cancel(id) {
    await http.post(`/supplier-orders/${id}/cancel`);
  },
  async convertItemUnits(id, itemId, unitIndexes) {
    const { data } = await http.post(`/supplier-orders/${id}/items/${itemId}/convert-units`, { unitIndexes });
    return data.data;
  },
  async convertAllUnits(id) {
    const { data } = await http.post(`/supplier-orders/${id}/convert-all-units`);
    return data.data;
  },
};

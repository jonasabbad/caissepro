import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { round2 } from '@/utils/format';

const EMPLOYEE_KEY = 'pos_selected_employee';

function productSnapshot(p) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    retailPrice: p.retailPrice,
    costPrice: p.costPrice,
    stockQuantity: p.stockQuantity,
    variants: p.variants,
    imageUrl: p.imageUrl || null,
  };
}

/**
 * POS cart.
 * Line `total` = unitPrice × quantity − discount (never negative); `profit` = total − cost × quantity.
 * Cart total = subtotal + TVA − cart discount, where TVA = (subtotal − discount) × rate when enabled.
 * Pack lines ("pack-<productId>") sell whole boxes: the unit price is the box price / packSize rounded
 * up to the cent, and the rounding residue is carried as a line discount so a box costs exactly its price.
 */
export const useCartStore = defineStore('cart', () => {
  const items = ref([]);
  const customerId = ref(null);
  const discountAmount = ref(0);
  const taxRate = ref(20);
  const applyTva = ref(false);
  const selectedEmployeeId = ref(localStorage.getItem(EMPLOYEE_KEY));

  const isReturnMode = ref(false);
  const returnCustomer = ref(null);
  const tradeInDevices = ref([]);

  function setSelectedEmployee(id) {
    selectedEmployeeId.value = id;
    if (id) localStorage.setItem(EMPLOYEE_KEY, id);
    else localStorage.removeItem(EMPLOYEE_KEY);
  }

  const hasTradeIn = computed(() => tradeInDevices.value.length > 0);
  const totalTradeInValue = computed(() => tradeInDevices.value.reduce((s, d) => s + Number(d.tradeInValue), 0));
  const subtotal = computed(() => items.value.reduce((s, i) => s + i.total, 0));
  const taxAmount = computed(() => (applyTva.value ? (subtotal.value - discountAmount.value) * (taxRate.value / 100) : 0));
  const total = computed(() => subtotal.value + taxAmount.value - discountAmount.value);
  const totalAfterTradeIn = computed(() =>
    tradeInDevices.value.length === 0 ? total.value : Math.max(0, total.value - totalTradeInValue.value),
  );
  const totalProfit = computed(() => items.value.reduce((s, i) => s + i.profit, 0));
  const itemCount = computed(() => items.value.reduce((s, i) => s + i.quantity, 0));
  const isEmpty = computed(() => items.value.length === 0);

  /** Pieces of a product already taken by other (non-serialised) lines, e.g. a unit line + a pack line. */
  function reservedElsewhere(realProductId, exceptLineId) {
    return items.value
      .filter((i) => i.productId !== exceptLineId && !i.soldUnit && (i.realProductId ?? i.productId) === realProductId)
      .reduce((s, i) => s + i.quantity, 0);
  }

  function addItem(product, quantity = 1, soldUnit) {
    const available = product.stockQuantity - reservedElsewhere(product.id, product.id);
    if (!soldUnit && quantity > available) quantity = available;
    if (!soldUnit && quantity <= 0) return;
    const idx = items.value.findIndex((i) => i.productId === product.id);
    if (idx >= 0) {
      if (soldUnit || items.value[idx].soldUnit) return;
      updateItemQuantity(product.id, items.value[idx].quantity + quantity);
      return;
    }
    const price = product.retailPrice;
    items.value.push({
      productId: product.id,
      product: productSnapshot(product),
      quantity,
      unitPrice: price,
      discount: 0,
      total: price * quantity,
      profit: (price - product.costPrice) * quantity,
      ...(soldUnit && { soldUnitId: soldUnit.id, soldUnit }),
    });
  }

  function addPackItem(product) {
    const packSize = Number(product.packSize) || 0;
    if (packSize < 2) return false;
    const lineId = `pack-${product.id}`;
    const existing = items.value.find((i) => i.productId === lineId);
    const currentQty = existing?.quantity ?? 0;
    const available = product.stockQuantity - reservedElsewhere(product.id, lineId);
    if (currentQty + packSize > available) return false;

    const boxPrice =
      Number(product.packRetailPrice) > 0 ? Number(product.packRetailPrice) : round2(packSize * Number(product.retailPrice));
    const unitPrice = Math.ceil((boxPrice / packSize) * 100 - 1e-7) / 100;
    const residue = round2(packSize * unitPrice - boxPrice);
    const quantity = currentQty + packSize;
    const discount = round2((quantity / packSize) * residue);
    const lineTotal = round2(quantity * unitPrice - discount);
    const profit = round2(lineTotal - Number(product.costPrice) * quantity);

    if (existing) {
      const idx = items.value.findIndex((i) => i.productId === lineId);
      items.value[idx] = { ...existing, quantity, discount, total: lineTotal, profit };
    } else {
      items.value.push({
        productId: lineId,
        realProductId: product.id,
        saleMode: 'pack',
        packSize,
        packBoxPrice: boxPrice,
        packResidue: residue,
        product: productSnapshot(product),
        quantity,
        unitPrice,
        discount,
        total: lineTotal,
        profit,
      });
    }
    return true;
  }

  function updateItemQuantity(lineId, quantity) {
    const idx = items.value.findIndex((i) => i.productId === lineId);
    if (idx < 0) return;
    const line = items.value[idx];
    if (line.saleMode === 'pack' && line.packSize) {
      // Pack lines move by whole boxes.
      const dir = quantity > line.quantity ? 1 : -1;
      quantity = line.quantity + dir * line.packSize;
    }
    if (quantity <= 0) {
      removeItem(lineId);
      return;
    }
    if (!line.soldUnit) {
      const available = line.product.stockQuantity - reservedElsewhere(line.realProductId ?? line.productId, line.productId);
      if (quantity > available) {
        if (line.saleMode === 'pack') return;
        quantity = available;
        if (quantity <= 0) return;
      }
    }
    let discount = line.discount;
    if (line.saleMode === 'pack' && line.packSize && line.packResidue != null) {
      discount = round2((quantity / line.packSize) * line.packResidue);
    }
    const lineTotal = Math.max(0, line.unitPrice * quantity - discount);
    items.value[idx] = {
      ...line,
      quantity,
      discount,
      total: lineTotal,
      profit: lineTotal - line.product.costPrice * quantity,
    };
  }

  function updateItemPrice(lineId, unitPrice) {
    const idx = items.value.findIndex((i) => i.productId === lineId);
    if (idx < 0) return;
    const line = items.value[idx];
    const lineTotal = Math.max(0, unitPrice * line.quantity - line.discount);
    items.value[idx] = { ...line, unitPrice, total: lineTotal, profit: lineTotal - line.product.costPrice * line.quantity };
  }

  function updateItemDiscount(lineId, discount) {
    const idx = items.value.findIndex((i) => i.productId === lineId);
    if (idx < 0) return;
    const line = items.value[idx];
    const lineTotal = Math.max(0, line.unitPrice * line.quantity - discount);
    items.value[idx] = { ...line, discount, total: lineTotal, profit: lineTotal - line.product.costPrice * line.quantity };
  }

  function removeItem(lineId) {
    items.value = items.value.filter((i) => i.productId !== lineId);
  }

  function attachSoldUnit(lineId, unit) {
    const idx = items.value.findIndex((i) => i.productId === lineId);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], soldUnitId: unit.id, soldUnit: unit };
  }

  function detachSoldUnit(lineId) {
    const idx = items.value.findIndex((i) => i.productId === lineId);
    if (idx >= 0) {
      const { soldUnitId: _id, soldUnit: _unit, ...rest } = items.value[idx];
      items.value[idx] = rest;
    }
  }

  const setCustomer = (id) => (customerId.value = id);
  const setDiscount = (v) => (discountAmount.value = Math.max(0, v));
  const setTaxRate = (v) => (taxRate.value = Math.max(0, v));
  const setApplyTva = (v) => (applyTva.value = v);

  const addTradeIn = (device) => tradeInDevices.value.push(device);
  const removeTradeIn = (index) => tradeInDevices.value.splice(index, 1);
  const clearTradeIn = () => (tradeInDevices.value = []);

  function clear() {
    items.value = [];
    customerId.value = null;
    discountAmount.value = 0;
    taxRate.value = 20;
    applyTva.value = false;
    clearTradeIn();
  }

  // ── Return mode ──
  function setReturnMode(on) {
    isReturnMode.value = on;
    returnCustomer.value = null;
    items.value = [];
    customerId.value = null;
    discountAmount.value = 0;
    clearTradeIn();
  }

  function addReturnItem(item) {
    const exists = items.value.some((i) => i.productId === item.productId && i.transactionItemId === item.transactionItemId);
    if (exists) return;
    if (items.value.length === 0 && item.originalCustomerId && item.originalCustomerName) {
      returnCustomer.value = { id: item.originalCustomerId, name: item.originalCustomerName };
      customerId.value = item.originalCustomerId;
    }
    if (item.refundAmount === undefined) item.refundAmount = item.originalAmount || item.total;
    items.value.push(item);
  }

  function updateReturnRefundAmount(transactionItemId, amount) {
    const idx = items.value.findIndex((i) => i.transactionItemId === transactionItemId);
    if (idx < 0) return;
    const line = items.value[idx];
    line.refundAmount = Math.max(0, Math.min(amount, line.originalAmount || line.total));
    items.value[idx] = { ...line };
  }

  const totalRefund = computed(() =>
    isReturnMode.value ? items.value.reduce((s, i) => s + (i.refundAmount || i.total), 0) : 0,
  );
  const totalOriginal = computed(() =>
    isReturnMode.value ? items.value.reduce((s, i) => s + (i.originalAmount || i.total), 0) : 0,
  );

  function getCheckoutPayload() {
    return {
      customerId: customerId.value || undefined,
      items: items.value.map((i) => ({
        productId: i.realProductId ?? i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        soldUnitId: i.soldUnitId,
        ...(i.saleMode === 'pack' && { saleMode: 'pack' }),
      })),
      discountAmount: discountAmount.value,
      taxRate: applyTva.value ? taxRate.value : 0,
    };
  }

  function getTradeInPayload() {
    return tradeInDevices.value.length === 0 ? null : { ...getCheckoutPayload(), tradeInDevices: tradeInDevices.value };
  }

  return {
    items,
    customerId,
    discountAmount,
    taxRate,
    applyTva,
    subtotal,
    taxAmount,
    total,
    totalAfterTradeIn,
    totalProfit,
    itemCount,
    isEmpty,
    addItem,
    addPackItem,
    updateItemQuantity,
    updateItemPrice,
    updateItemDiscount,
    removeItem,
    attachSoldUnit,
    detachSoldUnit,
    setCustomer,
    setDiscount,
    setTaxRate,
    setApplyTva,
    clear,
    getCheckoutPayload,
    selectedEmployeeId,
    setSelectedEmployee,
    isReturnMode,
    returnCustomer,
    setReturnMode,
    addReturnItem,
    updateReturnRefundAmount,
    totalRefund,
    totalOriginal,
    hasTradeIn,
    tradeInDevices,
    totalTradeInValue,
    addTradeIn,
    removeTradeIn,
    clearTradeIn,
    getTradeInPayload,
  };
});

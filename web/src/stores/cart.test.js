import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCartStore } from './cart';

const cable = () => ({ id: 'p-cable', name: 'Câble USB-C', sku: 'CAB-1', barcode: '6111000000017', retailPrice: 50, costPrice: 20, stockQuantity: 10 });
const charger = () => ({ id: 'p-charger', name: 'Chargeur 20W', sku: 'CHG-1', barcode: '6111000000024', retailPrice: 120, costPrice: 70, stockQuantity: 5 });

describe('cart: selling price edited at the till', () => {
  let cart;
  beforeEach(() => {
    setActivePinia(createPinia());
    cart = useCartStore();
  });

  it('recalculates the line, subtotal, total and profit from the new price', () => {
    cart.addItem(cable(), 2);
    cart.addItem(charger());
    expect([cart.subtotal, cart.total, cart.totalProfit]).toEqual([220, 220, 110]);

    expect(cart.updateItemPrice('p-cable', '45,50')).toBe(true);
    const line = cart.items.find((i) => i.productId === 'p-cable');
    expect([line.unitPrice, line.total, line.profit]).toEqual([45.5, 91, 51]); // (45.50 − 20) × 2
    expect([cart.subtotal, cart.total, cart.totalProfit]).toEqual([211, 211, 101]);
  });

  it('keeps the edited price when the quantity changes or the same product is added again', () => {
    cart.addItem(cable());
    cart.updateItemPrice('p-cable', 40);
    cart.updateItemQuantity('p-cable', 3);
    cart.addItem(cable());
    const line = cart.items.find((i) => i.productId === 'p-cable');
    expect([line.quantity, line.unitPrice, line.total, line.profit]).toEqual([4, 40, 160, 80]);
    expect(cart.items).toHaveLength(1);
  });

  it('never changes the product price itself, and can go back to it', () => {
    const product = cable();
    cart.addItem(product);
    cart.updateItemPrice('p-cable', 30);
    expect(product.retailPrice).toBe(50);
    expect(cart.items[0].product.retailPrice).toBe(50);
    expect(cart.isPriceChanged(cart.items[0])).toBe(true);
    expect(cart.resetItemPrice('p-cable')).toBe(true);
    expect([cart.items[0].unitPrice, cart.items[0].total, cart.isPriceChanged(cart.items[0])]).toEqual([50, 50, false]);
  });

  it('refuses prices that are not positive amounts', () => {
    cart.addItem(cable());
    for (const bad of [0, -5, '', 'abc', '12,3,4', '1e3', Number.NaN, 20_000_000]) expect(cart.updateItemPrice('p-cable', bad)).toBe(false);
    expect([cart.items[0].unitPrice, cart.total]).toEqual([50, 50]);
  });

  it('sends the edited price to checkout, with the product id', () => {
    cart.addItem(cable(), 2);
    cart.updateItemPrice('p-cable', 42);
    expect(cart.getCheckoutPayload().items).toEqual([{ productId: 'p-cable', quantity: 2, unitPrice: 42, discount: 0, soldUnitId: undefined }]);
  });

  it('keeps box prices fixed and does not edit return lines', () => {
    cart.addPackItem({ ...cable(), packSize: 10, packRetailPrice: 450 });
    expect(cart.updateItemPrice('pack-p-cable', 30)).toBe(false);
    expect(cart.total).toBe(450);
    cart.setReturnMode(true);
    cart.addReturnItem({ productId: 'p-cable', transactionItemId: 't1', product: cable(), quantity: 1, unitPrice: 50, total: 50 });
    expect(cart.updateItemPrice('p-cable', 10)).toBe(false);
  });

  it('counts a scanned product twice as one line with quantity 2', () => {
    cart.addItem(cable());
    cart.addItem(cable());
    expect(cart.items).toHaveLength(1);
    expect([cart.items[0].quantity, cart.itemCount, cart.total]).toEqual([2, 2, 100]);
  });
});

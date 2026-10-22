/**
 * Cost of what is sold, as the POS product details show it: a product's cost price, a phone's purchase price.
 * Shared by every screen that displays a cost, so they never disagree.
 */
export const itemCost = (item, isUnit) => (item ? Number(isUnit ? item.purchasePrice : item.costPrice) || 0 : 0);

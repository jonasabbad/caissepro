import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('reports', () => {
  it('builds the sales, inventory, customers and suppliers reports from real records', async () => {
    const { api } = await newTenant();
    const coque = (await api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 20, minStockLevel: 5 })).body.data.product;
    await api.post('/products', { name: 'Câble', costPrice: 5, retailPrice: 20, stockQuantity: 3, minStockLevel: 5 });
    const phone = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 12', storage: '128 GB', condition: 'grade_a', purchasePrice: 3000, salePrice: 3800 })).body.data.unit;
    await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 12', storage: '64 GB', condition: 'grade_b', purchasePrice: 2500, salePrice: 3200 });
    const walid = (await api.post('/customers', { firstName: 'Walid', lastName: 'A' })).body.data.customer;
    const emp = (await api.post('/employees', { firstName: 'Youness' })).body.data.employee;
    const supplier = (await api.post('/suppliers', { name: 'Grossiste', phone: '0600' })).body.data.supplier;

    await api.post('/checkout', { employeeId: emp.id, customerId: walid.id, items: [{ soldUnitId: phone.id, quantity: 1, unitPrice: 3800 }], payments: [{ method: 'cash', amount: 3800 }] });
    await api.post('/checkout', { employeeId: emp.id, type: 'credit', customerId: walid.id, items: [{ productId: coque.id, quantity: 2, unitPrice: 50 }], payments: [{ method: 'card', amount: 40 }] });
    const order = (await api.post('/supplier-orders', { supplierId: supplier.id, items: [{ productId: coque.id, productName: 'Coque', quantityOrdered: 10, unitCost: 10 }] })).body.data.order;
    await api.post(`/supplier-orders/${order.id}/submit`);
    await api.post(`/supplier-orders/${order.id}/payment`, { amount: 30 });

    const q = `dateFrom=${day()}&dateTo=${day()}`;
    const sales = (await api.get(`/reports?type=sales&${q}`)).body.data.report;
    expect(sales.summary).toEqual(
      expect.objectContaining({ totalSales: 3900, totalTransactions: 2, completedTransactions: 1, partialTransactions: 1, totalProfit: 880, averageTransaction: 1950, totalItems: 3, totalAmountCollected: 3840, totalAmountPending: 60 }),
    );
    expect(sales.byDay).toEqual([{ date: day(), sales: 3900, transactions: 2, profit: 880 }]);
    expect(sales.bySeller).toEqual([{ employeeId: emp.id, name: 'Youness', sales: 3900, transactions: 2, profit: 880 }]);
    expect(sales.byPaymentMethod.map((m: any) => [m.method, m.amount])).toEqual([['cash', 3800], ['card', 40]]);
    expect(sales.recentSales.find((r: any) => r.type === 'unit')).toEqual(expect.objectContaining({ name: 'Apple iPhone 12', salePrice: 3800 }));

    const inv = (await api.get(`/reports?type=inventory&${q}`)).body.data.report;
    expect(inv.summary).toEqual(
      expect.objectContaining({ totalUnits: 2, unitsInStock: 1, unitsSold: 1, unitsValue: 3200, totalProducts: 2, productsInStock: 21, productsValue: 960, lowStockCount: 1, totalInventoryValue: 4160, stockHealthScore: 50 }),
    );
    expect(inv.lowStockAlerts.map((a: any) => [a.name, a.currentStock, a.minStock])).toEqual([['Câble', 3, 5]]);
    expect(inv.byBrand[0].models[0]).toEqual(expect.objectContaining({ model: 'iPhone 12', total: 2, inStock: 1, sold: 1, value: 3200 }));
    expect(inv.byBrand[0].models[0].variants).toHaveLength(2);
    expect(inv.byCategory[0].products.length + (inv.byCategory[1]?.products.length ?? 0)).toBe(2);

    const cust = (await api.get(`/reports?type=customers&${q}`)).body.data.report;
    expect(cust.summary).toEqual({ totalCustomers: 1, newCustomers: 1, totalDebt: 60, totalRevenue: 3900 });
    expect(cust.topCustomers).toEqual([{ customerId: walid.id, name: 'Walid A', purchases: 2, exchanges: 0, returns: 0, spent: 3900 }]);
    expect(cust.debtors).toEqual([{ customerId: walid.id, name: 'Walid A', debt: 60 }]);

    const sup = (await api.get(`/reports?type=suppliers&${q}`)).body.data.report;
    expect(sup.summary).toEqual({ totalSuppliers: 1, activeSuppliers: 1, totalOrders: 1, draftOrders: 0, totalSpent: 100, totalDebt: 70 });
    expect(sup.pendingOrders[0]).toEqual(expect.objectContaining({ orderNumber: order.orderNumber, supplier: 'Grossiste', amount: 100, amountPaid: 30, amountRemaining: 70 }));
    expect(sup.suppliersWithDebt).toEqual([{ supplierId: supplier.id, name: 'Grossiste', phone: '0600', debt: 70, overdue: 0 }]);

    const csv = await api.get(`/reports/export?type=sales&format=excel&${q}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(String(csv.text ?? csv.body)).toContain('Coque');
    expect((await api.get('/reports?type=nope')).status).toBe(400);
  });
});

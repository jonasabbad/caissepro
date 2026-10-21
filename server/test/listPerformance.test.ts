import { describe, expect, it } from 'vitest';
import { newTenant } from './helpers.js';

describe('lighter lists', () => {
  it('pages the repairs list with its totals and counts repairs per device without loading them', async () => {
    const { api } = await newTenant();
    const customer = (await api.post('/customers', { firstName: 'Walid', lastName: 'A' })).body.data.customer;
    const unit = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 12', condition: 'grade_a', purchasePrice: 3000, salePrice: 3800 })).body.data.unit;
    const unit2 = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 11', condition: 'grade_a', purchasePrice: 2000, salePrice: 2600 })).body.data.unit;
    for (let i = 0; i < 23; i++) {
      const soldUnitId = i === 0 ? unit.id : i === 1 ? unit2.id : undefined;
      const r = await api.post('/repairs', { customerId: customer.id, deviceDescription: `Écran ${i}`, fixedPrice: 100, ...(soldUnitId ? { soldUnitId } : {}) });
      expect(r.status).toBeLessThan(300);
    }
    const first = await api.patch(`/repairs/${(await api.get('/repairs?page=1&limit=20')).body.data.repairs[0].id}/status`, { status: 'delivered' });
    expect(first.status).toBeLessThan(500);

    const p1 = (await api.get('/repairs?page=1&limit=20')).body.data;
    const p2 = (await api.get('/repairs?page=2&limit=20')).body.data;
    expect([p1.repairs.length, p2.repairs.length]).toEqual([20, 3]);
    expect(p1.meta).toMatchObject({ total: 23, page: 1, totalPages: 2 });
    // "N repairs in progress" counts the whole list, not just the page.
    const all = (await api.get('/repairs')).body.data.repairs;
    expect(all).toHaveLength(23);
    expect(p1.meta.activeCount).toBe(all.filter((r: any) => ['pending', 'in_progress', 'completed'].includes(r.status)).length);
    // Pages do not overlap and follow the full list's order.
    expect([...p1.repairs, ...p2.repairs].map((r: any) => r.id)).toEqual(all.map((r: any) => r.id));
    // Filters apply to the page and to its totals.
    expect((await api.get('/repairs?page=1&limit=20&query=%C3%89cran%201')).body.data.meta.total).toBe(all.filter((r: any) => r.deviceDescription.startsWith('Écran 1')).length);

    expect((await api.get('/repairs/counts-by-unit')).body.data.counts).toEqual({ [unit.id]: 1, [unit2.id]: 1 });
  });
});

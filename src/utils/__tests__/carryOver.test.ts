import { carryOverFields } from '../carryOver';
import type { Item } from '../../models/types';

const base: Item = {
  id: 'i1', listId: 'old', name: 'Calpol', quantity: '2', price: 3.5, checked: false,
  createdBy: 'u1', createdAt: 1, updatedAt: 2, syncStatus: 'synced',
  category: 'Health', sortOrder: 9, unitQty: 2, measurementUnit: 'ml', measurementValue: 100,
};

describe('carryOverFields (Partial Shop)', () => {
  test('an urgent item stays urgent', () => {
    expect(carryOverFields({ ...base, isUrgent: true }).isUrgent).toBe(true);
  });

  test('not urgent, missing or a stray non-boolean value is not urgent', () => {
    expect(carryOverFields({ ...base, isUrgent: false }).isUrgent).toBe(false);
    expect(carryOverFields(base).isUrgent).toBe(false);
    expect(carryOverFields({ ...base, isUrgent: 'true' as any }).isUrgent).toBe(false);
  });

  test('copies exactly name, quantity, price, unit count, category and urgent', () => {
    expect(carryOverFields({ ...base, isUrgent: true })).toEqual({
      name: 'Calpol', quantity: '2', price: 3.5, unitQty: 2, category: 'Health', isUrgent: true,
    });
  });

  test('nulls become undefined quantity/price and null unit count; category null kept', () => {
    expect(carryOverFields({ ...base, quantity: null, price: null, unitQty: null, category: null })).toEqual({
      name: 'Calpol', quantity: undefined, price: undefined, unitQty: null, category: null, isUrgent: false,
    });
  });

  test('a free item keeps its £0 price', () => {
    expect(carryOverFields({ ...base, price: 0 }).price).toBe(0);
  });
});

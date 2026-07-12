import { calculateShoppingStats } from '../shoppingStats';
import { Item } from '../../models/types';

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 'item-1',
  listId: 'list-1',
  name: 'Milk',
  quantity: null,
  price: null,
  checked: false,
  createdBy: 'u1',
  createdAt: 1000,
  updatedAt: 1000,
  syncStatus: 'synced',
  ...overrides,
});

describe('calculateShoppingStats', () => {
  it('returns zeros for empty/null input', () => {
    expect(calculateShoppingStats([], {})).toEqual({ checked: 0, unchecked: 0, total: 0 });
    expect(calculateShoppingStats(null, {})).toEqual({ checked: 0, unchecked: 0, total: 0 });
    expect(calculateShoppingStats(undefined, {})).toEqual({ checked: 0, unchecked: 0, total: 0 });
  });

  it('counts checked and unchecked items', () => {
    const items = [
      makeItem({ id: 'a', checked: true }),
      makeItem({ id: 'b', checked: false }),
      makeItem({ id: 'c', checked: true }),
    ];
    const stats = calculateShoppingStats(items, {});
    expect(stats.checked).toBe(2);
    expect(stats.unchecked).toBe(1);
  });

  it('totals CHECKED items only — unchecked prices must not count (1.30.2 fix)', () => {
    const items = [
      makeItem({ id: 'a', checked: true, price: 2 }),
      makeItem({ id: 'b', checked: false, price: 100 }),
    ];
    expect(calculateShoppingStats(items, {}).total).toBe(2);
  });

  it('uses predicted price when the item has no explicit price', () => {
    const items = [makeItem({ id: 'a', name: 'Bread', checked: true, price: null })];
    expect(calculateShoppingStats(items, { bread: 1.5 }).total).toBe(1.5);
  });

  it('prefers explicit price over predicted, including price 0', () => {
    const items = [makeItem({ id: 'a', name: 'Bread', checked: true, price: 0 })];
    expect(calculateShoppingStats(items, { bread: 1.5 }).total).toBe(0);
  });

  it('multiplies by unitQty (defaulting to 1)', () => {
    const items = [
      makeItem({ id: 'a', checked: true, price: 2, unitQty: 3 }),
      makeItem({ id: 'b', checked: true, price: 5, unitQty: null }),
    ];
    expect(calculateShoppingStats(items, {}).total).toBe(11);
  });

  it('filters out invalid items without ids', () => {
    const items = [makeItem({ id: 'a', checked: true, price: 1 }), { id: '' } as Item, null as unknown as Item];
    const stats = calculateShoppingStats(items, {});
    expect(stats.checked).toBe(1);
    expect(stats.unchecked).toBe(0);
    expect(stats.total).toBe(1);
  });

  it('tolerates a missing predictions map', () => {
    const items = [makeItem({ id: 'a', checked: true, price: null })];
    expect(calculateShoppingStats(items, null).total).toBe(0);
  });
});

import type { Item, ReceiptLineItem } from '../../models/types';
import { groupLinesByItem, planItemUpdates, ReceiptLinks } from '../receiptLinks';

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    listId: 'list-1',
    name: overrides.id,
    quantity: null,
    price: null,
    checked: false,
    createdBy: 'user-1',
    createdAt: 0,
    updatedAt: 0,
    syncStatus: 'synced',
    ...overrides,
  } as Item;
}

function line(description: string, price: number | null): ReceiptLineItem {
  return { description, price, quantity: null, unitPrice: null, vatCode: null };
}

const link = (listItemId: string, ignored = false) =>
  ({ listItemId, method: 'manual' as const, score: 1, ignored });

describe('groupLinesByItem', () => {
  test('groups accepted lines by item in printed order and drops ignored ones', () => {
    const links: ReceiptLinks = { 3: link('milk'), 0: link('milk'), 1: link('bread', true), 2: link('eggs') };
    const grouped = groupLinesByItem(links);
    expect(grouped.get('milk')).toEqual([0, 3]);
    expect(grouped.get('eggs')).toEqual([2]);
    expect(grouped.has('bread')).toBe(false);
  });
});

describe('planItemUpdates', () => {
  const lines = [line('MILK', 1.1), line('BREAD', 1.5), line('MILK', 1.1)];

  test('two lines on one item sum into its price and check it', () => {
    const items = new Map([['milk', makeItem({ id: 'milk' })]]);
    const updates = planItemUpdates(new Map([['milk', [0, 2]]]), lines, items);
    expect(updates).toHaveLength(1);
    expect(updates[0].updates.price).toBeCloseTo(2.2);
    expect(updates[0].updates.checked).toBe(true);
  });

  test('an already-priced item gets the receipt price', () => {
    const items = new Map([['bread', makeItem({ id: 'bread', price: 1.2, checked: true })]]);
    expect(planItemUpdates(new Map([['bread', [1]]]), lines, items))
      .toEqual([{ id: 'bread', updates: { price: 1.5 } }]);
  });

  test('an item that would not change is not rewritten', () => {
    const items = new Map([['bread', makeItem({ id: 'bread', price: 1.5, checked: true })]]);
    expect(planItemUpdates(new Map([['bread', [1]]]), lines, items)).toEqual([]);
  });

  test('an item missing from the list is skipped', () => {
    expect(planItemUpdates(new Map([['gone', [0]]]), lines, new Map())).toEqual([]);
  });
});

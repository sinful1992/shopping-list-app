/**
 * getItemsGroupedByList replaces a query per list in the price-history and
 * search paths. It must return the same items getItemsForList would, per
 * list and in the same order, including across the 500-id chunk boundary.
 * Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */

import LocalStorageManager from '../LocalStorageManager';
import { Item } from '../../models/types';

const makeItem = (listId: string, name: string, createdAt: number): Item => ({
  id: `${listId}-${name}`,
  listId,
  name,
  quantity: null,
  price: 1,
  checked: true,
  createdBy: 'user-1',
  createdAt,
  updatedAt: createdAt,
  syncStatus: 'synced',
});

describe('getItemsGroupedByList', () => {
  it('groups by list and keeps created_at order', async () => {
    // created_at is stamped by WatermelonDB on save, so order comes from
    // saving apart, not from the value passed in.
    await LocalStorageManager.saveItemsBatch([makeItem('g-a', 'first', 0), makeItem('g-b', 'only', 0)]);
    await new Promise(resolve => setTimeout(resolve, 5));
    await LocalStorageManager.saveItemsBatch([makeItem('g-a', 'second', 0)]);
    const grouped = await LocalStorageManager.getItemsGroupedByList(['g-a', 'g-b', 'g-none']);
    expect(grouped.get('g-a')?.map(i => i.name)).toEqual(['first', 'second']);
    expect(grouped.get('g-b')?.map(i => i.name)).toEqual(['only']);
    expect(grouped.has('g-none')).toBe(false);
    expect(await LocalStorageManager.getItemsForList('g-a')).toEqual(grouped.get('g-a'));
  });

  it('returns items for lists past the 500-id chunk boundary', async () => {
    const listIds = Array.from({ length: 1203 }, (_, i) => `chunk-${i}`);
    await LocalStorageManager.saveItemsBatch([
      makeItem('chunk-0', 'x', 1),
      makeItem('chunk-700', 'y', 1),
      makeItem('chunk-1202', 'z', 1),
    ]);
    const grouped = await LocalStorageManager.getItemsGroupedByList(listIds);
    expect([...grouped.keys()].sort()).toEqual(['chunk-0', 'chunk-1202', 'chunk-700']);
  });

  it('an empty id list makes no query and returns nothing', async () => {
    expect((await LocalStorageManager.getItemsGroupedByList([])).size).toBe(0);
  });
});

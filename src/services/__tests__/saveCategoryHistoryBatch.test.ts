/**
 * Guards against regressions in saveCategoryHistoryBatch.
 *
 * Key invariant: category must come from entry.category (the Firebase node key),
 * never from data.category. This test passes data.category as a deliberately
 * wrong value to prove it is ignored.
 */

jest.mock('@react-native-firebase/database', () => () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import LocalStorageManager from '../LocalStorageManager';

describe('LocalStorageManager.saveCategoryHistoryBatch', () => {
  const GROUP = 'test-group';

  it('uses entry.category as the record category, not data.category', async () => {
    const entries = [
      {
        itemHash: 'banana',
        category: 'Produce',
        data: { category: 'WRONG_SHOULD_BE_IGNORED', usageCount: 2, lastUsedAt: Date.now(), createdAt: Date.now() },
      },
    ];

    await LocalStorageManager.saveCategoryHistoryBatch(GROUP, entries);

    const records = await LocalStorageManager.getCategoryHistoryForItem(GROUP, 'banana');
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('Produce');
    expect(records[0].category).not.toBe('WRONG_SHOULD_BE_IGNORED');
  });

  it('correctly handles multiple categories for the same item', async () => {
    const entries = [
      { itemHash: 'butter', category: 'Dairy', data: { usageCount: 3, lastUsedAt: Date.now(), createdAt: Date.now() } },
      { itemHash: 'butter', category: 'Baking', data: { usageCount: 1, lastUsedAt: Date.now(), createdAt: Date.now() } },
    ];

    await LocalStorageManager.saveCategoryHistoryBatch(GROUP, entries);

    const records = await LocalStorageManager.getCategoryHistoryForItem(GROUP, 'butter');
    const categories = records.map(r => r.category).sort();
    expect(categories).toEqual(['Baking', 'Dairy']);
  });
});

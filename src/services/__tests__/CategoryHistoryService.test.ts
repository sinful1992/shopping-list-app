/**
 * CategoryHistoryService: which category an item usually goes in, used for
 * suggestions and the "which category?" chooser. Was 25 % covered.
 *
 * Bug found covering it (Fable audit task 137): '/' was not removed from the
 * Firebase key, so "Bread/rolls" wrote categoryHistory/bread/rolls/<cat> and
 * every phone then read item "bread" with a category "rolls".
 */
const mockLSM = {
  getCategoryHistoryForItem: jest.fn(),
  updateCategoryHistory: jest.fn(async () => {}),
  saveCategoryHistory: jest.fn(async () => {}),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
const mockRef = jest.fn((_db: unknown, path: string) => path);
const mockTransaction = jest.fn();
function mockFirebase() {
  return { getDatabase: () => ({}), ref: (d: unknown, p: string) => mockRef(d, p), runTransaction: (...a: unknown[]) => mockTransaction(...a) };
}
jest.mock('@react-native-firebase/database', () => mockFirebase());

import CategoryHistoryService from '../CategoryHistoryService';
import { isCategoryUsageRecord } from '../FirebaseSyncListener';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockLSM.getCategoryHistoryForItem.mockResolvedValue([]);
  mockTransaction.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('recordCategoryUsage', () => {
  it('a first use saves a record with count 1 under the normalized name', async () => {
    await CategoryHistoryService.recordCategoryUsage('fam', '  Milk ', 'dairy');
    expect(mockLSM.getCategoryHistoryForItem).toHaveBeenCalledWith('fam', 'milk');
    expect(mockLSM.saveCategoryHistory).toHaveBeenCalledWith(expect.objectContaining({
      familyGroupId: 'fam', itemNameNormalized: 'milk', category: 'dairy', usageCount: 1, lastUsedAt: NOW, createdAt: NOW,
    }));
  });

  it('a known category counts up', async () => {
    mockLSM.getCategoryHistoryForItem.mockResolvedValue([{ id: 'h1', category: 'dairy', usageCount: 4 }, { id: 'h2', category: 'other', usageCount: 9 }]);
    await CategoryHistoryService.recordCategoryUsage('fam', 'Milk', 'dairy');
    expect(mockLSM.updateCategoryHistory).toHaveBeenCalledWith('h1', { usageCount: 5, lastUsedAt: NOW });
    expect(mockLSM.saveCategoryHistory).not.toHaveBeenCalled();
  });

  it('no category or an empty name: nothing recorded', async () => {
    await CategoryHistoryService.recordCategoryUsage('fam', 'Milk', null);
    await CategoryHistoryService.recordCategoryUsage('fam', '   ', 'dairy');
    expect(mockLSM.getCategoryHistoryForItem).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['Bread/rolls', 'bread_rolls'],
    ['St. Ivel', 'st_ ivel'],
    ['a#b$c[d]e', 'a_b_c_d_e'],
    ['salt & pepper', 'salt & pepper'],
  ])('%s is written under one safe key (%s), never a deeper path', async (name, key) => {
    await CategoryHistoryService.recordCategoryUsage('fam', name, 'dairy');
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), `/familyGroups/fam/categoryHistory/${key}/dairy`);
  });

  it('the Firebase count starts at 1 and then adds 1, keeping other fields', async () => {
    await CategoryHistoryService.recordCategoryUsage('fam', 'Milk', 'dairy');
    const update = mockTransaction.mock.calls[0][1];
    expect(update(null)).toEqual({ usageCount: 1, lastUsedAt: NOW, createdAt: NOW });
    expect(update({ usageCount: 2, createdAt: 5 })).toEqual({ usageCount: 3, lastUsedAt: NOW, createdAt: 5 });
    expect(update({ createdAt: 5 })).toEqual({ usageCount: 1, lastUsedAt: NOW, createdAt: 5 });
  });

  it('local or Firebase failures never throw (background work)', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('offline'));
    await expect(CategoryHistoryService.recordCategoryUsage('fam', 'Milk', 'dairy')).resolves.toBeUndefined();
    mockLSM.getCategoryHistoryForItem.mockRejectedValueOnce(new Error('db'));
    await expect(CategoryHistoryService.recordCategoryUsage('fam', 'Milk', 'dairy')).resolves.toBeUndefined();
  });
});

describe('reading categories', () => {
  it('one entry per category (highest count), most used then most recent first', async () => {
    mockLSM.getCategoryHistoryForItem.mockResolvedValue([
      { category: 'dairy', usageCount: 2, lastUsedAt: 10 },
      { category: 'dairy', usageCount: 5, lastUsedAt: 1 },
      { category: 'other', usageCount: 5, lastUsedAt: 20 },
      { category: 'bakery', usageCount: 1, lastUsedAt: 99 },
    ]);
    expect(await CategoryHistoryService.getCategoriesForItem('fam', ' MILK ')).toEqual([
      { category: 'other', usageCount: 5, lastUsedAt: 20 },
      { category: 'dairy', usageCount: 5, lastUsedAt: 1 },
      { category: 'bakery', usageCount: 1, lastUsedAt: 99 },
    ]);
    expect(await CategoryHistoryService.getSuggestedCategory('fam', 'milk')).toBe('other');
  });

  it('nothing known, or a read error: no categories, no suggestion', async () => {
    expect(await CategoryHistoryService.getSuggestedCategory('fam', 'x')).toBeNull();
    mockLSM.getCategoryHistoryForItem.mockRejectedValue(new Error('db'));
    expect(await CategoryHistoryService.getCategoriesForItem('fam', 'x')).toEqual([]);
  });
});

describe('isCategoryUsageRecord (the reader skips what is not a usage record)', () => {
  it.each([
    [{ usageCount: 1, lastUsedAt: 2 }, true],
    [{ usageCount: 0 }, true],
    [{ dairy: { usageCount: 1 } }, false],
    [{ usageCount: '1' }, false],
    [null, false],
    [5, false],
  ])('%j -> %s', (data, want) => {
    expect(isCategoryUsageRecord(data)).toBe(want);
  });
});

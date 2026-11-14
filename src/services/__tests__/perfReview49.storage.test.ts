/**
 * Task 49 part C, safe fixes. Runs against real WatermelonDB on the in-memory
 * LokiJS adapter.
 * - P5: a new price row updates the variant cache in place instead of
 *   dropping it, so the next priced check-off does not re-read the table; the
 *   lookups stay right.
 * - P4: the category-history and store-layout batch savers (run on every
 *   foreground return) skip rows that did not change.
 * - P10: smart suggestions are cached per item set, not per family group.
 */
jest.mock('@react-native-firebase/database', () => () => ({}));

import LocalStorageManager from '../LocalStorageManager';
import PriceHistoryService from '../PriceHistoryService';
import { PriceHistoryRecord } from '../../models/types';

let n = 0;
const rec = (familyGroupId: string, itemName: string, price: number, storeName = 'Tesco', extra: Partial<PriceHistoryRecord> = {}): PriceHistoryRecord => ({
  id: `perf-price-${++n}`, itemName, itemNameNormalized: itemName.toLowerCase().trim(), price, storeName,
  listId: 'list-1', recordedAt: 1000 + n, familyGroupId, ...extra,
});

const history = () => (LocalStorageManager as any).history;
const db = () => (LocalStorageManager as any).database;

describe('P5 price variant cache', () => {
  it('a new row joins the cached variants without a table re-read, and is found', async () => {
    const g = 'perf-g1';
    await LocalStorageManager.savePriceHistoryRecord(rec(g, 'Avocado', 1));
    expect((await LocalStorageManager.getPriceHistoryForItem(g, 'avocado')).map(r => r.price)).toEqual([1]);
    const cached = history().priceVariants.get(g);
    expect(cached).toBeDefined();

    // The plural is a new name in the same group.
    await LocalStorageManager.savePriceHistoryRecord(rec(g, 'Avocados', 2));
    expect(history().priceVariants.get(g)).toBe(cached);

    const query = jest.spyOn(db().get('price_history'), 'query');
    const found = await LocalStorageManager.getPriceHistoryForItem(g, 'avocado');
    expect(found.map(r => r.price).sort()).toEqual([1, 2]);
    // One query for the rows; none to rebuild the variant map.
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRestore();
  });

  it('an unchanged echo of this phone’s own write keeps the cache', async () => {
    const g = 'perf-g2';
    const r = rec(g, 'Milk', 1.1);
    await LocalStorageManager.savePriceHistoryRecord(r);
    await LocalStorageManager.getPriceHistoryForItem(g, 'milk');
    const cached = history().priceVariants.get(g);
    await LocalStorageManager.savePriceHistoryRecord({ ...r });
    expect(history().priceVariants.get(g)).toBe(cached);
  });

  it('a row renamed by a correction drops the cache, and the old name stops matching', async () => {
    const g = 'perf-g3';
    const r = rec(g, 'Bred', 1);
    await LocalStorageManager.savePriceHistoryRecord(r);
    expect(await LocalStorageManager.getPriceHistoryForItem(g, 'bred')).toHaveLength(1);
    await LocalStorageManager.savePriceHistoryRecord({ ...r, itemName: 'Bread', itemNameNormalized: 'bread' });
    expect(history().priceVariants.get(g)).toBeUndefined();
    expect(await LocalStorageManager.getPriceHistoryForItem(g, 'bred')).toHaveLength(0);
    expect(await LocalStorageManager.getPriceHistoryForItem(g, 'bread')).toHaveLength(1);
  });

  it('a batch of new rows also updates in place and is found', async () => {
    const g = 'perf-g4';
    await LocalStorageManager.savePriceHistoryRecord(rec(g, 'Tomato', 1));
    await LocalStorageManager.getPriceHistoryForItem(g, 'tomato');
    const cached = history().priceVariants.get(g);
    await LocalStorageManager.savePriceHistoryBatch([rec(g, 'Tomatoes', 2), rec(g, 'Cheese', 3)]);
    expect(history().priceVariants.get(g)).toBe(cached);
    expect((await LocalStorageManager.getPriceHistoryForItem(g, 'tomato')).map(r => r.price).sort()).toEqual([1, 2]);
    expect(await LocalStorageManager.getPriceHistoryForItem(g, 'cheese')).toHaveLength(1);
  });

  it('a batch correction that renames drops the cache', async () => {
    const g = 'perf-g5';
    const r = rec(g, 'Chese', 3);
    await LocalStorageManager.savePriceHistoryRecord(r);
    await LocalStorageManager.getPriceHistoryForItem(g, 'chese');
    await LocalStorageManager.savePriceHistoryBatch([{ ...r, itemName: 'Cheese', itemNameNormalized: 'cheese', price: 3.5 }]);
    expect(history().priceVariants.get(g)).toBeUndefined();
    expect(await LocalStorageManager.getPriceHistoryForItem(g, 'cheese')).toHaveLength(1);
  });
});

describe('P4 batch savers skip unchanged rows', () => {
  it('category history: the same snapshot twice writes once; a real change still lands', async () => {
    const g = 'perf-cat';
    const entries = [{ itemHash: 'milk', category: 'Dairy', data: { usageCount: 3, lastUsedAt: 5000, createdAt: 1 } }];
    await LocalStorageManager.saveCategoryHistoryBatch(g, entries);
    const batch = jest.spyOn(db(), 'batch');
    await LocalStorageManager.saveCategoryHistoryBatch(g, entries);
    expect(batch).not.toHaveBeenCalled();
    await LocalStorageManager.saveCategoryHistoryBatch(g, [{ ...entries[0], data: { usageCount: 4, lastUsedAt: 6000, createdAt: 1 } }]);
    expect(batch).toHaveBeenCalledTimes(1);
    batch.mockRestore();
    const [row] = await LocalStorageManager.getCategoryHistoryForItem(g, 'milk');
    expect(row.usageCount).toBe(4);
  });

  it('store layouts: the same synced snapshot twice writes once; a new order still lands', async () => {
    const g = 'perf-layout';
    const data = { familyGroupId: g, storeName: 'Tesco', categoryOrder: ['Dairy', 'Bakery'], createdBy: 'u', updatedAt: 100 };
    await LocalStorageManager.saveStoreLayoutsBatch(g, [{ layoutId: 'perf-l1', data }]);
    const batch = jest.spyOn(db(), 'batch');
    await LocalStorageManager.saveStoreLayoutsBatch(g, [{ layoutId: 'perf-l1', data }]);
    expect(batch).not.toHaveBeenCalled();
    await LocalStorageManager.saveStoreLayoutsBatch(g, [{ layoutId: 'perf-l1', data: { ...data, categoryOrder: ['Bakery', 'Dairy'], updatedAt: 200 } }]);
    expect(batch).toHaveBeenCalledTimes(1);
    batch.mockRestore();
  });
});

describe('P10 smart suggestions cache', () => {
  afterEach(() => PriceHistoryService.clearSuggestionsCache());

  it('a second list with other items gets its own suggestions, not the first list’s', async () => {
    const g = 'perf-sugg';
    await LocalStorageManager.savePriceHistoryBatch([
      rec(g, 'Butter', 1.5, 'Lidl'), rec(g, 'Butter', 2.5, 'Tesco'),
      rec(g, 'Eggs', 2.0, 'Aldi'), rec(g, 'Eggs', 3.0, 'Tesco'),
    ]);
    const listA = await PriceHistoryService.getSmartSuggestions(g, ['butter']);
    const listB = await PriceHistoryService.getSmartSuggestions(g, ['eggs']);
    expect(listA.get('butter')?.bestStore).toBe('Lidl');
    expect(listB.get('eggs')?.bestStore).toBe('Aldi');
    expect(listB.has('butter')).toBe(false);
  });

  it('the same items in another order or case hit the cache', async () => {
    const g = 'perf-sugg2';
    await LocalStorageManager.savePriceHistoryBatch([rec(g, 'Jam', 1, 'Lidl'), rec(g, 'Jam', 2, 'Tesco'), rec(g, 'Tea', 1, 'Aldi'), rec(g, 'Tea', 2, 'Tesco')]);
    const first = await PriceHistoryService.getSmartSuggestions(g, ['jam', 'tea']);
    const again = await PriceHistoryService.getSmartSuggestions(g, ['Tea', 'jam ']);
    expect(again).toBe(first);
  });
});

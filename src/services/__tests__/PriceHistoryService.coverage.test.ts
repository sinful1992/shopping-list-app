/**
 * PriceHistoryService: price records, the Price History sheet's stats, store
 * comparison, volatility and Smart Savings. Was 38 % covered (Fable audit
 * task 137). Bugs found covering it: a latest price of 0.00 was reported as
 * no current price, and all-free histories gave NaN % and infinite volatility.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  },
}));
const mockLSM = {
  savePriceHistoryRecord: jest.fn(async (_r: any) => {}),
  savePriceHistoryBatch: jest.fn(async (_r: any[]) => {}),
  getDistinctTrackedItems: jest.fn(),
  getPriceHistoryForItem: jest.fn(),
  getCompletedLists: jest.fn(),
  getItemsGroupedByList: jest.fn(),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
const mockSet = jest.fn();
const mockUpdate = jest.fn();
function mockFirebase() {
  return { getDatabase: () => ({}), ref: (_d: unknown, p?: string) => p ?? '/', set: (...a: unknown[]) => mockSet(...a), update: (...a: unknown[]) => mockUpdate(...a) };
}
jest.mock('@react-native-firebase/database', () => mockFirebase());
const mockRecordError = jest.fn();
const mockLog = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a), log: (...a: unknown[]) => mockLog(...a) } }));

const NOW = 1_800_000_000_000;
const DAY = 24 * 3600 * 1000;
let svc: any;
const settle = () => new Promise(r => setTimeout(r, 0));
const rec = (price: number, recordedAt: number, storeName: string | null = 'Tesco', listId: string | null = 'l1') =>
  ({ price, recordedAt, storeName, listId });

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockStore.clear();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockSet.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
  mockLSM.getPriceHistoryForItem.mockResolvedValue([]);
  mockLSM.getCompletedLists.mockResolvedValue([]);
  mockLSM.getItemsGroupedByList.mockResolvedValue(new Map());
  svc = require('../PriceHistoryService').default;
});
afterEach(() => jest.restoreAllMocks());

describe('recordPrice', () => {
  it('saves locally then writes Firebase under the record id', async () => {
    await svc.recordPrice('fam', ' Milk ', 1.2, 'Tesco', 'l1', 'item_l1_i1');
    const r = { id: 'item_l1_i1', itemName: ' Milk ', itemNameNormalized: 'milk', price: 1.2, storeName: 'Tesco', listId: 'l1', recordedAt: NOW, familyGroupId: 'fam' };
    expect(mockLSM.savePriceHistoryRecord).toHaveBeenCalledWith(r);
    expect(mockSet).toHaveBeenCalledWith('familyGroups/fam/priceHistory/item_l1_i1', r);
  });

  it('no id: a fresh one; a local failure stops before Firebase; a Firebase failure is reported', async () => {
    await svc.recordPrice('fam', 'Milk', 1, null, 'l1');
    expect(mockLSM.savePriceHistoryRecord.mock.calls[0][0].id).toMatch(/^[0-9a-f-]{36}$/);
    mockLSM.savePriceHistoryRecord.mockRejectedValueOnce(new Error('db'));
    mockSet.mockClear();
    await svc.recordPrice('fam', 'Milk', 1, null, 'l1');
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'PriceHistoryService.recordPrice local');
    mockSet.mockRejectedValueOnce(new Error('offline'));
    await svc.recordPrice('fam', 'Milk', 1, null, 'l1');
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'PriceHistoryService.recordPrice firebase');
  });
});

describe('getPriceHistory', () => {
  it('table records become points; sinceDate drops older ones; a missing listId is blank', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(1, 10), rec(2, 20, null, null)]);
    expect(await svc.getPriceHistory('fam', ' MILK ')).toEqual([
      { price: 1, date: 10, storeName: 'Tesco', listId: 'l1' },
      { price: 2, date: 20, storeName: null, listId: '' },
    ]);
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledWith('fam', 'milk');
    expect(await svc.getPriceHistory('fam', 'milk', 15)).toHaveLength(1);
  });

  it('no records after the backfill: empty, no legacy scan', async () => {
    mockStore.set('priceHistoryBackfillDone_v1_fam', 'true');
    expect(await svc.getPriceHistory('fam', 'milk')).toEqual([]);
    expect(mockLSM.getCompletedLists).not.toHaveBeenCalled();
  });

  it('before the backfill: rebuilt from completed lists (grouped names, priced only, oldest first)', async () => {
    mockLSM.getCompletedLists.mockResolvedValue([
      { id: 'a', completedAt: 30, createdAt: 1, storeName: 'Aldi' },
      { id: 'b', completedAt: null, createdAt: 5, storeName: '' },
    ]);
    mockLSM.getItemsGroupedByList.mockResolvedValue(new Map([
      ['a', [{ name: 'Milk', price: 1.1 }, { name: 'Bread', price: 1 }, { name: 'milk', price: null }]],
      ['b', [{ name: 'MILK', price: 0.9 }]],
    ]));
    expect(await svc.getPriceHistory('fam', 'milk')).toEqual([
      { price: 0.9, date: 5, storeName: null, listId: 'b' },
      { price: 1.1, date: 30, storeName: 'Aldi', listId: 'a' },
    ]);
    expect(mockLog).toHaveBeenCalled();
  });
});

describe('getPriceStats', () => {
  it('lowest, highest, average, latest and an upward trend', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(1, 1), rec(1, 2), rec(1.6, 3)]);
    const s = await svc.getPriceStats('fam', 'Milk');
    expect(s).toEqual(expect.objectContaining({ itemName: 'Milk', currentPrice: 1.6, lowestPrice: 1, highestPrice: 1.6, totalPurchases: 3, trend: 'up' }));
    expect(s.averagePrice).toBeCloseTo(1.2);
    expect(s.percentageChange).toBeCloseTo(33.33, 1);
  });

  it('down, and stable within 5 %', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(2, 1), rec(1, 2)]);
    expect((await svc.getPriceStats('fam', 'x')).trend).toBe('down');
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(1, 1), rec(1.04, 2)]);
    expect((await svc.getPriceStats('fam', 'x')).trend).toBe('stable');
  });

  it('a latest price of 0.00 is the current price, not "none"', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(2, 1), rec(0, 2)]);
    const s = await svc.getPriceStats('fam', 'x');
    expect(s.currentPrice).toBe(0);
    expect(s.trend).toBe('down');
  });

  it('only free purchases: 0 % change, not NaN', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(0, 1), rec(0, 2)]);
    const s = await svc.getPriceStats('fam', 'x');
    expect(s.percentageChange).toBe(0);
    expect(s.trend).toBe('stable');
  });

  it('no history, or an error: null', async () => {
    mockStore.set('priceHistoryBackfillDone_v1_fam', 'true');
    expect(await svc.getPriceStats('fam', 'x')).toBeNull();
    mockLSM.getPriceHistoryForItem.mockRejectedValue(new Error('db'));
    expect(await svc.getPriceStats('fam', 'x')).toBeNull();
  });
});

describe('getPriceByStore', () => {
  it('per store: average, lowest, highest, count; no store is "Unknown"', async () => {
    mockLSM.getPriceHistoryForItem.mockResolvedValue([rec(1, 1, 'Tesco'), rec(2, 2, 'Tesco'), rec(3, 3, null)]);
    expect(await svc.getPriceByStore('fam', 'x')).toEqual({
      Tesco: { average: 1.5, lowest: 1, highest: 2, count: 2 },
      Unknown: { average: 3, lowest: 3, highest: 3, count: 1 },
    });
  });

  it('an error gives no stores', async () => {
    mockLSM.getPriceHistoryForItem.mockRejectedValue(new Error('db'));
    expect(await svc.getPriceByStore('fam', 'x')).toEqual({});
  });
});

describe('getMostVolatileItems', () => {
  beforeEach(() => {
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a' }]);
    mockLSM.getItemsGroupedByList.mockResolvedValue(new Map([['a', [
      { name: 'Avocados', price: 1 }, { name: 'avocado', price: 1 }, { name: 'Milk', price: 1 }, { name: 'Free', price: 0 }, { name: 'Tea', price: null },
    ]]]));
    mockLSM.getPriceHistoryForItem.mockImplementation(async (_f: string, name: string) => ({
      avocado: [rec(1, 1), rec(3, 2)],
      milk: [rec(1, 1), rec(1.1, 2)],
      free: [rec(0, 1), rec(0, 2)],
    } as Record<string, unknown[]>)[name] ?? [rec(1, 1)]);
  });

  it('biggest swing first, one bar per item group, named by a real stored name; all-free items left out', async () => {
    const v = await svc.getMostVolatileItems('fam');
    expect(v.map((x: any) => x.itemName)).toEqual(['avocado', 'milk']);
    expect(v[0]).toEqual({ itemName: 'avocado', volatility: 100, priceRange: 2 });
    expect(v.every((x: any) => Number.isFinite(x.volatility))).toBe(true);
  });

  it('limit, and an error gives none', async () => {
    expect(await svc.getMostVolatileItems('fam', 1)).toHaveLength(1);
    mockLSM.getCompletedLists.mockRejectedValue(new Error('db'));
    expect(await svc.getMostVolatileItems('fam')).toEqual([]);
  });
});

describe('getSmartSuggestions', () => {
  beforeEach(() => {
    mockLSM.getPriceHistoryForItem.mockImplementation(async (_f: string, name: string) => ({
      milk: [rec(1, NOW - 200 * DAY, 'Tesco'), rec(1.5, NOW - DAY, 'Aldi'), rec(0.8, NOW - DAY, 'Lidl')],
      bread: [rec(1, 1, 'Tesco')],
    } as Record<string, unknown[]>)[name] ?? []);
  });

  it('the cheapest store and the saving against the average of stores', async () => {
    const s = await svc.getSmartSuggestions('fam', ['Milk', 'Bread', '', '  ']);
    expect([...s.keys()]).toEqual(['milk']);
    expect(s.get('milk').bestStore).toBe('Lidl');
    expect(s.get('milk').bestPrice).toBe(0.8);
    expect(s.get('milk').savings).toBeCloseTo(0.3, 3);
  });

  it('a window leaves out older prices', async () => {
    const s = await svc.getSmartSuggestions('fam', ['milk'], 90);
    expect(s.get('milk').bestStore).toBe('Lidl');
    expect(s.get('milk').savings).toBeCloseTo(0.35, 3);
  });

  it('cached 5 minutes per family, window and item set', async () => {
    await svc.getSmartSuggestions('fam', ['milk']);
    await svc.getSmartSuggestions('fam', [' MILK ']);
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledTimes(1);
    await svc.getSmartSuggestions('fam', ['milk', 'bread']);
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledTimes(3);
    svc.clearSuggestionsCache('fam');
    await svc.getSmartSuggestions('fam', ['milk']);
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledTimes(4);
    svc.clearSuggestionsCache();
    (Date.now as jest.Mock).mockReturnValue(NOW + 5 * 60 * 1000);
    await svc.getSmartSuggestions('fam', ['milk']);
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledTimes(5);
  });

  it('no item names: none', async () => {
    expect((await svc.getSmartSuggestions('fam', [])).size).toBe(0);
  });
});

describe('getAllTrackedItems and backfill', () => {
  it('tracked items pass through; an error gives none', async () => {
    mockLSM.getDistinctTrackedItems.mockResolvedValueOnce([{ itemName: 'Milk', itemNameNormalized: 'milk' }]);
    expect(await svc.getAllTrackedItems('fam')).toHaveLength(1);
    mockLSM.getDistinctTrackedItems.mockRejectedValueOnce(new Error('db'));
    expect(await svc.getAllTrackedItems('fam')).toEqual([]);
  });

  it('backfill writes one record per ticked priced item, locally and to Firebase, then never again', async () => {
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a', storeName: 'Aldi' }, { id: 'b', storeName: null }]);
    mockLSM.getItemsGroupedByList.mockResolvedValue(new Map([
      ['a', [{ id: 'i1', name: 'Milk ', price: 1, checked: true, updatedAt: 7 }, { id: 'i2', name: 'Tea', price: 2, checked: false, updatedAt: 7 }]],
      ['b', [{ id: 'i3', name: 'Eggs', price: null, checked: true, updatedAt: 7 }, { id: 'i4', name: 'Jam', price: 0, checked: true, updatedAt: 9 }]],
    ]));
    await svc.backfillPriceHistory('fam');
    const saved = mockLSM.savePriceHistoryBatch.mock.calls[0][0];
    expect(saved.map((r: any) => r.id)).toEqual(['item_a_i1', 'item_b_i4']);
    expect(saved[0]).toEqual(expect.objectContaining({ itemNameNormalized: 'milk', storeName: 'Aldi', recordedAt: 7, listId: 'a' }));
    expect(Object.keys(mockUpdate.mock.calls[0][1])).toEqual(['familyGroups/fam/priceHistory/item_a_i1', 'familyGroups/fam/priceHistory/item_b_i4']);
    expect(mockStore.get('priceHistoryBackfillDone_v1_fam')).toBe('true');
    await svc.backfillPriceHistory('fam');
    expect(mockLSM.savePriceHistoryBatch).toHaveBeenCalledTimes(1);
  });

  it('backfill sends Firebase writes in chunks of 500', async () => {
    const items = Array.from({ length: 1001 }, (_, i) => ({ id: `i${i}`, name: 'X', price: 1, checked: true, updatedAt: 1 }));
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a', storeName: null }]);
    mockLSM.getItemsGroupedByList.mockResolvedValue(new Map([['a', items]]));
    await svc.backfillPriceHistory('fam');
    expect(mockUpdate.mock.calls.map(c => Object.keys(c[1]).length)).toEqual([500, 500, 1]);
  });
});

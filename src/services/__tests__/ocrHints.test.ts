jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: jest.fn(), getItemsForList: jest.fn() },
}));
jest.mock('../PriceHistoryService', () => ({ __esModule: true, default: { getPriceHistory: jest.fn() } }));

import LocalStorageManager from '../LocalStorageManager';
import PriceHistoryService from '../PriceHistoryService';
import { buildOcrHints, MAX_HINT_ITEMS, MAX_HINT_NAME } from '../ocrHints';

const mockGetList = LocalStorageManager.getList as jest.Mock;
const mockGetItemsForList = LocalStorageManager.getItemsForList as jest.Mock;
const mockGetPriceHistory = PriceHistoryService.getPriceHistory as jest.Mock;

const item = (name: string) => ({ id: name, listId: 'l1', name });

describe('buildOcrHints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetList.mockResolvedValue({ id: 'l1', familyGroupId: 'fg', storeName: 'Tesco' });
  });

  it('sends each item with the last price paid, preferring this store', async () => {
    mockGetItemsForList.mockResolvedValue([item('Eggs'), item('Milk')]);
    mockGetPriceHistory.mockImplementation(async (_fg: string, name: string) => (name === 'Eggs'
      ? [
          { price: 3.1, date: 1, storeName: 'Tesco', listId: 'a' },
          { price: 2.9, date: 2, storeName: 'Lidl', listId: 'b' },
        ]
      : []));
    expect(await buildOcrHints('l1')).toEqual({
      store: 'Tesco',
      items: [{ name: 'Eggs', lastPrice: 3.1 }, { name: 'Milk', lastPrice: null }],
    });
  });

  it('falls back to the latest price at any store', async () => {
    mockGetItemsForList.mockResolvedValue([item('Eggs')]);
    mockGetPriceHistory.mockResolvedValue([
      { price: 3.1, date: 1, storeName: 'Lidl', listId: 'a' },
      { price: 3.3, date: 2, storeName: 'Aldi', listId: 'b' },
    ]);
    expect((await buildOcrHints('l1'))!.items[0].lastPrice).toBe(3.3);
  });

  it('is null for a missing or empty list', async () => {
    mockGetList.mockResolvedValueOnce(null);
    expect(await buildOcrHints('nope')).toBeNull();
    mockGetItemsForList.mockResolvedValue([]);
    expect(await buildOcrHints('l1')).toBeNull();
  });

  it('caps the list at the server limit', async () => {
    mockGetItemsForList.mockResolvedValue(Array.from({ length: 250 }, (_, i) => item(`i${i}`)));
    mockGetPriceHistory.mockResolvedValue([]);
    expect((await buildOcrHints('l1'))!.items).toHaveLength(MAX_HINT_ITEMS);
  });

  it('a failing price lookup only loses that price', async () => {
    mockGetItemsForList.mockResolvedValue([item('Eggs')]);
    mockGetPriceHistory.mockRejectedValue(new Error('db'));
    expect((await buildOcrHints('l1'))!.items).toEqual([{ name: 'Eggs', lastPrice: null }]);
  });

  it('a price from this same list is not "last time"', async () => {
    mockGetItemsForList.mockResolvedValue([item('Eggs'), item('Milk')]);
    mockGetPriceHistory.mockImplementation(async (_fg: string, name: string) => (name === 'Eggs'
      ? [
          { price: 3.1, date: 1, storeName: 'Tesco', listId: 'a' },
          { price: 8.3, date: 2, storeName: 'Tesco', listId: 'l1' },
        ]
      : [{ price: 1.2, date: 2, storeName: 'Tesco', listId: 'l1' }]));
    expect((await buildOcrHints('l1'))!.items).toEqual([
      { name: 'Eggs', lastPrice: 3.1 },
      { name: 'Milk', lastPrice: null },
    ]);
  });

  it('cuts long names to the server limit, so a long list is never dropped whole', async () => {
    mockGetItemsForList.mockResolvedValue(Array.from({ length: MAX_HINT_ITEMS }, (_, i) => item(`${i}`.padEnd(500, 'x'))));
    mockGetPriceHistory.mockResolvedValue([]);
    const hints = (await buildOcrHints('l1'))!;
    expect(hints.items.every(i => i.name.length === MAX_HINT_NAME)).toBe(true);
    expect(JSON.stringify(hints).length).toBeLessThan(64 * 1024);
  });
});

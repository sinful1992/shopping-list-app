/**
 * ItemManager: add, edit, tick, delete and batch changes of list items.
 * Was 28 % covered (Fable audit task 137). Storage and sync are mocked; the
 * sanitizers are real.
 */
jest.mock('react-native-get-random-values', () => ({}));
const mockLSM = {
  saveItem: jest.fn(async () => {}),
  getItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(async () => {}),
  getItemsForList: jest.fn(async () => []),
  saveItemsBatch: jest.fn(async () => {}),
  deleteItemsBatch: jest.fn(async () => {}),
  updateItemsBatch: jest.fn(),
  observeItemsForList: jest.fn(),
  getList: jest.fn(),
  getPriceHistoryForItem: jest.fn(async () => []),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
const mockPush = jest.fn<Promise<void>, unknown[]>(async () => {});
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { pushChange: (...a: unknown[]) => (mockPush as any)(...a) } }));
const mockCategoryUsage = jest.fn();
jest.mock('../CategoryHistoryService', () => ({ __esModule: true, default: { recordCategoryUsage: (...a: unknown[]) => mockCategoryUsage(...a) } }));
const mockRecordPrice = jest.fn();
jest.mock('../PriceHistoryService', () => ({
  __esModule: true,
  default: { recordPrice: (...a: unknown[]) => mockRecordPrice(...a) },
  pickPurchaseRecordId: (_e: unknown, listId: string, itemId: string) => `item_${listId}_${itemId}`,
}));
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a) } }));
const mockNotifyUrgent = jest.fn();
jest.mock('../UrgentNotifier', () => ({ notifyItemUrgent: (...a: unknown[]) => mockNotifyUrgent(...a) }));

import ItemManager from '../ItemManager';
import type { Item } from '../../models/types';

const settle = () => new Promise(r => setTimeout(r, 0));
const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1', listId: 'l1', name: 'Milk', quantity: null, price: null, checked: false, category: null,
  createdBy: 'u1', createdAt: 1, updatedAt: 1, syncStatus: 'synced', isUrgent: false, ...over,
}) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockLSM.updateItem.mockImplementation(async (id: string, u: object) => item({ id, ...u }));
  mockLSM.updateItemsBatch.mockImplementation(async (us: Array<{ id: string; updates: object }>) => us.map(u => item({ id: u.id, ...u.updates })));
  mockLSM.getList.mockResolvedValue({ id: 'l1', familyGroupId: 'fam', storeName: 'Tesco' });
  mockPush.mockResolvedValue(undefined);
});

describe('addItem', () => {
  it('saves a cleaned item locally, then queues it for sync without waiting', async () => {
    let releasePush!: () => void;
    mockPush.mockImplementationOnce(() => new Promise<void>(r => { releasePush = r; }));
    const it1 = await ItemManager.addItem('l1', '  Bread  ', 'u1', ' 2 ', 1.5, ' Bakery ');
    expect(it1).toEqual(expect.objectContaining({ listId: 'l1', name: 'Bread', quantity: '2', price: 1.5, category: 'Bakery', checked: false, syncStatus: 'pending', isUrgent: false }));
    expect(mockLSM.saveItem).toHaveBeenCalledWith(it1);
    expect(mockPush).toHaveBeenCalledWith('item', it1.id, 'create', it1);
    releasePush();
  });

  it('a blank name is refused before anything is saved', async () => {
    await expect(ItemManager.addItem('l1', '   ', 'u1')).rejects.toThrow('Item name is required');
    expect(mockLSM.saveItem).not.toHaveBeenCalled();
  });

  it('a bad price is dropped; no category stays null', async () => {
    const it1 = await ItemManager.addItem('l1', 'Eggs', 'u1', undefined, -3, undefined);
    expect(it1.price).toBeNull();
    expect(it1.category).toBeNull();
    expect(it1.quantity).toBeNull();
  });

  it('urgent items tell the family; normal ones do not', async () => {
    await ItemManager.addItem('l1', 'Nappies', 'u1', undefined, undefined, null, true);
    await ItemManager.addItem('l1', 'Tea', 'u1');
    expect(mockNotifyUrgent).toHaveBeenCalledTimes(1);
    expect(mockNotifyUrgent.mock.calls[0][0].name).toBe('Nappies');
  });

  it('a failing sync is reported, the add still succeeds', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await expect(ItemManager.addItem('l1', 'Tea', 'u1')).resolves.toBeTruthy();
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.addItem sync');
  });
});

describe('updateItem', () => {
  it('cleans the fields it is given, stamps updatedAt and pending, and syncs', async () => {
    const updated = await ItemManager.updateItem('i1', { name: ' Oat milk ', quantity: ' 1 ', price: 2, category: ' Dairy ' });
    expect(mockLSM.updateItem).toHaveBeenCalledWith('i1', expect.objectContaining({
      name: 'Oat milk', quantity: '1', price: 2, category: 'Dairy', syncStatus: 'pending', updatedAt: expect.any(Number),
    }));
    expect(mockPush).toHaveBeenCalledWith('item', 'i1', 'update', updated);
  });

  it('renaming to blank is refused', async () => {
    await expect(ItemManager.updateItem('i1', { name: '  ' })).rejects.toThrow('Item name is required');
    expect(mockLSM.updateItem).not.toHaveBeenCalled();
  });

  it('fields not given are left out of the update', async () => {
    await ItemManager.updateItem('i1', { checked: true });
    const sent = mockLSM.updateItem.mock.calls[0][1];
    expect(Object.keys(sent).sort()).toEqual(['checked', 'syncStatus', 'updatedAt']);
  });

  it('turning urgent tells the family once; already urgent does not', async () => {
    mockLSM.getItem.mockResolvedValueOnce(item({ isUrgent: false }));
    await ItemManager.updateItem('i1', { isUrgent: true });
    mockLSM.getItem.mockResolvedValueOnce(item({ isUrgent: true }));
    await ItemManager.updateItem('i1', { isUrgent: true });
    await ItemManager.updateItem('i1', { isUrgent: false });
    expect(mockNotifyUrgent).toHaveBeenCalledTimes(1);
  });

  it('a failing sync is reported', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await ItemManager.updateItem('i1', { checked: true });
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.updateItem sync');
  });
});

describe('toggleItemChecked and recordPurchase', () => {
  it('ticking records the purchase (category + price, keyed by list and item)', async () => {
    mockLSM.getItem.mockResolvedValue(item({ checked: false, category: 'Dairy', price: 1.2 }));
    const r = await ItemManager.toggleItemChecked('i1');
    expect(r.checked).toBe(true);
    await settle(); await settle();
    expect(mockCategoryUsage).toHaveBeenCalledWith('fam', 'Milk', 'Dairy');
    expect(mockLSM.getPriceHistoryForItem).toHaveBeenCalledWith('fam', 'milk');
    expect(mockRecordPrice).toHaveBeenCalledWith('fam', 'Milk', 1.2, 'Tesco', 'l1', 'item_l1_i1');
  });

  it('unticking records nothing', async () => {
    mockLSM.getItem.mockResolvedValue(item({ checked: true, category: 'Dairy', price: 1.2 }));
    const r = await ItemManager.toggleItemChecked('i1');
    expect(r.checked).toBe(false);
    await settle();
    expect(mockLSM.getList).not.toHaveBeenCalled();
  });

  it('a missing item is an error', async () => {
    mockLSM.getItem.mockResolvedValue(null);
    await expect(ItemManager.toggleItemChecked('gone')).rejects.toThrow('Item not found');
  });

  it('no category and no price: nothing to record, no list read', () => {
    ItemManager.recordPurchase(item());
    expect(mockLSM.getList).not.toHaveBeenCalled();
  });

  it('a price correction (countCategory false) records the price, not the category again', async () => {
    ItemManager.recordPurchase(item({ category: 'Dairy', price: 0.99 }), false);
    await settle(); await settle();
    expect(mockCategoryUsage).not.toHaveBeenCalled();
    expect(mockRecordPrice).toHaveBeenCalledWith('fam', 'Milk', 0.99, 'Tesco', 'l1', 'item_l1_i1');
  });

  it('a list with no store records the price with no store; no family records nothing', async () => {
    mockLSM.getList.mockResolvedValueOnce({ id: 'l1', familyGroupId: 'fam', storeName: null });
    ItemManager.recordPurchase(item({ price: 2 }));
    await settle(); await settle();
    expect(mockRecordPrice).toHaveBeenCalledWith('fam', 'Milk', 2, null, 'l1', 'item_l1_i1');
    mockRecordPrice.mockClear();
    mockLSM.getList.mockResolvedValueOnce(null);
    ItemManager.recordPurchase(item({ price: 2 }));
    await settle(); await settle();
    expect(mockRecordPrice).not.toHaveBeenCalled();
  });

  it('a failure while recording is reported, never thrown', async () => {
    mockLSM.getList.mockRejectedValueOnce(new Error('db'));
    expect(() => ItemManager.recordPurchase(item({ price: 2 }))).not.toThrow();
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.recordPurchase');
  });
});

describe('delete and read', () => {
  it('deleteItem removes locally then syncs the delete', async () => {
    await ItemManager.deleteItem('i1');
    expect(mockLSM.deleteItem).toHaveBeenCalledWith('i1');
    expect(mockPush).toHaveBeenCalledWith('item', 'i1', 'delete');
  });

  it('getItemsForList and subscribeToItemChanges go to storage', async () => {
    mockLSM.getItemsForList.mockResolvedValueOnce([item()] as any);
    expect(await ItemManager.getItemsForList('l1')).toHaveLength(1);
    const unsub = jest.fn();
    mockLSM.observeItemsForList.mockReturnValueOnce(unsub);
    const cb = jest.fn();
    expect(ItemManager.subscribeToItemChanges('l1', cb)).toBe(unsub);
    expect(mockLSM.observeItemsForList).toHaveBeenCalledWith('l1', cb);
  });
});

describe('batches', () => {
  it('addItemsBatch skips blank names, cleans the rest, saves once, syncs each', async () => {
    const items = await ItemManager.addItemsBatch('l1', [
      { name: ' Bread ', quantity: '1', price: 1, category: 'Bakery', checked: true, unitQty: 2 },
      { name: '   ' },
      { name: 'Eggs', price: 'x' as any, category: null },
    ], 'u1');
    expect(items.map(i => i.name)).toEqual(['Bread', 'Eggs']);
    expect(items[0]).toEqual(expect.objectContaining({ checked: true, unitQty: 2, category: 'Bakery', price: 1 }));
    expect(items[1]).toEqual(expect.objectContaining({ checked: false, unitQty: null, category: null, price: null }));
    expect(mockLSM.saveItemsBatch).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(new Set(items.map(i => i.id)).size).toBe(2);
  });

  it('addItemsBatch keeps urgent (Partial Shop carry-over) without a new urgent push; absent means not urgent', async () => {
    const items = await ItemManager.addItemsBatch('l2', [
      { name: 'Calpol', isUrgent: true },
      { name: 'Milk' },
      { name: 'Eggs', isUrgent: false },
    ], 'u1');
    expect(items.map(i => [i.name, i.isUrgent])).toEqual([['Calpol', true], ['Milk', false], ['Eggs', false]]);
    const saved = (mockLSM.saveItemsBatch.mock.calls as unknown as Item[][][])[0][0];
    expect(saved.map(i => i.isUrgent)).toEqual([true, false, false]);
    await settle();
    expect(mockNotifyUrgent).not.toHaveBeenCalled();
  });

  it('addItemsBatch: a failing sync of one item is reported', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await ItemManager.addItemsBatch('l1', [{ name: 'A' }], 'u1');
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.addItemsBatch sync');
  });

  it('deleteItemsBatch deletes once and syncs each; one failing sync does not stop the rest', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await ItemManager.deleteItemsBatch(['a', 'b', 'c']);
    expect(mockLSM.deleteItemsBatch).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(mockPush.mock.calls.map(c => c[1])).toEqual(['a', 'b', 'c']);
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.deleteItemsBatch sync');
  });

  it('updateItemsBatch stamps each update and syncs each result', async () => {
    const out = await ItemManager.updateItemsBatch([{ id: 'a', updates: { checked: true } }, { id: 'b', updates: { price: 3 } }]);
    const sent = mockLSM.updateItemsBatch.mock.calls[0][0];
    expect(sent.every((u: any) => u.updates.syncStatus === 'pending' && typeof u.updates.updatedAt === 'number')).toBe(true);
    expect(out.map(i => i.id)).toEqual(['a', 'b']);
    expect(mockPush.mock.calls.map(c => [c[1], c[2]])).toEqual([['a', 'update'], ['b', 'update']]);
  });

  it('updateItemsBatch: a failing sync is reported', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await ItemManager.updateItemsBatch([{ id: 'a', updates: { checked: true } }]);
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ItemManager.updateItemsBatch sync');
  });

  it('reorderItems gives each item its position as sortOrder', async () => {
    await ItemManager.reorderItems([item({ id: 'c' }), item({ id: 'a' }), item({ id: 'b' })]);
    expect(mockLSM.updateItemsBatch.mock.calls[0][0].map((u: any) => [u.id, u.updates.sortOrder])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });
});

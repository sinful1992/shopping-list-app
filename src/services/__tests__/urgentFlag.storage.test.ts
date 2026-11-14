/**
 * Urgent on a list item (task 49), against real WatermelonDB on the in-memory
 * LokiJS adapter: the flag is stored and read back, the card count only counts
 * unchecked urgent items of each list and follows changes live, and adding or
 * marking an item tells the family only when it turns urgent.
 */
const mockNotify = jest.fn();
jest.mock('../UrgentNotifier', () => ({ notifyItemUrgent: (...a: unknown[]) => mockNotify(...a) }));
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { pushChange: jest.fn(() => Promise.resolve()) } }));
jest.mock('../CategoryHistoryService', () => ({ __esModule: true, default: { recordCategoryUsage: jest.fn(() => Promise.resolve()) } }));
jest.mock('../PriceHistoryService', () => ({
  __esModule: true,
  default: { recordPrice: jest.fn(() => Promise.resolve()) },
  pickPurchaseRecordId: jest.fn(),
}));

import LocalStorageManager from '../LocalStorageManager';
import ItemManager from '../ItemManager';
import SyncEngine from '../SyncEngine';
import { Item } from '../../models/types';

let n = 0;
const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: `urg-item-${++n}`, listId: 'urg-list-a', name: 'Milk', quantity: null, price: null, checked: false,
  createdBy: 'user-1', createdAt: 1000, updatedAt: 1000, syncStatus: 'synced', ...overrides,
});

/** Latest counts the observer reported, after Watermelon settles. */
async function observeCounts(): Promise<{ latest: () => Map<string, number>; stop: () => void }> {
  let latest = new Map<string, number>();
  const stop = LocalStorageManager.observeUrgentCounts(c => { latest = c; });
  await settle();
  return { latest: () => latest, stop };
}
const settle = () => new Promise(r => setTimeout(r, 30));

beforeEach(() => {
  mockNotify.mockClear();
  (SyncEngine.pushChange as jest.Mock).mockClear();
});

describe('stored flag', () => {
  it.each([[true, true], [false, false], [undefined, false]])('saved %s reads back %s', async (value, expected) => {
    const item = makeItem(value === undefined ? {} : { isUrgent: value });
    await LocalStorageManager.saveItem(item);
    expect((await LocalStorageManager.getItem(item.id))?.isUrgent).toBe(expected);
  });

  it('a remote batch can set and clear it', async () => {
    const item = makeItem({ listId: 'urg-batch' });
    await LocalStorageManager.saveItem(item);
    await LocalStorageManager.saveItemsBatchUpsert([{ ...item, isUrgent: true, updatedAt: 2000 }]);
    expect((await LocalStorageManager.getItem(item.id))?.isUrgent).toBe(true);
    await LocalStorageManager.saveItemsBatchUpsert([{ ...item, isUrgent: false, updatedAt: 3000 }]);
    expect((await LocalStorageManager.getItem(item.id))?.isUrgent).toBe(false);
  });
});

describe('observeUrgentCounts (the card tag)', () => {
  it('counts unchecked urgent items per list, live', async () => {
    const a1 = makeItem({ listId: 'cnt-a', isUrgent: true });
    const a2 = makeItem({ listId: 'cnt-a', isUrgent: true });
    const a3 = makeItem({ listId: 'cnt-a', isUrgent: false });
    const b1 = makeItem({ listId: 'cnt-b', isUrgent: true, checked: true });
    for (const i of [a1, a2, a3, b1]) await LocalStorageManager.saveItem(i);

    const counts = await observeCounts();
    expect(counts.latest().get('cnt-a')).toBe(2);
    // A list whose only urgent item is checked shows no tag.
    expect(counts.latest().has('cnt-b')).toBe(false);

    // Checking an urgent item takes it off the count.
    await LocalStorageManager.updateItem(a1.id, { checked: true });
    await settle();
    expect(counts.latest().get('cnt-a')).toBe(1);

    // Clearing the flag on the last one removes the tag.
    await LocalStorageManager.updateItem(a2.id, { isUrgent: false });
    await settle();
    expect(counts.latest().has('cnt-a')).toBe(false);

    // Marking one urgent brings it back.
    await LocalStorageManager.updateItem(a3.id, { isUrgent: true });
    await settle();
    expect(counts.latest().get('cnt-a')).toBe(1);
    counts.stop();
  });

  it('an item deleted from the list leaves the count', async () => {
    const d = makeItem({ listId: 'cnt-del', isUrgent: true });
    await LocalStorageManager.saveItem(d);
    const counts = await observeCounts();
    expect(counts.latest().get('cnt-del')).toBe(1);
    await LocalStorageManager.deleteItem(d.id);
    await settle();
    expect(counts.latest().has('cnt-del')).toBe(false);
    counts.stop();
  });
});

describe('ItemManager tells the family once, when an item turns urgent', () => {
  it('adding an urgent item notifies once and syncs the flag', async () => {
    const item = await ItemManager.addItem('urg-list-m', 'Nappies', 'user-1', undefined, undefined, null, true);
    expect(item.isUrgent).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ id: item.id, name: 'Nappies', isUrgent: true });
    expect(SyncEngine.pushChange).toHaveBeenCalledWith('item', item.id, 'create', expect.objectContaining({ isUrgent: true }));
  });

  it('adding a normal item never notifies', async () => {
    const item = await ItemManager.addItem('urg-list-m', 'Bread', 'user-1');
    expect(item.isUrgent).toBe(false);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('false → true notifies; true → true, true → false and other edits do not', async () => {
    const item = await ItemManager.addItem('urg-list-m', 'Calpol', 'user-1');
    await ItemManager.updateItem(item.id, { isUrgent: true });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    await ItemManager.updateItem(item.id, { isUrgent: true });
    await ItemManager.updateItem(item.id, { name: 'Calpol 6+' });
    await ItemManager.updateItem(item.id, { isUrgent: false });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect((await LocalStorageManager.getItem(item.id))?.isUrgent).toBe(false);
    // Marked again later: the family hears about it again.
    await ItemManager.updateItem(item.id, { isUrgent: true });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });
});

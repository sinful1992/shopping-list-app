// Task 159: sign-out / sign-in and leave / rejoin family must bring the rows
// back. clearAllData / clearFamilyData used to soft-delete (tombstone) rows;
// a later create with the same id then failed with "Duplicate key".
// Contract ea62926 §3 a–g. Each case is labelled with its contract letter.
const recorded: string[] = [];
jest.mock('../../src/services/CrashReporting', () => ({
  __esModule: true,
  default: { recordError: (e: Error, ctx?: string) => { recorded.push(`${ctx}: ${e.message}`); }, log: () => {} },
}));

import localStorageManager from '../../src/services/LocalStorageManager';
import { Item, ShoppingList, PriceHistoryRecord, StoreLayout } from '../../src/models/types';
import { v4 as uuidv4 } from 'uuid';

// failsOnDev cases were it.failing on branch t159-tests 7c52023 (proof they fail on dev 23fcb3e);
// they are plain it() here, on top of the fix.
const failsOnDev = it;

const db: any = (localStorageManager as any).database;
const FAM = 'fam-159';
const OTHER = 'fam-159-other';

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: uuidv4(), name: 'Weekly Shop', familyGroupId: FAM, createdBy: 'user-1',
    createdAt: 1000, status: 'active', completedAt: null, completedBy: null,
    receiptUrl: null, receiptData: null, syncStatus: 'synced', isLocked: false,
    lockedBy: null, lockedByName: null, lockedByRole: null, lockedAt: null,
    budget: null, totalAmount: null, merchantName: null, purchaseDate: null, currency: null,
    ...overrides,
  } as ShoppingList;
}

function makeItem(listId: string, overrides: Partial<Item> = {}): Item {
  return {
    id: uuidv4(), listId, name: 'Apples', quantity: '2', price: 1.5, checked: false,
    createdBy: 'user-1', createdAt: 1000, updatedAt: 1000, syncStatus: 'synced',
    category: 'produce', sortOrder: 100, unitQty: 1, measurementUnit: null, measurementValue: null,
    ...overrides,
  };
}

function makePrice(overrides: Partial<PriceHistoryRecord> = {}): PriceHistoryRecord {
  return {
    id: uuidv4(), itemName: 'Milk', itemNameNormalized: 'milk', price: 1.2, storeName: 'Tesco',
    listId: null, recordedAt: 5000, familyGroupId: FAM, ...overrides,
  };
}

const layoutData = (familyGroupId = FAM) => ({
  familyGroupId, storeName: 'Tesco', categoryOrder: ['produce', 'dairy'], createdBy: 'user-1', updatedAt: 2000,
});

async function deletedIds(table: string): Promise<string[]> {
  return db.adapter.getDeletedRecords(table);
}

/** Tombstone rows the way the OLD clearAllData did (prepareMarkAsDeleted), for the upgrade path. */
async function oldStyleTombstone(table: string, ids: string[]) {
  await db.write(async () => {
    const rows = await db.collections.get(table).query().fetch();
    const ops = rows.filter((r: any) => ids.includes(r.id)).map((r: any) => r.prepareMarkAsDeleted());
    await db.batch(ops);
  });
}

async function queueDelete(entityType: 'list' | 'item', entityId: string) {
  await localStorageManager.addToSyncQueue({
    id: uuidv4(), entityType, entityId, operation: 'delete', data: null, timestamp: 1, retryCount: 0,
  } as any);
}

const listIds = async (fam = FAM) => (await localStorageManager.getAllLists(fam)).map(l => l.id).sort();

beforeEach(async () => {
  await localStorageManager.clearAllData();
  // The old clear left tombstones; wipe them so each case starts empty either way.
  for (const t of ['shopping_lists', 'items', 'store_layouts', 'price_history', 'sync_queue']) {
    const ids = await deletedIds(t);
    if (ids.length) await db.adapter.destroyDeletedRecords(t, ids);
  }
  recorded.length = 0;
});

describe('a/e: sign-out (clearAllData) then sign-in brings everything back', () => {
  failsOnDev('a: lists and their items come back, no recordError', async () => {
    const l1 = makeList(); const l2 = makeList({ name: 'Party' });
    const items = [makeItem(l1.id), makeItem(l1.id, { name: 'Bread' }), makeItem(l2.id)];
    await localStorageManager.saveListsBatch([l1, l2]);
    await localStorageManager.saveItemsBatchUpsert(items);

    await localStorageManager.clearAllData();
    expect(await listIds()).toEqual([]);

    await localStorageManager.saveListsBatch([l1, l2]);
    await localStorageManager.saveItemsBatchUpsert(items);
    expect(await listIds()).toEqual([l1.id, l2.id].sort());
    expect((await localStorageManager.getItemsForList(l1.id)).map(i => i.name).sort()).toEqual(['Apples', 'Bread']);
    expect(recorded).toEqual([]);
  });

  failsOnDev('a: single saveList after clearAllData brings the list back', async () => {
    const l = makeList();
    await localStorageManager.saveList(l);
    await localStorageManager.clearAllData();
    await localStorageManager.saveList(l);
    expect(await listIds()).toEqual([l.id]);
  });

  failsOnDev('interface 1: clearAllData leaves no tombstones in any table it clears', async () => {
    const l = makeList();
    await localStorageManager.saveListsBatch([l]);
    await localStorageManager.saveItemsBatchUpsert([makeItem(l.id)]);
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-1', data: layoutData() }]);
    await localStorageManager.savePriceHistoryBatch([makePrice()]);
    await queueDelete('list', l.id);

    await localStorageManager.clearAllData();
    for (const t of ['shopping_lists', 'items', 'store_layouts', 'price_history', 'sync_queue']) {
      expect({ t, ids: await deletedIds(t) }).toEqual({ t, ids: [] });
    }
  });

  failsOnDev('e: double sign-out then sign-in still brings lists back', async () => {
    const l = makeList();
    await localStorageManager.saveListsBatch([l]);
    await localStorageManager.clearAllData();
    await localStorageManager.clearAllData();
    await localStorageManager.saveListsBatch([l]);
    expect(await listIds()).toEqual([l.id]);
    expect(recorded).toEqual([]);
  });

  it('e: clearAllData on an empty database does not throw, and a save after it works', async () => {
    await expect(localStorageManager.clearAllData()).resolves.toBeUndefined();
    const l = makeList();
    await localStorageManager.saveListsBatch([l]);
    expect(await listIds()).toEqual([l.id]);
  });

  failsOnDev('e: a sign-in that brings back only some lists, then the rest, gets all of them', async () => {
    const l1 = makeList(); const l2 = makeList();
    await localStorageManager.saveListsBatch([l1, l2]);
    await localStorageManager.clearAllData();
    await localStorageManager.saveListsBatch([l1]);
    await localStorageManager.saveListsBatch([l1, l2]);
    expect(await listIds()).toEqual([l1.id, l2.id].sort());
    expect(recorded).toEqual([]);
  });
});

describe('b: leave family (clearFamilyData) then rejoin', () => {
  failsOnDev('lists, items and layouts of the family come back; the other family is untouched', async () => {
    const mine = makeList(); const other = makeList({ familyGroupId: OTHER });
    const item = makeItem(mine.id);
    await localStorageManager.saveListsBatch([mine, other]);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-fam', data: layoutData() }]);

    await localStorageManager.clearFamilyData(FAM);
    expect(await listIds()).toEqual([]);
    expect(await listIds(OTHER)).toEqual([other.id]);
    expect(await deletedIds('shopping_lists')).toEqual([]);

    await localStorageManager.saveListsBatch([mine]);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-fam', data: layoutData() }]);
    expect(await listIds()).toEqual([mine.id]);
    expect((await localStorageManager.getItemsForList(mine.id)).map(i => i.id)).toEqual([item.id]);
    expect((await localStorageManager.getStoreLayoutById('lay-fam'))?.storeName).toBe('Tesco');
    expect(recorded).toEqual([]);
  });

  failsOnDev('leave, rejoin, leave again, rejoin again', async () => {
    const l = makeList();
    await localStorageManager.saveListsBatch([l]);
    for (let i = 0; i < 2; i++) {
      await localStorageManager.clearFamilyData(FAM);
      await localStorageManager.saveListsBatch([l]);
    }
    expect(await listIds()).toEqual([l.id]);
    expect(recorded).toEqual([]);
  });
});

describe('c: layouts and history rows with incoming ids after relogin', () => {
  failsOnDev('saveStoreLayoutsBatch brings a fixed layoutId back', async () => {
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-fixed', data: layoutData() }]);
    await localStorageManager.clearAllData();
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-fixed', data: layoutData() }]);
    expect((await localStorageManager.getStoreLayoutById('lay-fixed'))?.categoryOrder).toEqual(['produce', 'dairy']);
    expect(recorded).toEqual([]);
  });

  failsOnDev('saveStoreLayout (single) brings a fixed id back', async () => {
    const layout: StoreLayout = {
      id: 'lay-single', familyGroupId: FAM, storeName: 'Aldi', categoryOrder: ['dairy'] as any,
      createdBy: 'user-1', createdAt: 1, updatedAt: 2, syncStatus: 'synced',
    };
    await localStorageManager.saveStoreLayout(layout);
    await localStorageManager.clearAllData();
    await expect(localStorageManager.saveStoreLayout(layout)).resolves.toBeTruthy();
    expect((await localStorageManager.getStoreLayoutById('lay-single'))?.storeName).toBe('Aldi');
  });

  failsOnDev('savePriceHistoryBatch brings price rows back', async () => {
    const p = makePrice();
    await localStorageManager.savePriceHistoryBatch([p]);
    await localStorageManager.clearAllData();
    await localStorageManager.savePriceHistoryBatch([p]);
    expect((await localStorageManager.getPriceHistoryForItem(FAM, 'milk')).map(r => r.id)).toEqual([p.id]);
    expect(recorded).toEqual([]);
  });

  failsOnDev('savePriceHistoryRecord (single) brings a price row back', async () => {
    const p = makePrice();
    await localStorageManager.savePriceHistoryRecord(p);
    await localStorageManager.clearAllData();
    await localStorageManager.savePriceHistoryRecord(p);
    expect((await localStorageManager.getPriceHistoryForItem(FAM, 'milk')).map(r => r.id)).toEqual([p.id]);
  });

  failsOnDev('saveCategoryHistory (fixed id) works again after clearAllData', async () => {
    const h = { id: 'cat-1', familyGroupId: FAM, itemNameNormalized: 'milk', category: 'dairy', usageCount: 3, lastUsedAt: 10, createdAt: 1 };
    await localStorageManager.saveCategoryHistory(h);
    await localStorageManager.clearAllData();
    await localStorageManager.saveCategoryHistory(h);
    expect((await localStorageManager.getCategoryHistoryForItem(FAM, 'milk')).map(r => r.category)).toEqual(['dairy']);
  });
});

describe('d: upgrade path, a phone with tombstones left by the OLD clear', () => {
  failsOnDev('saveListsBatch purges old list tombstones and brings the lists back', async () => {
    const l1 = makeList(); const l2 = makeList();
    await localStorageManager.saveListsBatch([l1, l2]);
    await oldStyleTombstone('shopping_lists', [l1.id, l2.id]);
    expect((await deletedIds('shopping_lists')).sort()).toEqual([l1.id, l2.id].sort());

    await localStorageManager.saveListsBatch([l1, l2]);
    expect(await listIds()).toEqual([l1.id, l2.id].sort());
    expect(await deletedIds('shopping_lists')).toEqual([]);
    expect(recorded).toEqual([]);
  });

  failsOnDev('saveList (single) purges an old tombstone', async () => {
    const l = makeList();
    await localStorageManager.saveList(l);
    await oldStyleTombstone('shopping_lists', [l.id]);
    await localStorageManager.saveList(l);
    expect(await listIds()).toEqual([l.id]);
  });

  failsOnDev('a purge touches only the incoming ids; other tombstones stay', async () => {
    const back = makeList(); const gone = makeList();
    await localStorageManager.saveListsBatch([back, gone]);
    await oldStyleTombstone('shopping_lists', [back.id, gone.id]);
    await localStorageManager.saveListsBatch([back]);
    expect(await listIds()).toEqual([back.id]);
    expect(await deletedIds('shopping_lists')).toEqual([gone.id]);
  });

  failsOnDev('saveStoreLayoutsBatch purges an old layout tombstone', async () => {
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-old', data: layoutData() }]);
    await oldStyleTombstone('store_layouts', ['lay-old']);
    await localStorageManager.saveStoreLayoutsBatch(FAM, [{ layoutId: 'lay-old', data: layoutData() }]);
    expect((await localStorageManager.getStoreLayoutById('lay-old'))?.storeName).toBe('Tesco');
    expect(recorded).toEqual([]);
  });

  failsOnDev('savePriceHistoryBatch purges an old price tombstone', async () => {
    const p = makePrice();
    await localStorageManager.savePriceHistoryBatch([p]);
    await oldStyleTombstone('price_history', [p.id]);
    await localStorageManager.savePriceHistoryBatch([p]);
    expect((await localStorageManager.getPriceHistoryForItem(FAM, 'milk')).map(r => r.id)).toEqual([p.id]);
    expect(recorded).toEqual([]);
  });
});

describe('f: no resurrection of a row deleted on this phone whose delete is still queued', () => {
  failsOnDev('items (fail-first): deleteItem + pending delete, then the server sends it back → stays gone', async () => {
    const l = makeList();
    const item = makeItem(l.id);
    await localStorageManager.saveListsBatch([l]);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.deleteItem(item.id);
    await queueDelete('item', item.id);

    await localStorageManager.saveItemsBatchUpsert([item]);
    // getItem (collection.find) serves the cached tombstone (pinned in
    // src/services/__tests__/LocalStorageManager.characterization.test.ts), so read by query.
    expect(await localStorageManager.getItemsForList(l.id)).toEqual([]);
    expect(await deletedIds('items')).toEqual([item.id]);
  });

  it('items (guard): once the delete has synced (no queue row), the server copy may come back', async () => {
    const l = makeList();
    const item = makeItem(l.id);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.deleteItem(item.id);
    await localStorageManager.saveItemsBatchUpsert([item]);
    expect((await localStorageManager.getItem(item.id))?.id).toBe(item.id);
  });

  failsOnDev('items: a pending delete of ANOTHER id does not block this one', async () => {
    const l = makeList();
    const a = makeItem(l.id); const b = makeItem(l.id);
    await localStorageManager.saveItemsBatchUpsert([a, b]);
    await localStorageManager.deleteItem(a.id);
    await localStorageManager.deleteItem(b.id);
    await queueDelete('item', a.id);
    await localStorageManager.saveItemsBatchUpsert([a, b]);
    expect((await localStorageManager.getItemsForList(l.id)).map(i => i.id)).toEqual([b.id]);
    expect(await deletedIds('items')).toEqual([a.id]);
  });

  it('items: a pending UPDATE (not delete) row does not block the purge', async () => {
    const l = makeList();
    const item = makeItem(l.id);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.deleteItem(item.id);
    await localStorageManager.addToSyncQueue({
      id: uuidv4(), entityType: 'item', entityId: item.id, operation: 'update', data: item, timestamp: 1, retryCount: 0,
    } as any);
    await localStorageManager.saveItemsBatchUpsert([item]);
    expect((await localStorageManager.getItem(item.id))?.id).toBe(item.id);
  });

  failsOnDev('lists (guard): LocalStorageManager.deleteList + pending delete, then saveListsBatch → stays gone, no error', async () => {
    const l = makeList();
    await localStorageManager.saveListsBatch([l]);
    await localStorageManager.deleteList(l.id);
    await queueDelete('list', l.id);
    await localStorageManager.saveListsBatch([l]);
    expect(await listIds()).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it('sign-out clears the pending deletes too, so after sign-in nothing is blocked', async () => {
    const l = makeList();
    const item = makeItem(l.id);
    await localStorageManager.saveListsBatch([l]);
    await localStorageManager.saveItemsBatchUpsert([item]);
    await localStorageManager.deleteItem(item.id);
    await queueDelete('item', item.id);
    await localStorageManager.clearAllData();
    expect(await localStorageManager.getSyncQueue()).toEqual([]);
    await localStorageManager.saveItemsBatchUpsert([item]);
    expect((await localStorageManager.getItem(item.id))?.id).toBe(item.id);
  });
});

describe('g: receipt aliases after relogin (guard, fresh ids)', () => {
  it('aliases saved again after clearAllData are readable', async () => {
    await localStorageManager.saveReceiptAliases(FAM, [{ receiptKey: 'tsco milk', itemName: 'Milk' }]);
    await localStorageManager.clearAllData();
    expect((await localStorageManager.getReceiptAliases(FAM)).size).toBe(0);
    await localStorageManager.saveReceiptAliases(FAM, [{ receiptKey: 'tsco milk', itemName: 'Milk' }]);
    expect((await localStorageManager.getReceiptAliases(FAM)).get('tsco milk')).toBe('Milk');
  });
});

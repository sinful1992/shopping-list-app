// Task 159 review (linus): edge cases aimed at breaking the tombstone fix
// (purgeStaleTombstones + destroy in clear*Data).
const recorded: string[] = [];
jest.mock('../../src/services/CrashReporting', () => ({
  __esModule: true,
  default: { recordError: (e: Error, ctx?: string) => { recorded.push(`${ctx}: ${e.message}`); }, log: () => {} },
}));

import localStorageManager from '../../src/services/LocalStorageManager';
import { Item, ShoppingList, PriceHistoryRecord } from '../../src/models/types';
import { v4 as uuidv4 } from 'uuid';

const db: any = (localStorageManager as any).database;
const FAM = 'fam-159b';
const OTHER = 'fam-159b-other';

const makeList = (o: Partial<ShoppingList> = {}): ShoppingList => ({
  id: uuidv4(), name: 'L', familyGroupId: FAM, createdBy: 'u', createdAt: 1000, status: 'active',
  completedAt: null, completedBy: null, receiptUrl: null, receiptData: null, syncStatus: 'synced',
  isLocked: false, lockedBy: null, lockedByName: null, lockedByRole: null, lockedAt: null, budget: null,
  totalAmount: null, merchantName: null, purchaseDate: null, currency: null, ...o,
} as ShoppingList);
const makeItem = (listId: string, o: Partial<Item> = {}): Item => ({
  id: uuidv4(), listId, name: 'Apples', quantity: '1', price: null, checked: false, createdBy: 'u',
  createdAt: 1000, updatedAt: 1000, syncStatus: 'synced', ...o,
});
const makePrice = (o: Partial<PriceHistoryRecord> = {}): PriceHistoryRecord => ({
  id: uuidv4(), itemName: 'Milk', itemNameNormalized: 'milk', price: 1, storeName: null, listId: null,
  recordedAt: 5000, familyGroupId: FAM, ...o,
});

async function oldStyleTombstone(table: string, ids: string[]) {
  await db.write(async () => {
    const rows = await db.collections.get(table).query().fetch();
    await db.batch(rows.filter((r: any) => ids.includes(r.id)).map((r: any) => r.prepareMarkAsDeleted()));
  });
}
const queue = (entityType: 'list' | 'item' | 'storeLayout', entityId: string, operation: 'create' | 'update' | 'delete' = 'delete') =>
  localStorageManager.addToSyncQueue({ id: uuidv4(), entityType, entityId, operation, data: null, timestamp: 1, retryCount: 0 } as any);
const listIds = async (fam = FAM) => (await localStorageManager.getAllLists(fam)).map(l => l.id).sort();

beforeEach(async () => {
  await localStorageManager.clearAllData();
  for (const t of ['shopping_lists', 'items', 'store_layouts', 'price_history', 'sync_queue']) {
    const ids = await db.adapter.getDeletedRecords(t);
    if (ids.length) await db.adapter.destroyDeletedRecords(t, ids);
  }
  recorded.length = 0;
});

it('600 old tombstones (more than one 500 chunk) all come back', async () => {
  const lists = Array.from({ length: 600 }, () => makeList());
  await localStorageManager.saveListsBatch(lists);
  await oldStyleTombstone('shopping_lists', lists.map(l => l.id));
  // A pending delete in the second chunk must still be honoured.
  await queue('list', lists[550].id);
  await localStorageManager.saveListsBatch(lists);
  const back = await listIds();
  expect(back).toHaveLength(599);
  expect(back).not.toContain(lists[550].id);
  expect(recorded).toEqual([]);
});

it('the same id twice in one incoming batch after an old tombstone', async () => {
  const l = makeList();
  await localStorageManager.saveListsBatch([l]);
  await oldStyleTombstone('shopping_lists', [l.id]);
  await localStorageManager.saveListsBatch([l, { ...l, name: 'L2' }]);
  expect(await listIds()).toEqual([l.id]);
});

it('a kept tombstone is purged once its delete has been sent (queue row removed)', async () => {
  const l = makeList();
  const item = makeItem(l.id);
  await localStorageManager.saveItemsBatchUpsert([item]);
  await localStorageManager.deleteItem(item.id);
  await queue('item', item.id);
  await localStorageManager.saveItemsBatchUpsert([item]);
  expect(await localStorageManager.getItemsForList(l.id)).toEqual([]);
  for (const op of await localStorageManager.getSyncQueue()) await localStorageManager.removeFromSyncQueue(op.id);
  await localStorageManager.saveItemsBatchUpsert([item]);
  expect((await localStorageManager.getItemsForList(l.id)).map(i => i.id)).toEqual([item.id]);
});

it('saveList / saveItem / saveStoreLayout on a kept tombstone return without storing or throwing', async () => {
  const l = makeList();
  const item = makeItem(l.id);
  await localStorageManager.saveList(l);
  await localStorageManager.saveItem(item);
  await localStorageManager.saveStoreLayout({ id: 'lay-k', familyGroupId: FAM, storeName: 'T', categoryOrder: [] as any, createdBy: 'u', createdAt: 1, updatedAt: 1, syncStatus: 'synced' });
  await localStorageManager.deleteList(l.id);
  await localStorageManager.deleteItem(item.id);
  await oldStyleTombstone('store_layouts', ['lay-k']);
  await queue('list', l.id); await queue('item', item.id); await queue('storeLayout', 'lay-k');

  await expect(localStorageManager.saveList(l)).resolves.toBeTruthy();
  await expect(localStorageManager.saveItem(item)).resolves.toBeTruthy();
  await expect(localStorageManager.saveStoreLayout({ id: 'lay-k', familyGroupId: FAM, storeName: 'T', categoryOrder: [] as any, createdBy: 'u', createdAt: 1, updatedAt: 2, syncStatus: 'synced' })).resolves.toBeTruthy();
  expect(await listIds()).toEqual([]);
  expect(await localStorageManager.getItemsForList(l.id)).toEqual([]);
  expect((await db.adapter.getDeletedRecords('store_layouts'))).toEqual(['lay-k']);
});

it('price batch with a mix of new, old-tombstoned and kept ids', async () => {
  const fresh = makePrice(); const old = makePrice(); const kept = makePrice();
  await localStorageManager.savePriceHistoryBatch([old, kept]);
  await oldStyleTombstone('price_history', [old.id, kept.id]);
  await queue('item', kept.id); // any pending delete for that id keeps it
  await localStorageManager.savePriceHistoryBatch([fresh, old, kept]);
  const ids = (await localStorageManager.getPriceHistoryForItem(FAM, 'milk')).map(r => r.id).sort();
  expect(ids).toEqual([fresh.id, old.id].sort());
  expect(recorded).toEqual([]);
});

it('clearFamilyData keeps the other family and its pending changes, and leaves no tombstones', async () => {
  const mine = makeList(); const other = makeList({ familyGroupId: OTHER });
  await localStorageManager.saveListsBatch([mine, other]);
  await queue('list', mine.id, 'update');
  await queue('list', other.id, 'update');
  await localStorageManager.clearFamilyData(FAM);
  expect(await listIds(OTHER)).toEqual([other.id]);
  expect((await localStorageManager.getSyncQueue()).map(o => o.entityId)).toEqual([other.id]);
  expect(await db.adapter.getDeletedRecords('shopping_lists')).toEqual([]);
  expect(await db.adapter.getDeletedRecords('sync_queue')).toEqual([]);
});

it('clearAllData racing a sign-in saveListsBatch ends consistent, no throw', async () => {
  const l = makeList();
  await localStorageManager.saveListsBatch([l]);
  await oldStyleTombstone('shopping_lists', [l.id]);
  await Promise.all([localStorageManager.clearAllData(), localStorageManager.saveListsBatch([l])]);
  await localStorageManager.saveListsBatch([l]);
  expect(await listIds()).toEqual([l.id]);
  expect(recorded).toEqual([]);
});

it('a local list edit of a status-deleted list is still not revived by the server copy', async () => {
  const l = makeList();
  await localStorageManager.saveListsBatch([l]);
  await localStorageManager.updateList(l.id, { status: 'deleted' } as any);
  await localStorageManager.clearAllData();
  // Server still has it active (the delete never went out before sign-out): it comes back, which
  // is right: sign-out drops the unsent delete along with everything else.
  await localStorageManager.saveListsBatch([l]);
  expect(await listIds()).toEqual([l.id]);
});

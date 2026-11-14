/**
 * OPTIMISE P3 (Fable audit task 137): Home's list observer queried every
 * non-deleted list (all history), mapped each one (receipt JSON parsed) on
 * every emission, then kept only the active ones. Now the query asks for
 * active lists only. And marking an already-synced row synced again no longer
 * writes (each write re-ran every list observer).
 * Real WatermelonDB on the in-memory LokiJS adapter.
 */
import LocalStorageManager from '../LocalStorageManager';
import * as mappers from '../storage/mappers';
import { Model } from '@nozbe/watermelondb';
import { ShoppingList } from '../../models/types';

let n = 0;
const fam = () => `fam-p3-${++n}`;
const makeList = (familyGroupId: string, over: Partial<ShoppingList> = {}): ShoppingList => ({
  id: `list-p3-${++n}`,
  name: `List ${n}`,
  familyGroupId,
  createdBy: 'u1',
  createdAt: 1000 + n,
  status: 'active',
  completedAt: null,
  completedBy: null,
  receiptUrl: null,
  receiptData: null,
  syncStatus: 'synced',
  isLocked: false,
  lockedBy: null,
  lockedByName: null,
  lockedByRole: null,
  lockedAt: null,
  budget: null,
  storeName: null,
  archived: false,
  layoutApplied: false,
  totalAmount: null,
  merchantName: null,
  purchaseDate: null,
  currency: null,
  ...over,
} as ShoppingList);

const settle = () => new Promise(r => setTimeout(r, 30));

async function observe(familyGroupId: string) {
  const emissions: ShoppingList[][] = [];
  const unsub = LocalStorageManager.observeActiveLists(familyGroupId, lists => emissions.push([...lists].sort((x, y) => y.createdAt - x.createdAt)));
  await settle();
  return { emissions, unsub };
}

afterEach(() => jest.restoreAllMocks());

it('the observer gives only active lists of the family', async () => {
  const f = fam();
  const a = makeList(f, { createdAt: 10 });
  const b = makeList(f, { createdAt: 30 });
  const done = makeList(f, { status: 'completed', completedAt: 50 });
  const gone = makeList(f, { status: 'deleted' });
  const other = makeList(fam());
  await LocalStorageManager.saveListsBatch([a, b, done, gone, other]);
  const { emissions, unsub } = await observe(f);
  expect(emissions.at(-1)!.map(l => l.id)).toEqual([b.id, a.id]);
  unsub();
});

it('completed lists with receipts are not mapped at all on an emission', async () => {
  const f = fam();
  const history = Array.from({ length: 20 }, () =>
    makeList(f, { status: 'completed', completedAt: 5, receiptData: { lineItems: [] } as any }));
  const active = makeList(f);
  await LocalStorageManager.saveListsBatch([...history, active]);
  const spy = jest.spyOn(mappers, 'listModelToType');
  const { emissions, unsub } = await observe(f);
  expect(emissions.at(-1)!.map(l => l.id)).toEqual([active.id]);
  const mappedIds = spy.mock.results.map(r => (r.value as ShoppingList).id);
  expect(mappedIds.filter(id => history.some(h => h.id === id))).toEqual([]);
  unsub();
});

it('a list being completed leaves Home; a new active one arrives', async () => {
  const f = fam();
  const a = makeList(f);
  await LocalStorageManager.saveListsBatch([a]);
  const { emissions, unsub } = await observe(f);
  await LocalStorageManager.updateList(a.id, { status: 'completed', completedAt: 99 });
  await settle();
  expect(emissions.at(-1)).toEqual([]);
  const c = makeList(f);
  await LocalStorageManager.saveListsBatch([c]);
  await settle();
  expect(emissions.at(-1)!.map(l => l.id)).toEqual([c.id]);
  unsub();
});

it('marking an already-synced list synced again does not write (no emission)', async () => {
  const f = fam();
  const a = makeList(f, { syncStatus: 'synced' });
  await LocalStorageManager.saveListsBatch([a]);
  const { emissions, unsub } = await observe(f);
  const before = emissions.length;
  const updatedAtBefore = (await LocalStorageManager.getList(a.id)) as any;
  await LocalStorageManager.markSyncedIfUnchanged('list', a.id, null);
  await settle();
  expect(emissions.length).toBe(before);
  expect(await LocalStorageManager.getList(a.id)).toEqual(updatedAtBefore);
  unsub();
});

it('a pending list is still marked synced', async () => {
  const f = fam();
  const a = makeList(f, { syncStatus: 'pending' });
  await LocalStorageManager.saveListsBatch([a]);
  await LocalStorageManager.markSyncedIfUnchanged('list', a.id, null);
  expect((await LocalStorageManager.getList(a.id))!.syncStatus).toBe('synced');
});

it('marking an already-synced list or item synced makes no write at all', async () => {
  const f = fam();
  const a = makeList(f, { syncStatus: 'synced' });
  await LocalStorageManager.saveListsBatch([a]);
  const itemId = `i-nw-${++n}`;
  await LocalStorageManager.saveItemsBatchUpsert([{ id: itemId, listId: a.id, name: 'Eggs', quantity: null, price: null, checked: false, createdBy: 'u1', createdAt: 1, updatedAt: 3, syncStatus: 'synced' } as any]);
  const update = jest.spyOn(Model.prototype, 'update');
  await LocalStorageManager.markSyncedIfUnchanged('list', a.id, null);
  await LocalStorageManager.markSyncedIfUnchanged('item', itemId, 3);
  expect(update).not.toHaveBeenCalled();
});

it('items: a synced item is not rewritten; a pending one with the expected updatedAt is marked', async () => {
  const listId = `list-p3-items-${++n}`;
  const base = { listId, name: 'Milk', quantity: null, price: null, checked: false, createdBy: 'u1', createdAt: 1, updatedAt: 7 } as any;
  await LocalStorageManager.saveItemsBatchUpsert([
    { ...base, id: `i-s-${n}`, syncStatus: 'synced' },
    { ...base, id: `i-p-${n}`, syncStatus: 'pending' },
  ]);
  await LocalStorageManager.markSyncedIfUnchanged('item', `i-s-${n}`, 7);
  await LocalStorageManager.markSyncedIfUnchanged('item', `i-p-${n}`, 7);
  expect((await LocalStorageManager.getItem(`i-s-${n}`))!.syncStatus).toBe('synced');
  expect((await LocalStorageManager.getItem(`i-p-${n}`))!.syncStatus).toBe('synced');
  await LocalStorageManager.saveItemsBatchUpsert([{ ...base, id: `i-q-${n}`, syncStatus: 'pending', updatedAt: 8 }]);
  await LocalStorageManager.markSyncedIfUnchanged('item', `i-q-${n}`, 7);
  expect((await LocalStorageManager.getItem(`i-q-${n}`))!.syncStatus).toBe('pending');
});

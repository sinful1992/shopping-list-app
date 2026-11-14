/**
 * Store layouts (the aisle order per shop). Storage was 32 % covered (Fable
 * audit task 137). Bug found covering it: a layout rearranged on this phone
 * and not sent yet was overwritten by the server's older copy and marked
 * synced, both on the start/foreground load and on another phone's change,
 * so the rearrangement was lost. Lists and items already had this guard.
 * Real WatermelonDB on the in-memory LokiJS adapter.
 */
jest.mock('react-native-get-random-values', () => ({}));

import LocalStorageManager from '../LocalStorageManager';
import FirebaseSyncListener from '../FirebaseSyncListener';
import { keepsLocalLayout } from '../storage/storeLayouts';
import { StoreLayout } from '../../models/types';

let n = 0;
const fam = 'fam-sl';
const layout = (over: Partial<StoreLayout> = {}): StoreLayout => ({
  id: `lay-${++n}`, familyGroupId: fam, storeName: `Shop ${n}`, categoryOrder: ['dairy', 'bakery'] as any,
  createdBy: 'u1', createdAt: 1, updatedAt: 100, syncStatus: 'synced', ...over,
});

describe('storage', () => {
  it('save creates, then saving the same id updates; read by store or id', async () => {
    const l = layout();
    const created = await LocalStorageManager.saveStoreLayout(l);
    expect(created).toEqual(expect.objectContaining({ id: l.id, storeName: l.storeName, categoryOrder: ['dairy', 'bakery'], syncStatus: 'synced' }));
    await LocalStorageManager.saveStoreLayout({ ...l, categoryOrder: ['bakery'] as any, updatedAt: 200, syncStatus: 'pending' });
    expect((await LocalStorageManager.getStoreLayoutById(l.id))).toEqual(expect.objectContaining({ categoryOrder: ['bakery'], updatedAt: 200, syncStatus: 'pending' }));
    expect((await LocalStorageManager.getStoreLayoutByStore(l.storeName, fam))!.id).toBe(l.id);
    expect(await LocalStorageManager.getStoreLayoutByStore(l.storeName, 'other-fam')).toBeNull();
    expect(await LocalStorageManager.getStoreLayoutById('missing')).toBeNull();
  });

  it('update changes only the fields given; a missing id is an error', async () => {
    const l = layout();
    await LocalStorageManager.saveStoreLayout(l);
    const u = await LocalStorageManager.updateStoreLayout(l.id, { syncStatus: 'pending' });
    expect(u).toEqual(expect.objectContaining({ categoryOrder: ['dairy', 'bakery'], storeName: l.storeName, syncStatus: 'pending' }));
    await expect(LocalStorageManager.updateStoreLayout('missing', { updatedAt: 1 })).rejects.toThrow('Failed to update store layout');
  });

  it('delete removes it; deleting a missing one is an error', async () => {
    const l = layout();
    await LocalStorageManager.saveStoreLayout(l);
    await LocalStorageManager.deleteStoreLayout(l.id);
    expect(await LocalStorageManager.getStoreLayoutById(l.id)).toBeNull();
    await expect(LocalStorageManager.deleteStoreLayout(l.id)).rejects.toThrow('Failed to delete store layout');
  });
});

describe('server load (saveStoreLayoutsBatch)', () => {
  it('creates new ones and updates changed synced ones', async () => {
    const known = layout();
    await LocalStorageManager.saveStoreLayout(known);
    const newId = `lay-new-${++n}`;
    await LocalStorageManager.saveStoreLayoutsBatch(fam, [
      { layoutId: known.id, data: { categoryOrder: ['bakery'], updatedAt: 300 } },
      { layoutId: newId, data: { storeName: 'Aldi', categoryOrder: ['meat'], createdBy: 'u2', updatedAt: 5 } },
    ]);
    expect(await LocalStorageManager.getStoreLayoutById(known.id)).toEqual(expect.objectContaining({ categoryOrder: ['bakery'], updatedAt: 300, syncStatus: 'synced' }));
    expect(await LocalStorageManager.getStoreLayoutById(newId)).toEqual(expect.objectContaining({ storeName: 'Aldi', categoryOrder: ['meat'], createdBy: 'u2', syncStatus: 'synced' }));
  });

  it('a layout rearranged here and not sent yet keeps its order against an older server copy', async () => {
    const mine = layout({ categoryOrder: ['frozen', 'dairy'] as any, updatedAt: 500, syncStatus: 'pending' });
    await LocalStorageManager.saveStoreLayout(mine);
    await LocalStorageManager.saveStoreLayoutsBatch(fam, [{ layoutId: mine.id, data: { categoryOrder: ['dairy', 'frozen'], updatedAt: 400 } }]);
    expect(await LocalStorageManager.getStoreLayoutById(mine.id)).toEqual(expect.objectContaining({ categoryOrder: ['frozen', 'dairy'], syncStatus: 'pending' }));
  });

  it('a newer server copy still wins over an unsent local one', async () => {
    const mine = layout({ categoryOrder: ['frozen'] as any, updatedAt: 500, syncStatus: 'failed' });
    await LocalStorageManager.saveStoreLayout(mine);
    await LocalStorageManager.saveStoreLayoutsBatch(fam, [{ layoutId: mine.id, data: { categoryOrder: ['dairy'], updatedAt: 600 } }]);
    expect(await LocalStorageManager.getStoreLayoutById(mine.id)).toEqual(expect.objectContaining({ categoryOrder: ['dairy'], syncStatus: 'synced' }));
  });

  it('nothing to do for an empty load', async () => {
    await expect(LocalStorageManager.saveStoreLayoutsBatch(fam, [])).resolves.toBeUndefined();
  });
});

describe("another phone's change (listener)", () => {
  const apply = (id: string, data: object) =>
    (FirebaseSyncListener as any).syncStoreLayoutToLocal(fam, id, data, (FirebaseSyncListener as any).generation);

  it('an older change from another phone does not undo an unsent rearrangement here', async () => {
    const mine = layout({ categoryOrder: ['frozen', 'dairy'] as any, updatedAt: 500, syncStatus: 'pending' });
    await LocalStorageManager.saveStoreLayout(mine);
    await apply(mine.id, { familyGroupId: fam, storeName: mine.storeName, categoryOrder: ['dairy', 'frozen'], createdBy: 'u2', createdAt: 1, updatedAt: 450 });
    expect((await LocalStorageManager.getStoreLayoutById(mine.id))!.categoryOrder).toEqual(['frozen', 'dairy']);
  });

  it('a synced layout takes the other phone\'s change; an unknown one is created', async () => {
    const synced = layout();
    await LocalStorageManager.saveStoreLayout(synced);
    await apply(synced.id, { familyGroupId: fam, storeName: synced.storeName, categoryOrder: ['meat'], createdBy: 'u2', createdAt: 1, updatedAt: 50 });
    expect(await LocalStorageManager.getStoreLayoutById(synced.id)).toEqual(expect.objectContaining({ categoryOrder: ['meat'], syncStatus: 'synced' }));
    const id = `lay-remote-${++n}`;
    await apply(id, { familyGroupId: fam, storeName: 'Lidl', categoryOrder: ['bakery'], createdBy: 'u2', createdAt: 1, updatedAt: 9 });
    expect((await LocalStorageManager.getStoreLayoutById(id))!.storeName).toBe('Lidl');
  });
});

describe('keepsLocalLayout', () => {
  it.each([
    [{ syncStatus: 'pending', updatedAt: 5 }, 4, true],
    [{ syncStatus: 'failed', updatedAt: 5 }, 4, true],
    [{ syncStatus: 'pending', updatedAt: 5 }, 5, false],
    [{ syncStatus: 'pending', updatedAt: 5 }, 6, false],
    [{ syncStatus: 'synced', updatedAt: 5 }, 4, false],
    [{ syncStatus: 'pending', updatedAt: 5 }, undefined, true],
    [null, 4, false],
  ])('%j vs incoming %s -> %s', (local, incoming, want) => {
    expect(keepsLocalLayout(local as any, incoming as any)).toBe(want);
  });
});

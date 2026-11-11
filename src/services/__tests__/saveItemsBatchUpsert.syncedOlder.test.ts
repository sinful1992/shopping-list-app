/**
 * Rank 20 follow-up (Codex review of PR #65, P2): with field-level writes another phone can leave
 * the server row with an older updatedAt than this phone's synced copy (clocks differ between
 * phones). The listener lets such a snapshot through for a synced row (keepsLocal), so the batch
 * upsert used by the initial load and by a fresh read must apply it too. Only a local change still
 * waiting to be sent (not synced) and newer than the server keeps the local copy.
 */
import LocalStorageManager from '../LocalStorageManager';
import { Item } from '../../models/types';

let n = 0;
const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: `older-${++n}`,
  listId: `older-list-${n}`,
  name: 'Milk',
  quantity: null,
  price: null,
  checked: false,
  createdBy: 'user-1',
  createdAt: 1000,
  updatedAt: 1000,
  syncStatus: 'synced',
  ...overrides,
});

describe('saveItemsBatchUpsert: synced rows take the server copy', () => {
  it('applies an older server snapshot over a synced local row', async () => {
    const local = makeItem({ name: 'Milk', updatedAt: 3000, syncStatus: 'synced' });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Oat milk', checked: true, updatedAt: 2000, syncStatus: 'synced' },
    ]);

    const item = await LocalStorageManager.getItem(local.id);
    expect(item?.name).toBe('Oat milk');
    expect(item?.checked).toBe(true);
    expect(item?.updatedAt).toBe(2000);
  });

  it('keeps a newer local change that is still waiting to be sent', async () => {
    const local = makeItem({ name: 'My edit', updatedAt: 3000, syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Server', updatedAt: 2000, syncStatus: 'synced' },
    ]);

    const item = await LocalStorageManager.getItem(local.id);
    expect(item?.name).toBe('My edit');
    expect(item?.syncStatus).toBe('pending');
  });

  it('keeps a newer failed local change too', async () => {
    const local = makeItem({ name: 'Failed edit', updatedAt: 3000, syncStatus: 'failed' });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Server', updatedAt: 2000, syncStatus: 'synced' },
    ]);

    expect((await LocalStorageManager.getItem(local.id))?.name).toBe('Failed edit');
  });

  it('applies a newer server copy over a pending local row (unchanged rule)', async () => {
    const local = makeItem({ name: 'Old edit', updatedAt: 1000, syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Server newer', updatedAt: 2000, syncStatus: 'synced' },
    ]);

    expect((await LocalStorageManager.getItem(local.id))?.name).toBe('Server newer');
  });

  it('mixed batch: synced older applied, pending newer kept, unknown created', async () => {
    const synced = makeItem({ name: 'S', updatedAt: 5000, syncStatus: 'synced' });
    const pending = makeItem({ name: 'P', updatedAt: 5000, syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([synced, pending]);
    const fresh = makeItem({ name: 'New' });

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...synced, name: 'S server', updatedAt: 4000 },
      { ...pending, name: 'P server', updatedAt: 4000, syncStatus: 'synced' },
      fresh,
    ]);

    expect((await LocalStorageManager.getItem(synced.id))?.name).toBe('S server');
    expect((await LocalStorageManager.getItem(pending.id))?.name).toBe('P');
    expect((await LocalStorageManager.getItem(fresh.id))?.name).toBe('New');
  });

  it('a missing incoming updatedAt still never beats a pending local change', async () => {
    const local = makeItem({ name: 'Pending', updatedAt: 3000, syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'No time', updatedAt: undefined as unknown as number, syncStatus: 'synced' },
    ]);

    expect((await LocalStorageManager.getItem(local.id))?.name).toBe('Pending');
  });
});

describe('item rows store their sync state (1.54.3)', () => {
  it('a server copy is stored as synced, a new local item as pending', async () => {
    const fromServer = makeItem({ syncStatus: 'synced' });
    const mine = makeItem({ syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([fromServer]);
    await LocalStorageManager.saveItem(mine);
    expect((await LocalStorageManager.getItem(fromServer.id))?.syncStatus).toBe('synced');
    expect((await LocalStorageManager.getItem(mine.id))?.syncStatus).toBe('pending');
  });

  it('a pending row overwritten by a newer server copy becomes synced', async () => {
    const mine = makeItem({ name: 'Mine', updatedAt: 1000, syncStatus: 'pending' });
    await LocalStorageManager.saveItem(mine);
    await LocalStorageManager.saveItemsBatchUpsert([{ ...mine, name: 'Server', updatedAt: 2000, syncStatus: 'synced' }]);
    const item = await LocalStorageManager.getItem(mine.id);
    expect(item?.name).toBe('Server');
    expect(item?.syncStatus).toBe('synced');
  });

  it('a row stored before 1.54.3 (syncStatus "") takes an older server copy', async () => {
    const legacy = makeItem({ name: 'Legacy', updatedAt: 3000 });
    await LocalStorageManager.saveItemsBatchUpsert([legacy]);
    await LocalStorageManager.updateItem(legacy.id, { syncStatus: '' as never });
    expect((await LocalStorageManager.getItem(legacy.id))?.syncStatus).toBe('');

    await LocalStorageManager.saveItemsBatchUpsert([{ ...legacy, name: 'Server', updatedAt: 2000, syncStatus: 'synced' }]);
    expect((await LocalStorageManager.getItem(legacy.id))?.name).toBe('Server');
  });
});

describe('markItemsSyncedIfBlank (1.54.3)', () => {
  it('marks only rows with an empty sync state; pending, failed and unknown ids are left alone', async () => {
    const legacy = makeItem({ name: 'Legacy' });
    const pending = makeItem({ syncStatus: 'pending' });
    const failed = makeItem({ syncStatus: 'failed' });
    await LocalStorageManager.saveItemsBatchUpsert([legacy, pending, failed]);
    await LocalStorageManager.updateItem(legacy.id, { syncStatus: '' as never });

    await LocalStorageManager.markItemsSyncedIfBlank([legacy.id, pending.id, failed.id, 'no-such-id']);

    expect((await LocalStorageManager.getItem(legacy.id))?.syncStatus).toBe('synced');
    expect((await LocalStorageManager.getItem(legacy.id))?.name).toBe('Legacy');
    expect((await LocalStorageManager.getItem(pending.id))?.syncStatus).toBe('pending');
    expect((await LocalStorageManager.getItem(failed.id))?.syncStatus).toBe('failed');
  });

  it('an empty list does nothing', async () => {
    await expect(LocalStorageManager.markItemsSyncedIfBlank([])).resolves.toBeUndefined();
  });
});

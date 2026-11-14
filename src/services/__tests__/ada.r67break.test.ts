/**
 * ada's break tests for PR #67 (1.54.3): a tick racing the batch upsert, legacy '' rows edited
 * locally, and the mapper defaults.
 */
import LocalStorageManager from '../LocalStorageManager';
import { Item } from '../../models/types';

let n = 0;
const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: `ada67-${++n}`,
  listId: 'ada67-list',
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

describe('ada break: a tick racing the first-load upsert', () => {
  it('the tick survives whichever write lands first (30 races)', async () => {
    for (let i = 0; i < 30; i++) {
      const row = makeItem({ updatedAt: 3000 });
      await LocalStorageManager.saveItemsBatchUpsert([row]);
      const serverOlder = { ...row, name: 'Oat milk', updatedAt: 2000, syncStatus: 'synced' as const };
      const tick = { checked: true, updatedAt: 5000 + i, syncStatus: 'pending' as const };
      const order = i % 2 === 0;
      await Promise.all(order
        ? [LocalStorageManager.saveItemsBatchUpsert([serverOlder]), LocalStorageManager.updateItem(row.id, tick)]
        : [LocalStorageManager.updateItem(row.id, tick), LocalStorageManager.saveItemsBatchUpsert([serverOlder])]);
      const got = await LocalStorageManager.getItem(row.id);
      expect(got?.checked).toBe(true);
      expect(got?.syncStatus).toBe('pending');
    }
  });
});

describe('ada break: legacy rows', () => {
  it('a legacy "" row ticked locally (now pending, newer) keeps the tick over an older server copy', async () => {
    const legacy = makeItem({ updatedAt: 3000 });
    await LocalStorageManager.saveItemsBatchUpsert([legacy]);
    await LocalStorageManager.updateItem(legacy.id, { syncStatus: '' as never });
    await LocalStorageManager.updateItem(legacy.id, { checked: true, updatedAt: 4000, syncStatus: 'pending' });
    await LocalStorageManager.saveItemsBatchUpsert([{ ...legacy, name: 'Server', updatedAt: 3500 }]);
    const got = await LocalStorageManager.getItem(legacy.id);
    expect(got?.checked).toBe(true);
    expect(got?.name).toBe('Milk');
  });

  it('markItemsSyncedIfBlank after a local edit landed leaves the edit pending', async () => {
    const legacy = makeItem();
    await LocalStorageManager.saveItemsBatchUpsert([legacy]);
    await LocalStorageManager.updateItem(legacy.id, { syncStatus: '' as never });
    await Promise.all([
      LocalStorageManager.updateItem(legacy.id, { checked: true, updatedAt: 9000, syncStatus: 'pending' }),
      LocalStorageManager.markItemsSyncedIfBlank([legacy.id]),
    ]);
    const got = await LocalStorageManager.getItem(legacy.id);
    expect(got?.checked).toBe(true);
    // Either order: if the mark ran first the edit set pending after it; if the edit ran first the mark skipped it.
    expect(got?.syncStatus).toBe('pending');
  });
});

describe('ada break: mapper defaults', () => {
  it('a batch-added item with no syncStatus is stored pending, never ""', async () => {
    const it1 = makeItem({ syncStatus: undefined as never });
    await LocalStorageManager.saveItemsBatch([it1]);
    expect((await LocalStorageManager.getItem(it1.id))?.syncStatus).toBe('pending');
  });

  it('an equal updatedAt from the server replaces a pending row (echo of our own write)', async () => {
    const mine = makeItem({ name: 'Mine', updatedAt: 3000, syncStatus: 'pending' });
    await LocalStorageManager.saveItem(mine);
    await LocalStorageManager.saveItemsBatchUpsert([{ ...mine, syncStatus: 'synced' }]);
    expect((await LocalStorageManager.getItem(mine.id))?.syncStatus).toBe('synced');
  });
});

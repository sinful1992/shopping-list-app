// moduleNameMapper in jest.config.js swaps:
//   @nozbe/watermelondb/adapters/sqlite → LokiJS in-memory adapter
//   @react-native-firebase/*            → no-op stub
// This lets the real LocalStorageManager singleton run in Node.js.

import localStorageManager from '../../src/services/LocalStorageManager';
import { Item, ShoppingList } from '../../src/models/types';
import { v4 as uuidv4 } from 'uuid';

const FAMILY_GROUP = 'test-family-group';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: uuidv4(),
    listId: uuidv4(),
    name: 'Apples',
    quantity: '2',
    price: 3.49,
    checked: false,
    createdBy: 'user-1',
    createdAt: Date.now(),
    updatedAt: 1000,
    syncStatus: 'pending',
    category: 'produce',
    sortOrder: 100,
    unitQty: 2,
    measurementUnit: 'kg',
    measurementValue: 1.5,
    ...overrides,
  };
}

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: uuidv4(),
    name: 'Weekly Shop',
    familyGroupId: FAMILY_GROUP,
    createdBy: 'user-1',
    createdAt: Date.now(),
    status: 'active',
    completedAt: null,
    completedBy: null,
    receiptUrl: null,
    receiptData: null,
    syncStatus: 'pending',
    isLocked: false,
    lockedBy: null,
    lockedByName: null,
    lockedByRole: null,
    lockedAt: null,
    budget: null,
    totalAmount: null,
    merchantName: null,
    purchaseDate: null,
    currency: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// markSyncedIfUnchanged
// ---------------------------------------------------------------------------

describe('markSyncedIfUnchanged — item', () => {
  it('marks synced when updatedAt matches the pushed snapshot', async () => {
    const item = makeItem({ updatedAt: 1000 });
    await localStorageManager.saveItem(item);

    await localStorageManager.markSyncedIfUnchanged('item', item.id, 1000);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.syncStatus).toBe('synced');
  });

  it('does NOT mark synced when a newer edit has occurred since the push', async () => {
    const item = makeItem({ updatedAt: 1000 });
    await localStorageManager.saveItem(item);

    // Simulate a second user edit arriving while the first sync was in-flight
    await localStorageManager.updateItem(item.id, {
      name: 'Pears',
      updatedAt: 2000,
      syncStatus: 'pending',
    });

    // The sync engine calls markSyncedIfUnchanged with the OLD snapshot timestamp
    await localStorageManager.markSyncedIfUnchanged('item', item.id, 1000);

    const saved = await localStorageManager.getItem(item.id);
    // Second edit is still pending — must not be silently shown as synced
    expect(saved?.syncStatus).toBe('pending');
  });

  it('marks synced when expectedUpdatedAt is null (no timestamp available)', async () => {
    const item = makeItem({ updatedAt: 1000 });
    await localStorageManager.saveItem(item);

    await localStorageManager.markSyncedIfUnchanged('item', item.id, null);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.syncStatus).toBe('synced');
  });
});

describe('markSyncedIfUnchanged — list', () => {
  it('always marks synced (ShoppingList has no updatedAt field to guard against)', async () => {
    const list = makeList({ syncStatus: 'pending' });
    await localStorageManager.saveList(list);

    // Pass an arbitrary timestamp — lists unconditionally mark synced
    await localStorageManager.markSyncedIfUnchanged('list', list.id, 99999);

    const saved = await localStorageManager.getList(list.id);
    expect(saved?.syncStatus).toBe('synced');
  });
});

// ---------------------------------------------------------------------------
// Item field round-trip — catches missing fields in the mapping helpers
// ---------------------------------------------------------------------------

describe('item field round-trip', () => {
  it('preserves all fields through saveItem → getItem', async () => {
    const item = makeItem({ id: uuidv4(), updatedAt: Date.now() });
    await localStorageManager.saveItem(item);

    const saved = await localStorageManager.getItem(item.id);

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(item.id);
    expect(saved?.listId).toBe(item.listId);
    expect(saved?.name).toBe(item.name);
    expect(saved?.quantity).toBe(item.quantity);
    expect(saved?.price).toBe(item.price);
    expect(saved?.checked).toBe(item.checked);
    expect(saved?.createdBy).toBe(item.createdBy);
    expect(saved?.updatedAt).toBe(item.updatedAt);
    expect(saved?.category).toBe(item.category);
    expect(saved?.sortOrder).toBe(item.sortOrder);
    expect(saved?.unitQty).toBe(item.unitQty);
    expect(saved?.measurementUnit).toBe(item.measurementUnit);
    expect(saved?.measurementValue).toBe(item.measurementValue);
  });

  it('round-trips null measurement fields without coercion', async () => {
    const item = makeItem({
      id: uuidv4(),
      unitQty: null,
      measurementUnit: null,
      measurementValue: null,
      category: null,
      sortOrder: null,
      quantity: null,
      price: null,
    });
    await localStorageManager.saveItem(item);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.unitQty).toBeNull();
    expect(saved?.measurementUnit).toBeNull();
    expect(saved?.measurementValue).toBeNull();
    expect(saved?.category).toBeNull();
    expect(saved?.sortOrder).toBeNull();
    expect(saved?.quantity).toBeNull();
    expect(saved?.price).toBeNull();
  });

  it('preserves updated fields after updateItem', async () => {
    const item = makeItem({ id: uuidv4(), updatedAt: 1000 });
    await localStorageManager.saveItem(item);

    await localStorageManager.updateItem(item.id, {
      name: 'Oranges',
      price: 5.99,
      measurementUnit: 'lb',
      measurementValue: 3.0,
      updatedAt: 2000,
      syncStatus: 'pending',
    });

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.name).toBe('Oranges');
    expect(saved?.price).toBe(5.99);
    expect(saved?.measurementUnit).toBe('lb');
    expect(saved?.measurementValue).toBe(3.0);
    expect(saved?.updatedAt).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// saveItemsBatchUpsert — timestamp guard and upsert behaviour
// ---------------------------------------------------------------------------

describe('saveItemsBatchUpsert', () => {
  it('creates new items that do not exist locally', async () => {
    const item = makeItem({ updatedAt: 1000 });
    await localStorageManager.saveItemsBatchUpsert([item]);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.name).toBe(item.name);
    expect(saved?.updatedAt).toBe(1000);
  });

  it('overwrites local item when incoming is newer', async () => {
    const item = makeItem({ updatedAt: 1000, name: 'Apples' });
    await localStorageManager.saveItem(item);

    await localStorageManager.saveItemsBatchUpsert([{ ...item, name: 'Oranges', updatedAt: 2000 }]);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.name).toBe('Oranges');
    expect(saved?.updatedAt).toBe(2000);
  });

  it('preserves local item when incoming is older (local wins)', async () => {
    const item = makeItem({ updatedAt: 2000, name: 'Local Edit' });
    await localStorageManager.saveItem(item);

    await localStorageManager.saveItemsBatchUpsert([{ ...item, name: 'Stale Firebase Data', updatedAt: 1000 }]);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.name).toBe('Local Edit');
    expect(saved?.updatedAt).toBe(2000);
  });

  it('overwrites local item when timestamps are equal', async () => {
    const item = makeItem({ updatedAt: 1000, name: 'Original' });
    await localStorageManager.saveItem(item);

    await localStorageManager.saveItemsBatchUpsert([{ ...item, name: 'Incoming', updatedAt: 1000 }]);

    const saved = await localStorageManager.getItem(item.id);
    expect(saved?.name).toBe('Incoming');
  });

  it('handles a mixed batch: creates new, updates newer, skips older', async () => {
    const existing = makeItem({ updatedAt: 2000, name: 'Keep Me' });
    await localStorageManager.saveItem(existing);

    const newItem = makeItem({ updatedAt: 1000 });
    const staleUpdate = { ...existing, name: 'Stale', updatedAt: 500 };
    const freshItem = makeItem({ updatedAt: 3000, name: 'Fresh' });

    await localStorageManager.saveItemsBatchUpsert([newItem, staleUpdate, freshItem]);

    expect((await localStorageManager.getItem(existing.id))?.name).toBe('Keep Me');
    expect(await localStorageManager.getItem(newItem.id)).not.toBeNull();
    expect((await localStorageManager.getItem(freshItem.id))?.name).toBe('Fresh');
  });
});

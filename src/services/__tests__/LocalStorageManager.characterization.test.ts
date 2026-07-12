/**
 * Characterization tests for LocalStorageManager's sync-critical paths,
 * written ahead of the domain-module split so behavior is pinned before
 * any code moves. Runs against real WatermelonDB on the in-memory LokiJS
 * adapter (see jest.config.js moduleNameMapper).
 *
 * Pinned behaviors:
 * - saveItemsBatchUpsert: create/update mix, last-write-wins guard
 *   (strictly newer local record wins; equal timestamps apply the incoming
 *   write), tombstone resurrection inside the write transaction.
 * - Sync queue: FIFO by timestamp, JSON roundtrip, corrupt entries skipped,
 *   retry-field updates, clear.
 * - markSyncedIfUnchanged: conditional mark for items, unconditional for
 *   lists, silent no-op for missing records.
 */

import LocalStorageManager from '../LocalStorageManager';
import { Item, QueuedOperation } from '../../models/types';

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: nextId('item'),
  listId: 'list-default',
  name: 'Milk',
  quantity: null,
  price: null,
  checked: false,
  createdBy: 'user-1',
  createdAt: 1000,
  updatedAt: 1000,
  syncStatus: 'pending',
  ...overrides,
});

type ItemQueuedOperation = Extract<QueuedOperation, { entityType: 'item' }>;

const makeOp = (overrides: Partial<ItemQueuedOperation> = {}): ItemQueuedOperation => ({
  id: nextId('op'),
  entityType: 'item',
  entityId: 'entity-1',
  operation: 'update',
  data: makeItem({ name: 'Milk', checked: true }),
  timestamp: 1000,
  retryCount: 0,
  nextRetryAt: null,
  ...overrides,
});

describe('saveItemsBatchUpsert', () => {
  it('creates items that do not exist yet', async () => {
    const listId = nextId('list');
    const a = makeItem({ listId, name: 'Bread' });
    const b = makeItem({ listId, name: 'Eggs' });

    await LocalStorageManager.saveItemsBatchUpsert([a, b]);

    const items = await LocalStorageManager.getItemsForList(listId);
    expect(items.map(i => i.name).sort()).toEqual(['Bread', 'Eggs']);
  });

  it('is a no-op for an empty array', async () => {
    await expect(LocalStorageManager.saveItemsBatchUpsert([])).resolves.toBeUndefined();
  });

  it('applies a full update when the incoming item is newer', async () => {
    const listId = nextId('list');
    const original = makeItem({ listId, name: 'Butter', checked: false, updatedAt: 1000 });
    await LocalStorageManager.saveItemsBatchUpsert([original]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...original, name: 'Salted Butter', checked: true, price: 2.5, updatedAt: 2000 },
    ]);

    const item = await LocalStorageManager.getItem(original.id);
    expect(item?.name).toBe('Salted Butter');
    expect(item?.checked).toBe(true);
    expect(item?.price).toBe(2.5);
    expect(item?.updatedAt).toBe(2000);
  });

  it('skips the incoming item when the local record is strictly newer (last-write-wins)', async () => {
    const listId = nextId('list');
    const local = makeItem({ listId, name: 'Local Edit', updatedAt: 3000 });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Stale Remote', updatedAt: 2000 },
    ]);

    const item = await LocalStorageManager.getItem(local.id);
    expect(item?.name).toBe('Local Edit');
    expect(item?.updatedAt).toBe(3000);
  });

  it('applies the incoming item when timestamps are equal', async () => {
    const listId = nextId('list');
    const local = makeItem({ listId, name: 'Original', updatedAt: 2000 });
    await LocalStorageManager.saveItemsBatchUpsert([local]);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...local, name: 'Same-Timestamp Remote', updatedAt: 2000 },
    ]);

    const item = await LocalStorageManager.getItem(local.id);
    expect(item?.name).toBe('Same-Timestamp Remote');
  });

  it('handles a mixed batch: stale skipped, newer updated, unknown created', async () => {
    const listId = nextId('list');
    const stale = makeItem({ listId, name: 'Keep Local', updatedAt: 3000 });
    const old = makeItem({ listId, name: 'Old Name', updatedAt: 1000 });
    await LocalStorageManager.saveItemsBatchUpsert([stale, old]);

    const fresh = makeItem({ listId, name: 'Brand New' });
    await LocalStorageManager.saveItemsBatchUpsert([
      { ...stale, name: 'Stale Remote', updatedAt: 2000 },
      { ...old, name: 'New Name', updatedAt: 2000 },
      fresh,
    ]);

    const items = await LocalStorageManager.getItemsForList(listId);
    expect(items.map(i => i.name).sort()).toEqual(['Brand New', 'Keep Local', 'New Name']);
  });

  it('resurrects a tombstoned item (delete then remote re-create)', async () => {
    const listId = nextId('list');
    const item = makeItem({ listId, name: 'Deleted Locally', updatedAt: 1000 });
    await LocalStorageManager.saveItemsBatchUpsert([item]);
    await LocalStorageManager.deleteItem(item.id);
    // Quirk being pinned: query-based reads exclude the tombstone, but
    // getItem (collection.find) still serves the cached soft-deleted record.
    expect(await LocalStorageManager.getItemsForList(listId)).toHaveLength(0);
    expect((await LocalStorageManager.getItem(item.id))?.name).toBe('Deleted Locally');

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...item, name: 'Re-created Remotely', updatedAt: 2000 },
    ]);

    const items = await LocalStorageManager.getItemsForList(listId);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Re-created Remotely');
  });

  it('resurrects items tombstoned via deleteItemsBatch', async () => {
    const listId = nextId('list');
    const a = makeItem({ listId, updatedAt: 1000 });
    const b = makeItem({ listId, updatedAt: 1000 });
    await LocalStorageManager.saveItemsBatchUpsert([a, b]);
    await LocalStorageManager.deleteItemsBatch([a.id, b.id]);
    expect(await LocalStorageManager.getItemsForList(listId)).toHaveLength(0);

    await LocalStorageManager.saveItemsBatchUpsert([
      { ...a, updatedAt: 2000 },
      { ...b, updatedAt: 2000 },
    ]);

    expect(await LocalStorageManager.getItemsForList(listId)).toHaveLength(2);
  });
});

describe('sync queue', () => {
  beforeEach(async () => {
    await LocalStorageManager.clearSyncQueue();
  });

  it('roundtrips an operation through add + get, parsing the JSON payload', async () => {
    const op = makeOp({ data: makeItem({ name: 'Cheese', quantity: '2' }) });
    await LocalStorageManager.addToSyncQueue(op);

    const queue = await LocalStorageManager.getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(op);
  });

  it('returns operations sorted by timestamp ascending regardless of insert order', async () => {
    const late = makeOp({ timestamp: 3000 });
    const early = makeOp({ timestamp: 1000 });
    const mid = makeOp({ timestamp: 2000 });
    await LocalStorageManager.addToSyncQueue(late);
    await LocalStorageManager.addToSyncQueue(early);
    await LocalStorageManager.addToSyncQueue(mid);

    const queue = await LocalStorageManager.getSyncQueue();
    expect(queue.map(o => o.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it('silently skips entries whose data is corrupt JSON', async () => {
    const good = makeOp({ timestamp: 1000 });
    await LocalStorageManager.addToSyncQueue(good);

    const db = LocalStorageManager.getDatabase();
    const collection = db.get<any>('sync_queue');
    await db.write(async () => {
      await collection.create((record: any) => {
        record._raw.id = nextId('op');
        record.entityType = 'item';
        record.entityId = 'entity-corrupt';
        record.operation = 'update';
        record.data = 'not-valid-json{{{';
        record.timestamp = 2000;
        record.retryCount = 0;
        record.nextRetryAt = null;
      });
    });

    const queue = await LocalStorageManager.getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(good.id);
  });

  it('removes a single operation by id', async () => {
    const keep = makeOp({ timestamp: 1000 });
    const remove = makeOp({ timestamp: 2000 });
    await LocalStorageManager.addToSyncQueue(keep);
    await LocalStorageManager.addToSyncQueue(remove);

    await LocalStorageManager.removeFromSyncQueue(remove.id);

    const queue = await LocalStorageManager.getSyncQueue();
    expect(queue.map(o => o.id)).toEqual([keep.id]);
  });

  it('throws a wrapped error when removing a nonexistent operation', async () => {
    await expect(LocalStorageManager.removeFromSyncQueue('does-not-exist')).rejects.toThrow(
      /Failed to remove from sync queue/
    );
  });

  it('updates only retryCount and nextRetryAt, leaving the payload intact', async () => {
    const op = makeOp({ data: makeItem({ name: 'Yogurt' }), retryCount: 0, nextRetryAt: null });
    await LocalStorageManager.addToSyncQueue(op);

    await LocalStorageManager.updateSyncQueueOperation(op.id, { retryCount: 3, nextRetryAt: 9999 });

    const [updated] = await LocalStorageManager.getSyncQueue();
    expect(updated.retryCount).toBe(3);
    expect(updated.nextRetryAt).toBe(9999);
    expect(updated.data).toMatchObject({ name: 'Yogurt' });
    expect(updated.operation).toBe(op.operation);
  });

  it('clearSyncQueue empties the queue and is safe on an already-empty queue', async () => {
    await LocalStorageManager.addToSyncQueue(makeOp());
    await LocalStorageManager.addToSyncQueue(makeOp());

    await LocalStorageManager.clearSyncQueue();
    expect(await LocalStorageManager.getSyncQueue()).toHaveLength(0);

    await expect(LocalStorageManager.clearSyncQueue()).resolves.toBeUndefined();
  });
});

describe('markSyncedIfUnchanged', () => {
  it('marks an item synced when updatedAt matches the expected value', async () => {
    const item = makeItem({ updatedAt: 5000 });
    await LocalStorageManager.saveItemsBatchUpsert([item]);

    await LocalStorageManager.markSyncedIfUnchanged('item', item.id, 5000);

    const stored = await LocalStorageManager.getItem(item.id);
    expect(stored?.syncStatus).toBe('synced');
  });

  it('does not mark an item synced when updatedAt changed since the sync started', async () => {
    const item = makeItem({ updatedAt: 6000 });
    await LocalStorageManager.saveItemsBatchUpsert([item]);

    await LocalStorageManager.markSyncedIfUnchanged('item', item.id, 5000);

    const stored = await LocalStorageManager.getItem(item.id);
    expect(stored?.syncStatus).not.toBe('synced');
  });

  it('marks an item synced unconditionally when expectedUpdatedAt is null', async () => {
    const item = makeItem({ updatedAt: 7000 });
    await LocalStorageManager.saveItemsBatchUpsert([item]);

    await LocalStorageManager.markSyncedIfUnchanged('item', item.id, null);

    const stored = await LocalStorageManager.getItem(item.id);
    expect(stored?.syncStatus).toBe('synced');
  });

  it('resolves silently when the record no longer exists', async () => {
    await expect(
      LocalStorageManager.markSyncedIfUnchanged('item', 'gone-item', 1000)
    ).resolves.toBeUndefined();
  });

  it('marks a list synced without checking updatedAt', async () => {
    const listId = nextId('list');
    await LocalStorageManager.saveList({
      id: listId,
      name: 'Weekly Shop',
      familyGroupId: 'fg-1',
      createdBy: 'user-1',
      createdAt: 1000,
      updatedAt: 1000,
      status: 'active',
      syncStatus: 'pending',
      items: [],
    } as any);

    await LocalStorageManager.markSyncedIfUnchanged('list', listId, 12345);

    const list = await LocalStorageManager.getList(listId);
    expect(list?.syncStatus).toBe('synced');
  });
});

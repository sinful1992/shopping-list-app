import { Database, Q } from '@nozbe/watermelondb';
import { Item } from '../../models/types';
import CrashReporting from '../CrashReporting';
import { ItemModel } from '../../database/models/Item';
import { applyItemCreate, applyItemFullUpdate, itemModelToType } from './mappers';

/**
 * Items storage domain. Receives the shared WatermelonDB handle from
 * LocalStorageManager (the facade); all methods moved verbatim.
 */
export class ItemsStorage {
  constructor(private database: Database) {}

  /**
   * Save item (create or update)
   * Implements Req 9.2, 9.3
   */
  async saveItem(item: Item): Promise<Item> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');

      let itemRecord: ItemModel | undefined;

      await this.database.write(async () => {
        const existing = await itemsCollection.query(Q.where('id', item.id)).fetch();
        if (existing.length > 0) {
          itemRecord = existing[0];
          await itemRecord.update((record) => { applyItemFullUpdate(record, item); });
        } else {
          itemRecord = await itemsCollection.create((record) => { applyItemCreate(record, item); });
        }
      }, 'saveItem');

      if (!itemRecord) {
        throw new Error('Failed to create or update item record');
      }

      return itemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to save item: ${error.message}`);
    }
  }

  /**
   * Get item by ID
   */
  async getItem(itemId: string): Promise<Item | null> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const itemRecord = await itemsCollection.find(itemId);
      return itemModelToType(itemRecord);
    } catch {
      return null;
    }
  }

  /**
   * Get all items for a list
   */
  async getItemsForList(listId: string): Promise<Item[]> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const items = await itemsCollection
        .query(
          Q.where('list_id', listId),
          Q.sortBy('created_at', Q.asc)
        )
        .fetch();

      return items.map((item) => itemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get items: ${error.message}`);
    }
  }

  /**
   * Get items for multiple lists in a single query
   */
  async getItemsForLists(listIds: string[]): Promise<Item[]> {
    if (listIds.length === 0) return [];
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const items = await itemsCollection
        .query(Q.where('list_id', Q.oneOf(listIds)))
        .fetch();
      return items.map(item => itemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get items for lists: ${error.message}`);
    }
  }

  /**
   * Update item
   */
  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const itemRecord = await itemsCollection.find(itemId);

      await this.database.write(async () => {
        await itemRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.quantity !== undefined) record.quantity = updates.quantity;
          if (updates.price !== undefined) record.price = updates.price;
          if (updates.checked !== undefined) record.checked = updates.checked;
          if (updates.updatedAt !== undefined) record.updatedAt = updates.updatedAt;
          if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
          if (updates.category !== undefined) record.category = updates.category;
          if (updates.sortOrder !== undefined) record.sortOrder = updates.sortOrder;
          if (updates.unitQty !== undefined) record.unitQty = updates.unitQty;
          if (updates.measurementUnit !== undefined) record.measurementUnit = updates.measurementUnit;
          if (updates.measurementValue !== undefined) record.measurementValue = updates.measurementValue;
        });
      }, 'updateItem');

      return itemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to update item: ${error.message}`);
    }
  }

  /**
   * Batch update multiple items in a single DB transaction
   */
  async updateItemsBatch(updates: Array<{ id: string; updates: Partial<Item> }>): Promise<Item[]> {
    if (updates.length === 0) return [];
    const itemsCollection = this.database.get<ItemModel>('items');
    const ids = updates.map(u => u.id);
    const updatedItems: Item[] = [];

    await this.database.write(async () => {
      const records = await itemsCollection
        .query(Q.where('id', Q.oneOf(ids)))
        .fetch();
      const recordMap = new Map(records.map(r => [r.id, r]));

      const ops: any[] = [];
      const processedRecords: ItemModel[] = [];
      for (const { id, updates: itemUpdates } of updates) {
        const record = recordMap.get(id);
        if (!record) continue;
        ops.push(record.prepareUpdate((r: ItemModel) => {
          if (itemUpdates.name !== undefined) r.name = itemUpdates.name;
          if (itemUpdates.quantity !== undefined) r.quantity = itemUpdates.quantity;
          if (itemUpdates.price !== undefined) r.price = itemUpdates.price;
          if (itemUpdates.checked !== undefined) r.checked = itemUpdates.checked;
          if (itemUpdates.updatedAt !== undefined) r.updatedAt = itemUpdates.updatedAt;
          if (itemUpdates.syncStatus !== undefined) r.syncStatus = itemUpdates.syncStatus;
          if (itemUpdates.category !== undefined) r.category = itemUpdates.category;
          if (itemUpdates.sortOrder !== undefined) r.sortOrder = itemUpdates.sortOrder;
          if (itemUpdates.unitQty !== undefined) r.unitQty = itemUpdates.unitQty;
          if (itemUpdates.measurementUnit !== undefined) r.measurementUnit = itemUpdates.measurementUnit;
          if (itemUpdates.measurementValue !== undefined) r.measurementValue = itemUpdates.measurementValue;
        }));
        processedRecords.push(record);
      }
      if (ops.length > 0) {
        await this.database.batch(ops);
      }
      for (const record of processedRecords) {
        updatedItems.push(itemModelToType(record));
      }
    }, 'updateItemsBatch');

    return updatedItems;
  }

  /**
   * Delete item
   */
  async deleteItem(itemId: string): Promise<void> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const itemRecord = await itemsCollection.find(itemId);
      await this.database.write(async () => {
        await itemRecord.markAsDeleted();
      }, 'deleteItem');
    } catch (error: any) {
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  /**
   * Batch save multiple items (more efficient than individual saves)
   */
  async saveItemsBatch(items: Item[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const itemsCollection = this.database.get<ItemModel>('items');

      await this.database.write(async () => {
        const ops: any[] = items.map(item =>
          itemsCollection.prepareCreate(r => applyItemCreate(r, item))
        );
        try {
          await this.database.batch(ops);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'saveItemsBatch batch failed, falling back to individual writes');
          for (const item of items) {
            try {
              await itemsCollection.create(r => applyItemCreate(r, item));
            } catch (e) {
              CrashReporting.recordError(e as Error, `saveItemsBatch individual create failed for ${item.id}`);
            }
          }
        }
      }, 'saveItemsBatch');
    } catch (error: any) {
      throw new Error(`Failed to batch save items: ${error.message}`);
    }
  }

  async saveItemsBatchUpsert(items: Item[]): Promise<void> {
    if (items.length === 0) return;
    const itemsCollection = this.database.get<ItemModel>('items');
    try {
      const ids = items.map(i => i.id);

      await this.database.write(async () => {
        // Destroy tombstones inside the transaction to prevent a race where a concurrent
        // markAsDeleted() could soft-delete a record between the fetch and the upsert.
        const deletedIds = await this.database.adapter.getDeletedRecords('items');
        const staleIds = ids.filter(id => deletedIds.includes(id));
        if (staleIds.length > 0) {
          await this.database.adapter.destroyDeletedRecords('items', staleIds);
        }

        const existingRecords = await itemsCollection
          .query(Q.where('id', Q.oneOf(ids)))
          .fetch();
        const existingMap = new Map(existingRecords.map(r => [r.id, r]));

        const ops: any[] = [];
        for (const item of items) {
          const existing = existingMap.get(item.id);
          if (existing) {
            if (existing.updatedAt > (item.updatedAt ?? 0)) continue;
            ops.push(existing.prepareUpdate(r => applyItemFullUpdate(r as ItemModel, item)));
          } else {
            ops.push(itemsCollection.prepareCreate(r => applyItemCreate(r, item)));
          }
        }
        if (ops.length === 0) return;

        try {
          await this.database.batch(ops);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'saveItemsBatchUpsert batch failed, falling back to individual writes');
          for (const item of items) {
            try {
              const records = await itemsCollection.query(Q.where('id', item.id)).fetch();
              const rec = records[0];
              if (rec) {
                if (rec.updatedAt > (item.updatedAt ?? 0)) continue;
                await rec.update(r => applyItemFullUpdate(r, item));
              } else {
                await itemsCollection.create(r => applyItemCreate(r, item));
              }
            } catch (e) {
              CrashReporting.recordError(e as Error, `saveItemsBatchUpsert individual write failed for ${item.id}`);
            }
          }
        }
      }, 'saveItemsBatchUpsert');
    } catch (error: any) {
      throw new Error(`Failed to batch upsert items: ${error.message}`);
    }
  }

  /**
   * Batch delete multiple items (more efficient than individual deletes)
   * Uses Q.oneOf to fetch all items in one query instead of N+1 queries
   */
  async deleteItemsBatch(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;

    try {
      const itemsCollection = this.database.get<ItemModel>('items');

      await this.database.write(async () => {
        const itemRecords = await itemsCollection
          .query(Q.where('id', Q.oneOf(itemIds)))
          .fetch();
        if (itemRecords.length === 0) return;
        const ops: any[] = itemRecords.map(item => item.prepareMarkAsDeleted());
        await this.database.batch(ops);
      }, 'deleteItemsBatch');
    } catch (error: any) {
      throw new Error(`Failed to batch delete items: ${error.message}`);
    }
  }

  /**
   * Observe items for a specific list (returns WatermelonDB observable)
   */
  observeItemsForList(listId: string, callback: (items: Item[]) => void): () => void {
    const itemsCollection = this.database.get<ItemModel>('items');

    // Query without sorting to ensure observer fires on all changes
    // Sorting is done in JavaScript below for better observer reactivity
    const query = itemsCollection.query(
      Q.where('list_id', listId)
    );

    // Use observeWithColumns to trigger on field changes (category, checked, etc.)
    // Without this, observer only fires on record add/delete, not field updates
    const subscription = query.observeWithColumns(['category', 'checked', 'name', 'price', 'quantity', 'sort_order', 'unit_qty', 'measurement_unit', 'measurement_value']).subscribe((itemModels) => {
      // Convert to Item types
      let items = itemModels.map((model) => itemModelToType(model));

      // Sort by sortOrder when available, falling back to createdAt
      items = items.sort((a, b) => {
        const orderA = a.sortOrder ?? a.createdAt ?? 0;
        const orderB = b.sortOrder ?? b.createdAt ?? 0;
        return orderA - orderB;
      });

      callback(items);
    });

    return () => subscription.unsubscribe();
  }
}

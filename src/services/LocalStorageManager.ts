import { Database, Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import { ShoppingList, Item, QueuedOperation, ReceiptData, UrgentItem, CategoryHistory, PriceHistoryRecord, StoreLayout } from '../models/types';
import { safeJsonParse } from '../utils/safeJsonParse';
import { CategoryType } from './CategoryService';
import CrashReporting from './CrashReporting';
import { CategoryHistoryModel } from '../database/models/CategoryHistory';
import { PriceHistoryModel } from '../database/models/PriceHistory';
import StoreLayoutModel from '../database/models/StoreLayout';
import { createDatabase } from './storage/database';
import { ListsStorage } from './storage/lists';
import { ItemsStorage } from './storage/items';
import { SyncQueueStorage } from './storage/syncQueue';
import { UrgentItemsStorage } from './storage/urgentItems';

/**
 * LocalStorageManager
 * Persists data locally using WatermelonDB for offline access
 * Implements Requirements: 4.4, 9.2, 9.3, 9.5
 */
class LocalStorageManager {
  private database: Database;
  private lists: ListsStorage;
  private items: ItemsStorage;
  private syncQueue: SyncQueueStorage;
  private urgentItems: UrgentItemsStorage;

  constructor() {
    this.database = createDatabase();
    this.lists = new ListsStorage(this.database);
    this.items = new ItemsStorage(this.database);
    this.syncQueue = new SyncQueueStorage(this.database);
    this.urgentItems = new UrgentItemsStorage(this.database);
  }

  /** Expose the database instance for direct access (e.g. backfill migrations). */
  getDatabase(): Database {
    return this.database;
  }

  // ===== SHOPPING LIST METHODS (delegated to ListsStorage) =====

  async saveList(list: ShoppingList): Promise<ShoppingList> {
    return this.lists.saveList(list);
  }

  async saveListsBatch(lists: ShoppingList[]): Promise<void> {
    return this.lists.saveListsBatch(lists);
  }

  async getList(listId: string): Promise<ShoppingList | null> {
    return this.lists.getList(listId);
  }

  async getAllLists(familyGroupId: string): Promise<ShoppingList[]> {
    return this.lists.getAllLists(familyGroupId);
  }

  async getActiveLists(familyGroupId: string): Promise<ShoppingList[]> {
    return this.lists.getActiveLists(familyGroupId);
  }

  async getCompletedLists(familyGroupId: string, startDate?: number, endDate?: number, limit?: number, offset?: number): Promise<ShoppingList[]> {
    return this.lists.getCompletedLists(familyGroupId, startDate, endDate, limit, offset);
  }

  async countCompletedLists(familyGroupId: string, startDate?: number, endDate?: number): Promise<number> {
    return this.lists.countCompletedLists(familyGroupId, startDate, endDate);
  }

  async updateList(listId: string, updates: Partial<ShoppingList>): Promise<ShoppingList> {
    return this.lists.updateList(listId, updates);
  }

  async deleteList(listId: string): Promise<void> {
    return this.lists.deleteList(listId);
  }

  async saveReceiptData(listId: string, receiptData: ReceiptData): Promise<void> {
    return this.lists.saveReceiptData(listId, receiptData);
  }

  async getReceiptData(listId: string): Promise<ReceiptData | null> {
    return this.lists.getReceiptData(listId);
  }

  async getTotalExpenditureForDateRange(familyGroupId: string, startDate: number, endDate: number): Promise<number> {
    return this.lists.getTotalExpenditureForDateRange(familyGroupId, startDate, endDate);
  }

  async getListsWithReceiptsInDateRange(familyGroupId: string, startDate: number, endDate: number): Promise<ShoppingList[]> {
    return this.lists.getListsWithReceiptsInDateRange(familyGroupId, startDate, endDate);
  }

  observeAllLists(familyGroupId: string, callback: (lists: ShoppingList[]) => void): () => void {
    return this.lists.observeAllLists(familyGroupId, callback);
  }

  observeList(listId: string, callback: (list: ShoppingList | null) => void): () => void {
    return this.lists.observeList(listId, callback);
  }

  // ===== ITEM METHODS (delegated to ItemsStorage) =====

  async saveItem(item: Item): Promise<Item> {
    return this.items.saveItem(item);
  }

  async getItem(itemId: string): Promise<Item | null> {
    return this.items.getItem(itemId);
  }

  async getItemsForList(listId: string): Promise<Item[]> {
    return this.items.getItemsForList(listId);
  }

  async getItemsForLists(listIds: string[]): Promise<Item[]> {
    return this.items.getItemsForLists(listIds);
  }

  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item> {
    return this.items.updateItem(itemId, updates);
  }

  async updateItemsBatch(updates: Array<{ id: string; updates: Partial<Item> }>): Promise<Item[]> {
    return this.items.updateItemsBatch(updates);
  }

  async deleteItem(itemId: string): Promise<void> {
    return this.items.deleteItem(itemId);
  }

  async saveItemsBatch(items: Item[]): Promise<void> {
    return this.items.saveItemsBatch(items);
  }

  async saveItemsBatchUpsert(items: Item[]): Promise<void> {
    return this.items.saveItemsBatchUpsert(items);
  }

  async deleteItemsBatch(itemIds: string[]): Promise<void> {
    return this.items.deleteItemsBatch(itemIds);
  }

  observeItemsForList(listId: string, callback: (items: Item[]) => void): () => void {
    return this.items.observeItemsForList(listId, callback);
  }

  // ===== SYNC QUEUE METHODS (delegated to SyncQueueStorage) =====

  async addToSyncQueue(operation: QueuedOperation): Promise<void> {
    return this.syncQueue.addToSyncQueue(operation);
  }

  async getSyncQueue(): Promise<QueuedOperation[]> {
    return this.syncQueue.getSyncQueue();
  }

  async removeFromSyncQueue(operationId: string): Promise<void> {
    return this.syncQueue.removeFromSyncQueue(operationId);
  }

  async updateSyncQueueOperation(operationId: string, updates: Partial<QueuedOperation>): Promise<void> {
    return this.syncQueue.updateSyncQueueOperation(operationId, updates);
  }

  async clearSyncQueue(): Promise<void> {
    return this.syncQueue.clearSyncQueue();
  }

  async markSyncedIfUnchanged(entityType: 'list' | 'item' | 'storeLayout', entityId: string, expectedUpdatedAt: number | null): Promise<void> {
    return this.syncQueue.markSyncedIfUnchanged(entityType, entityId, expectedUpdatedAt);
  }

  // ===== URGENT ITEM METHODS (delegated to UrgentItemsStorage) =====

  async saveUrgentItem(urgentItem: UrgentItem): Promise<UrgentItem> {
    return this.urgentItems.saveUrgentItem(urgentItem);
  }

  async saveUrgentItemsBatch(urgentItems: UrgentItem[]): Promise<void> {
    return this.urgentItems.saveUrgentItemsBatch(urgentItems);
  }

  async getUrgentItem(itemId: string): Promise<UrgentItem | null> {
    return this.urgentItems.getUrgentItem(itemId);
  }

  async getActiveUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    return this.urgentItems.getActiveUrgentItems(familyGroupId);
  }

  async getResolvedUrgentItems(familyGroupId: string, startDate?: number, endDate?: number): Promise<UrgentItem[]> {
    return this.urgentItems.getResolvedUrgentItems(familyGroupId, startDate, endDate);
  }

  async getAllUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    return this.urgentItems.getAllUrgentItems(familyGroupId);
  }

  async updateUrgentItem(itemId: string, updates: Partial<UrgentItem>): Promise<UrgentItem> {
    return this.urgentItems.updateUrgentItem(itemId, updates);
  }

  async deleteUrgentItem(itemId: string): Promise<void> {
    return this.urgentItems.deleteUrgentItem(itemId);
  }

  observeActiveUrgentItems(familyGroupId: string, callback: (items: UrgentItem[]) => void): () => void {
    return this.urgentItems.observeActiveUrgentItems(familyGroupId, callback);
  }

  observeResolvedUrgentItems(familyGroupId: string, callback: (items: UrgentItem[]) => void): () => void {
    return this.urgentItems.observeResolvedUrgentItems(familyGroupId, callback);
  }

  // ===== TRANSACTION SUPPORT =====

  /**
   * Execute operations in a transaction
   * Implements Req 4.5
   */
  async executeTransaction(callback: () => Promise<void>): Promise<void> {
    await this.database.write(async () => {
      await callback();
    }, 'executeTransaction');
  }

  // ===== REAL-TIME OBSERVERS =====

  // ===== HELPER METHODS =====


  // ===== CATEGORY HISTORY METHODS =====

  /**
   * Save category history (create or update)
   */
  async saveCategoryHistory(categoryHistory: CategoryHistory): Promise<CategoryHistory> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');

      let historyRecord: CategoryHistoryModel | undefined;

      await this.database.write(async () => {
        try {
          historyRecord = await categoryHistoryCollection.find(categoryHistory.id);
          await historyRecord.update((record) => {
            record.usageCount = categoryHistory.usageCount;
            record.lastUsedAt = categoryHistory.lastUsedAt;
          });
        } catch {
          historyRecord = await categoryHistoryCollection.create((record) => {
            record._raw.id = categoryHistory.id;
            record.familyGroupId = categoryHistory.familyGroupId;
            record.itemNameNormalized = categoryHistory.itemNameNormalized;
            record.category = categoryHistory.category;
            record.usageCount = categoryHistory.usageCount;
            record.lastUsedAt = categoryHistory.lastUsedAt;
          });
        }
      }, 'saveCategoryHistory');

      if (!historyRecord) {
        throw new Error('Failed to create or update category history record');
      }

      return this.categoryHistoryModelToType(historyRecord);
    } catch (error: any) {
      throw new Error(`Failed to save category history: ${error.message}`);
    }
  }

  /**
   * Get category history for an item name
   */
  async getCategoryHistoryForItem(
    familyGroupId: string,
    itemNameNormalized: string
  ): Promise<CategoryHistory[]> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const records = await categoryHistoryCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('item_name_normalized', itemNameNormalized)
        )
        .fetch();

      return records.map((record) => this.categoryHistoryModelToType(record));
    } catch (error: any) {
      throw new Error(`Failed to get category history: ${error.message}`);
    }
  }

  /**
   * Update category history
   */
  async updateCategoryHistory(
    id: string,
    updates: Partial<Pick<CategoryHistory, 'usageCount' | 'lastUsedAt'>>
  ): Promise<void> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const record = await categoryHistoryCollection.find(id);
      await this.database.write(async () => {
        await record.update((r) => {
          if (updates.usageCount !== undefined) r.usageCount = updates.usageCount;
          if (updates.lastUsedAt !== undefined) r.lastUsedAt = updates.lastUsedAt;
        });
      }, 'updateCategoryHistory');
    } catch (error: any) {
      throw new Error(`Failed to update category history: ${error.message}`);
    }
  }

  /**
   * Delete category history record
   */
  async deleteCategoryHistory(id: string): Promise<void> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const record = await categoryHistoryCollection.find(id);
      await this.database.write(async () => {
        await record.markAsDeleted();
      }, 'deleteCategoryHistory');
    } catch (error: any) {
      throw new Error(`Failed to delete category history: ${error.message}`);
    }
  }

  /**
   * Batch upsert category history records in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveCategoryHistoryBatch(
    familyGroupId: string,
    entries: Array<{ itemHash: string; category: string; data: any }>
  ): Promise<void> {
    if (entries.length === 0) return;

    const collection = this.database.get<CategoryHistoryModel>('category_history');

    const existingRecords = await collection
      .query(Q.where('family_group_id', familyGroupId))
      .fetch();

    const existingMap = new Map<string, CategoryHistoryModel>();
    for (const record of existingRecords) {
      existingMap.set(`${record.itemNameNormalized}|${record.category}`, record);
    }

    const applyUpdate = (r: CategoryHistoryModel, data: any) => {
      r.usageCount = data.usageCount || 1;
      r.lastUsedAt = data.lastUsedAt ?? Date.now();
    };

    const applyCreate = (r: CategoryHistoryModel, itemNameNormalized: string, category: string, data: any) => {
      r._raw.id = uuidv4();
      r.familyGroupId = familyGroupId;
      r.itemNameNormalized = itemNameNormalized;
      r.category = category;
      r.usageCount = data.usageCount || 1;
      r.lastUsedAt = data.lastUsedAt ?? Date.now();
    };

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const { itemHash, category, data } of entries) {
        const itemNameNormalized = itemHash.replace(/_/g, '.');
        const key = `${itemNameNormalized}|${category}`;
        const existing = existingMap.get(key);

        if (existing) {
          ops.push(existing.prepareUpdate(r => applyUpdate(r as CategoryHistoryModel, data)));
        } else {
          ops.push(collection.prepareCreate(r => applyCreate(r, itemNameNormalized, category, data)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveCategoryHistoryBatch batch failed, falling back to individual writes');
        for (const { itemHash, category, data } of entries) {
          try {
            const itemNameNormalized = itemHash.replace(/_/g, '.');
            const freshRecords = await collection
              .query(
                Q.where('family_group_id', familyGroupId),
                Q.where('item_name_normalized', itemNameNormalized),
                Q.where('category', category)
              )
              .fetch();
            const rec = freshRecords[0];
            if (rec) {
              await rec.update(r => applyUpdate(r, data));
            } else {
              await collection.create(r => applyCreate(r, itemNameNormalized, category, data));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveCategoryHistoryBatch individual write failed for ${itemHash}`);
          }
        }
      }
    }, 'saveCategoryHistoryBatch');
  }

  private categoryHistoryModelToType(model: CategoryHistoryModel): CategoryHistory {
    return {
      id: model.id,
      familyGroupId: model.familyGroupId,
      itemNameNormalized: model.itemNameNormalized,
      category: model.category,
      usageCount: model.usageCount,
      lastUsedAt: model.lastUsedAt,
      createdAt: Number(model.createdAt),
    };
  }

  // ===== PRICE HISTORY METHODS =====

  /**
   * Save a single price history record (create only — ID-based upsert).
   * The find() inside the write() transaction prevents TOCTOU races between
   * concurrent batch loads (once('value')) and ongoing child_added events.
   */
  async savePriceHistoryRecord(record: PriceHistoryRecord): Promise<void> {
    const collection = this.database.get<PriceHistoryModel>('price_history');
    await this.database.write(async () => {
      try {
        await collection.find(record.id);
        return;
      } catch {
        await collection.create(r => {
          r._raw.id = record.id;
          r.itemName = record.itemName;
          r.itemNameNormalized = record.itemNameNormalized;
          r.price = record.price;
          r.storeName = record.storeName;
          r.listId = record.listId;
          r.recordedAt = record.recordedAt;
          r.familyGroupId = record.familyGroupId;
        });
      }
    }, 'savePriceHistoryRecord');
  }

  /**
   * Batch save price history records, skipping any that already exist.
   * Chunks ID lookups to stay under SQLite's SQLITE_MAX_VARIABLE_NUMBER (999).
   */
  async savePriceHistoryBatch(records: PriceHistoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    const collection = this.database.get<PriceHistoryModel>('price_history');
    const CHUNK = 500;

    const existingIds = new Set<string>();
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const found = await collection.query(Q.where('id', Q.oneOf(chunk.map(r => r.id)))).fetch();
      found.forEach(m => existingIds.add(m.id));
    }

    const toCreate = records.filter(r => !existingIds.has(r.id));
    if (toCreate.length === 0) return;

    const applyCreate = (r: PriceHistoryModel, record: PriceHistoryRecord) => {
      r._raw.id = record.id;
      r.itemName = record.itemName;
      r.itemNameNormalized = record.itemNameNormalized;
      r.price = record.price;
      r.storeName = record.storeName;
      r.listId = record.listId;
      r.recordedAt = record.recordedAt;
      r.familyGroupId = record.familyGroupId;
    };

    await this.database.write(async () => {
      const ops: any[] = toCreate.map(record =>
        collection.prepareCreate(r => applyCreate(r, record))
      );

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'savePriceHistoryBatch batch failed, falling back');
        for (const record of toCreate) {
          try {
            const exists = await collection.query(Q.where('id', record.id)).fetch();
            if (exists.length > 0) continue;
            await collection.create(r => applyCreate(r, record));
          } catch (e) {
            CrashReporting.recordError(e as Error, `savePriceHistoryBatch individual create failed for ${record.id}`);
          }
        }
      }
    }, 'savePriceHistoryBatch');
  }

  /**
   * Get all price history records for a specific item (normalized name).
   * Returns records ordered oldest-first for trend analysis.
   */
  async getPriceHistoryForItem(
    familyGroupId: string,
    itemNameNormalized: string
  ): Promise<PriceHistoryRecord[]> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('item_name_normalized', itemNameNormalized),
          Q.sortBy('recorded_at', Q.asc)
        )
        .fetch();

      return records.map(r => ({
        id: r.id,
        itemName: r.itemName,
        itemNameNormalized: r.itemNameNormalized,
        price: r.price,
        storeName: r.storeName,
        listId: r.listId,
        recordedAt: r.recordedAt,
        familyGroupId: r.familyGroupId,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get price history: ${error.message}`);
    }
  }

  async getLatestPriceHistoryTimestamp(familyGroupId: string): Promise<number | null> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(Q.where('family_group_id', familyGroupId), Q.sortBy('recorded_at', Q.desc), Q.take(1))
        .fetch();
      return records[0]?.recordedAt ?? null;
    } catch {
      return null;
    }
  }

  async getDistinctTrackedItems(
    familyGroupId: string
  ): Promise<Array<{ itemName: string; itemNameNormalized: string }>> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(Q.where('family_group_id', familyGroupId))
        .fetch();

      const itemMap = new Map<string, string>();
      for (const r of records) {
        if (!itemMap.has(r.itemNameNormalized)) {
          itemMap.set(r.itemNameNormalized, r.itemName);
        }
      }

      return Array.from(itemMap.entries())
        .map(([normalized, name]) => ({ itemName: name, itemNameNormalized: normalized }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
    } catch (error: any) {
      throw new Error(`Failed to get distinct tracked items: ${error.message}`);
    }
  }

  // ===== STORE LAYOUT METHODS =====

  async saveStoreLayout(layout: StoreLayout): Promise<StoreLayout> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      let record: StoreLayoutModel | undefined;

      await this.database.write(async () => {
        let existing: StoreLayoutModel | null = null;
        try {
          existing = await collection.find(layout.id);
        } catch {
          // Record does not exist yet
        }

        if (existing) {
          record = await existing.update((r) => {
            r.familyGroupId = layout.familyGroupId;
            r.storeName = layout.storeName;
            r.categoryOrder = JSON.stringify(layout.categoryOrder);
            r.createdBy = layout.createdBy;
            r.updatedAt = layout.updatedAt;
            r.syncStatus = layout.syncStatus;
          });
        } else {
          record = await collection.create((r) => {
            r._raw.id = layout.id;
            r.familyGroupId = layout.familyGroupId;
            r.storeName = layout.storeName;
            r.categoryOrder = JSON.stringify(layout.categoryOrder);
            r.createdBy = layout.createdBy;
            r.updatedAt = layout.updatedAt;
            r.syncStatus = layout.syncStatus;
          });
        }
      }, 'saveStoreLayout');

      if (!record) throw new Error('Failed to save store layout record');
      return this.storeLayoutModelToType(record);
    } catch (error: any) {
      throw new Error(`Failed to save store layout: ${error.message}`);
    }
  }

  async getStoreLayoutByStore(storeName: string, familyGroupId: string): Promise<StoreLayout | null> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const records = await collection
        .query(
          Q.where('store_name', storeName),
          Q.where('family_group_id', familyGroupId)
        )
        .fetch();

      if (records.length === 0) return null;
      return this.storeLayoutModelToType(records[0]);
    } catch {
      return null;
    }
  }

  async getStoreLayoutById(id: string): Promise<StoreLayout | null> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);
      return this.storeLayoutModelToType(record);
    } catch {
      return null;
    }
  }

  async updateStoreLayout(id: string, updates: Partial<StoreLayout>): Promise<StoreLayout> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);

      await this.database.write(async () => {
        await record.update((r) => {
          if (updates.categoryOrder !== undefined) r.categoryOrder = JSON.stringify(updates.categoryOrder);
          if (updates.updatedAt !== undefined) r.updatedAt = updates.updatedAt;
          if (updates.syncStatus !== undefined) r.syncStatus = updates.syncStatus;
        });
      }, 'updateStoreLayout');

      return this.storeLayoutModelToType(record);
    } catch (error: any) {
      throw new Error(`Failed to update store layout: ${error.message}`);
    }
  }

  /**
   * Batch upsert store layouts in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveStoreLayoutsBatch(
    familyGroupId: string,
    entries: Array<{ layoutId: string; data: any }>
  ): Promise<void> {
    if (entries.length === 0) return;

    const collection = this.database.get<StoreLayoutModel>('store_layouts');

    const existingRecords = await collection
      .query(Q.where('family_group_id', familyGroupId))
      .fetch();

    const existingMap = new Map<string, StoreLayoutModel>();
    for (const record of existingRecords) {
      existingMap.set(record.id, record);
    }

    const applyUpdate = (r: StoreLayoutModel, data: any) => {
      if (data.categoryOrder !== undefined) r.categoryOrder = JSON.stringify(data.categoryOrder);
      if (data.updatedAt !== undefined) r.updatedAt = data.updatedAt;
      r.syncStatus = 'synced';
    };

    const applyCreate = (r: StoreLayoutModel, layoutId: string, data: any) => {
      r._raw.id = layoutId;
      r.familyGroupId = data.familyGroupId || familyGroupId;
      r.storeName = data.storeName || '';
      r.categoryOrder = JSON.stringify(data.categoryOrder);
      r.createdBy = data.createdBy || '';
      r.updatedAt = data.updatedAt ?? Date.now();
      r.syncStatus = 'synced';
    };

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const { layoutId, data } of entries) {
        const existing = existingMap.get(layoutId);
        if (existing) {
          ops.push(existing.prepareUpdate(r => applyUpdate(r as StoreLayoutModel, data)));
        } else {
          ops.push(collection.prepareCreate(r => applyCreate(r, layoutId, data)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveStoreLayoutsBatch batch failed, falling back to individual writes');
        for (const { layoutId, data } of entries) {
          try {
            const records = await collection.query(Q.where('id', layoutId)).fetch();
            const rec = records[0];
            if (rec) {
              await rec.update(r => applyUpdate(r, data));
            } else {
              await collection.create(r => applyCreate(r, layoutId, data));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveStoreLayoutsBatch individual write failed for ${layoutId}`);
          }
        }
      }
    }, 'saveStoreLayoutsBatch');
  }

  async deleteStoreLayout(id: string): Promise<void> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);
      await this.database.write(async () => {
        await record.destroyPermanently();
      }, 'deleteStoreLayout');
    } catch (error: any) {
      throw new Error(`Failed to delete store layout: ${error.message}`);
    }
  }

  private storeLayoutModelToType(model: StoreLayoutModel): StoreLayout {
    return {
      id: model.id,
      familyGroupId: model.familyGroupId,
      storeName: model.storeName,
      categoryOrder: safeJsonParse<CategoryType[]>(model.categoryOrder, []),
      createdBy: model.createdBy,
      createdAt: Number(model.createdAt), // @date decorator returns Date object; must convert
      updatedAt: model.updatedAt,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }

  /**
   * Clear ALL local WatermelonDB data
   * WARNING: This is irreversible! Used for account deletion.
   */
  async clearAllData(): Promise<void> {
    try {
      await this.database.write(async () => {
        const lists = await this.database.collections.get('shopping_lists').query().fetch();
        const items = await this.database.collections.get('items').query().fetch();
        const syncQueue = await this.database.collections.get('sync_queue').query().fetch();
        const priceHistory = await this.database.collections.get('price_history').query().fetch();
        const urgentItems = await this.database.collections.get('urgent_items').query().fetch();
        const categoryHistory = await this.database.collections.get('category_history').query().fetch();
        const storeLayouts = await this.database.collections.get('store_layouts').query().fetch();
        const itemPreferences = await this.database.collections.get('item_preferences').query().fetch();

        const ops = [
          ...lists.map((r: any) => r.prepareMarkAsDeleted()),
          ...items.map((r: any) => r.prepareMarkAsDeleted()),
          ...syncQueue.map((r: any) => r.prepareMarkAsDeleted()),
          ...priceHistory.map((r: any) => r.prepareMarkAsDeleted()),
          ...urgentItems.map((r: any) => r.prepareMarkAsDeleted()),
          ...categoryHistory.map((r: any) => r.prepareMarkAsDeleted()),
          ...storeLayouts.map((r: any) => r.prepareMarkAsDeleted()),
          ...itemPreferences.map((r: any) => r.prepareMarkAsDeleted()),
        ];
        if (ops.length > 0) {
          await this.database.batch(ops);
        }
      }, 'clearAllData');
    } catch (error: any) {
      throw new Error(`Failed to clear local data: ${error.message}`);
    }
  }

}

export default new LocalStorageManager();

import { Database, Q } from '@nozbe/watermelondb';
import { ShoppingList, Item, QueuedOperation, ReceiptData, UrgentItem, CategoryHistory, PriceHistoryRecord, StoreLayout } from '../models/types';
import { safeJsonParse } from '../utils/safeJsonParse';
import { CategoryType } from './CategoryService';
import CrashReporting from './CrashReporting';
import StoreLayoutModel from '../database/models/StoreLayout';
import { createDatabase } from './storage/database';
import { ListsStorage } from './storage/lists';
import { ItemsStorage } from './storage/items';
import { SyncQueueStorage } from './storage/syncQueue';
import { UrgentItemsStorage } from './storage/urgentItems';
import { HistoryStorage } from './storage/history';

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
  private history: HistoryStorage;

  constructor() {
    this.database = createDatabase();
    this.lists = new ListsStorage(this.database);
    this.items = new ItemsStorage(this.database);
    this.syncQueue = new SyncQueueStorage(this.database);
    this.urgentItems = new UrgentItemsStorage(this.database);
    this.history = new HistoryStorage(this.database);
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

  // ===== CATEGORY + PRICE HISTORY METHODS (delegated to HistoryStorage) =====

  async saveCategoryHistory(categoryHistory: CategoryHistory): Promise<CategoryHistory> {
    return this.history.saveCategoryHistory(categoryHistory);
  }

  async getCategoryHistoryForItem(familyGroupId: string, itemNameNormalized: string): Promise<CategoryHistory[]> {
    return this.history.getCategoryHistoryForItem(familyGroupId, itemNameNormalized);
  }

  async updateCategoryHistory(id: string, updates: Partial<Pick<CategoryHistory, 'usageCount' | 'lastUsedAt'>>): Promise<void> {
    return this.history.updateCategoryHistory(id, updates);
  }

  async deleteCategoryHistory(id: string): Promise<void> {
    return this.history.deleteCategoryHistory(id);
  }

  async saveCategoryHistoryBatch(familyGroupId: string, entries: Array<{ itemHash: string; category: string; data: any }>): Promise<void> {
    return this.history.saveCategoryHistoryBatch(familyGroupId, entries);
  }

  async savePriceHistoryRecord(record: PriceHistoryRecord): Promise<void> {
    return this.history.savePriceHistoryRecord(record);
  }

  async savePriceHistoryBatch(records: PriceHistoryRecord[]): Promise<void> {
    return this.history.savePriceHistoryBatch(records);
  }

  async getPriceHistoryForItem(familyGroupId: string, itemNameNormalized: string): Promise<PriceHistoryRecord[]> {
    return this.history.getPriceHistoryForItem(familyGroupId, itemNameNormalized);
  }

  async getLatestPriceHistoryTimestamp(familyGroupId: string): Promise<number | null> {
    return this.history.getLatestPriceHistoryTimestamp(familyGroupId);
  }

  async getDistinctTrackedItems(familyGroupId: string): Promise<Array<{ itemName: string; itemNameNormalized: string }>> {
    return this.history.getDistinctTrackedItems(familyGroupId);
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

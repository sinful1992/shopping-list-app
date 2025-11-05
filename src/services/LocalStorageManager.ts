import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { ShoppingList, Item, QueuedOperation, ReceiptData, ExpenditureSummary } from '../models/types';
import { schema } from '../database/schema';
import { ShoppingListModel } from '../database/models/ShoppingList';
import { ItemModel } from '../database/models/Item';
import { SyncQueueModel } from '../database/models/SyncQueue';

/**
 * LocalStorageManager
 * Persists data locally using WatermelonDB for offline access
 * Implements Requirements: 4.4, 9.2, 9.3, 9.5
 */
class LocalStorageManager {
  private database: Database;

  constructor() {
    const adapter = new SQLiteAdapter({
      schema,
      jsi: true, // Use JSI for better performance
      onSetUpError: (error) => {
        console.error('Database setup error:', error);
      },
    });

    this.database = new Database({
      adapter,
      modelClasses: [ShoppingListModel, ItemModel, SyncQueueModel],
    });
  }

  // ===== SHOPPING LIST METHODS =====

  /**
   * Save shopping list (create or update)
   */
  async saveList(list: ShoppingList): Promise<ShoppingList> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');

      let listRecord;
      try {
        listRecord = await listsCollection.find(list.id);
        // Update existing
        await listRecord.update((record) => {
          record.name = list.name;
          record.status = list.status;
          record.completedAt = list.completedAt;
          record.receiptUrl = list.receiptUrl;
          record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
          record.syncStatus = list.syncStatus;
        });
      } catch {
        // Create new
        listRecord = await listsCollection.create((record) => {
          record._raw.id = list.id;
          record.name = list.name;
          record.familyGroupId = list.familyGroupId;
          record.createdBy = list.createdBy;
          record.createdAt = list.createdAt;
          record.status = list.status;
          record.completedAt = list.completedAt;
          record.receiptUrl = list.receiptUrl;
          record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
          record.syncStatus = list.syncStatus;
        });
      }

      return this.listModelToType(listRecord);
    } catch (error: any) {
      throw new Error(`Failed to save list: ${error.message}`);
    }
  }

  /**
   * Get shopping list by ID
   */
  async getList(listId: string): Promise<ShoppingList | null> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);
      return this.listModelToType(listRecord);
    } catch {
      return null;
    }
  }

  /**
   * Get all lists for family group
   */
  async getAllLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const lists = await listsCollection
        .query()
        .where('family_group_id', familyGroupId)
        .fetch();

      return lists.map((list) => this.listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get lists: ${error.message}`);
    }
  }

  /**
   * Get active lists
   * Implements Req 2.3
   */
  async getActiveLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const lists = await listsCollection
        .query()
        .where('family_group_id', familyGroupId)
        .where('status', 'active')
        .sortBy('created_at', 'desc')
        .fetch();

      return lists.map((list) => this.listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get active lists: ${error.message}`);
    }
  }

  /**
   * Get completed lists with optional date range
   * Implements Req 8.1
   */
  async getCompletedLists(
    familyGroupId: string,
    startDate?: number,
    endDate?: number
  ): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      let query = listsCollection
        .query()
        .where('family_group_id', familyGroupId)
        .where('status', 'completed');

      if (startDate) {
        query = query.where('completed_at', Q.gte(startDate));
      }
      if (endDate) {
        query = query.where('completed_at', Q.lte(endDate));
      }

      const lists = await query.sortBy('completed_at', 'desc').fetch();
      return lists.map((list) => this.listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get completed lists: ${error.message}`);
    }
  }

  /**
   * Update shopping list
   */
  async updateList(listId: string, updates: Partial<ShoppingList>): Promise<ShoppingList> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);

      await listRecord.update((record) => {
        if (updates.name !== undefined) record.name = updates.name;
        if (updates.status !== undefined) record.status = updates.status;
        if (updates.completedAt !== undefined) record.completedAt = updates.completedAt;
        if (updates.receiptUrl !== undefined) record.receiptUrl = updates.receiptUrl;
        if (updates.receiptData !== undefined) {
          record.receiptData = updates.receiptData ? JSON.stringify(updates.receiptData) : null;
        }
        if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
      });

      return this.listModelToType(listRecord);
    } catch (error: any) {
      throw new Error(`Failed to update list: ${error.message}`);
    }
  }

  /**
   * Delete shopping list
   */
  async deleteList(listId: string): Promise<void> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);
      await listRecord.markAsDeleted();
    } catch (error: any) {
      throw new Error(`Failed to delete list: ${error.message}`);
    }
  }

  // ===== ITEM METHODS =====

  /**
   * Save item (create or update)
   * Implements Req 9.2, 9.3
   */
  async saveItem(item: Item): Promise<Item> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');

      let itemRecord;
      try {
        itemRecord = await itemsCollection.find(item.id);
        // Update existing
        await itemRecord.update((record) => {
          record.name = item.name;
          record.quantity = item.quantity;
          record.checked = item.checked;
          record.updatedAt = item.updatedAt;
          record.syncStatus = item.syncStatus;
        });
      } catch {
        // Create new
        itemRecord = await itemsCollection.create((record) => {
          record._raw.id = item.id;
          record.listId = item.listId;
          record.name = item.name;
          record.quantity = item.quantity;
          record.checked = item.checked;
          record.createdBy = item.createdBy;
          record.createdAt = item.createdAt;
          record.updatedAt = item.updatedAt;
          record.syncStatus = item.syncStatus;
        });
      }

      return this.itemModelToType(itemRecord);
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
      return this.itemModelToType(itemRecord);
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
        .query()
        .where('list_id', listId)
        .sortBy('created_at', 'asc')
        .fetch();

      return items.map((item) => this.itemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get items: ${error.message}`);
    }
  }

  /**
   * Update item
   */
  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const itemRecord = await itemsCollection.find(itemId);

      await itemRecord.update((record) => {
        if (updates.name !== undefined) record.name = updates.name;
        if (updates.quantity !== undefined) record.quantity = updates.quantity;
        if (updates.checked !== undefined) record.checked = updates.checked;
        if (updates.updatedAt !== undefined) record.updatedAt = updates.updatedAt;
        if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
      });

      return this.itemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to update item: ${error.message}`);
    }
  }

  /**
   * Delete item
   */
  async deleteItem(itemId: string): Promise<void> {
    try {
      const itemsCollection = this.database.get<ItemModel>('items');
      const itemRecord = await itemsCollection.find(itemId);
      await itemRecord.markAsDeleted();
    } catch (error: any) {
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  // ===== SYNC QUEUE METHODS =====

  /**
   * Add operation to sync queue
   * Implements Req 9.5
   */
  async addToSyncQueue(operation: QueuedOperation): Promise<void> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueModel>('sync_queue');
      await syncQueueCollection.create((record) => {
        record._raw.id = operation.id;
        record.entityType = operation.entityType;
        record.entityId = operation.entityId;
        record.operation = operation.operation;
        record.data = JSON.stringify(operation.data);
        record.timestamp = operation.timestamp;
        record.retryCount = operation.retryCount;
      });
    } catch (error: any) {
      throw new Error(`Failed to add to sync queue: ${error.message}`);
    }
  }

  /**
   * Get all operations in sync queue
   */
  async getSyncQueue(): Promise<QueuedOperation[]> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueModel>('sync_queue');
      const operations = await syncQueueCollection.query().sortBy('timestamp', 'asc').fetch();

      return operations.map((op) => ({
        id: op.id,
        entityType: op.entityType as 'list' | 'item',
        entityId: op.entityId,
        operation: op.operation as 'create' | 'update' | 'delete',
        data: JSON.parse(op.data),
        timestamp: op.timestamp,
        retryCount: op.retryCount,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get sync queue: ${error.message}`);
    }
  }

  /**
   * Remove operation from sync queue
   */
  async removeFromSyncQueue(operationId: string): Promise<void> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueModel>('sync_queue');
      const operation = await syncQueueCollection.find(operationId);
      await operation.markAsDeleted();
    } catch (error: any) {
      throw new Error(`Failed to remove from sync queue: ${error.message}`);
    }
  }

  /**
   * Clear all operations from sync queue
   */
  async clearSyncQueue(): Promise<void> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueModel>('sync_queue');
      const operations = await syncQueueCollection.query().fetch();
      await this.database.write(async () => {
        await Promise.all(operations.map((op) => op.markAsDeleted()));
      });
    } catch (error: any) {
      throw new Error(`Failed to clear sync queue: ${error.message}`);
    }
  }

  // ===== RECEIPT DATA METHODS =====

  /**
   * Save receipt data to a list
   * Implements Req 6.4
   */
  async saveReceiptData(listId: string, receiptData: ReceiptData): Promise<void> {
    await this.updateList(listId, { receiptData });
  }

  /**
   * Get receipt data for a list
   */
  async getReceiptData(listId: string): Promise<ReceiptData | null> {
    const list = await this.getList(listId);
    return list?.receiptData || null;
  }

  // ===== EXPENDITURE QUERIES =====

  /**
   * Get total expenditure for date range
   * Implements Req 7.2
   */
  async getTotalExpenditureForDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<number> {
    const lists = await this.getCompletedLists(familyGroupId, startDate, endDate);
    let total = 0;

    for (const list of lists) {
      if (list.receiptData && list.receiptData.totalAmount) {
        total += list.receiptData.totalAmount;
      }
    }

    return total;
  }

  /**
   * Get lists with receipts in date range
   */
  async getListsWithReceiptsInDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]> {
    const lists = await this.getCompletedLists(familyGroupId, startDate, endDate);
    return lists.filter((list) => list.receiptUrl !== null);
  }

  // ===== TRANSACTION SUPPORT =====

  /**
   * Execute operations in a transaction
   * Implements Req 4.5
   */
  async executeTransaction(callback: () => Promise<void>): Promise<void> {
    await this.database.write(async () => {
      await callback();
    });
  }

  // ===== HELPER METHODS =====

  private listModelToType(model: ShoppingListModel): ShoppingList {
    return {
      id: model.id,
      name: model.name,
      familyGroupId: model.familyGroupId,
      createdBy: model.createdBy,
      createdAt: model.createdAt,
      status: model.status as 'active' | 'completed' | 'deleted',
      completedAt: model.completedAt,
      receiptUrl: model.receiptUrl,
      receiptData: model.receiptData ? JSON.parse(model.receiptData) : null,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }

  private itemModelToType(model: ItemModel): Item {
    return {
      id: model.id,
      listId: model.listId,
      name: model.name,
      quantity: model.quantity,
      checked: model.checked,
      createdBy: model.createdBy,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }
}

export default new LocalStorageManager();

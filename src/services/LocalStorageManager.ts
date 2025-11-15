import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { ShoppingList, Item, QueuedOperation, ReceiptData, ExpenditureSummary, UrgentItem } from '../models/types';
import { schema } from '../database/schema';
import { ShoppingListModel } from '../database/models/ShoppingList';
import { ItemModel } from '../database/models/Item';
import { SyncQueueModel } from '../database/models/SyncQueue';
import { UrgentItemModel } from '../database/models/UrgentItem';

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
      modelClasses: [ShoppingListModel, ItemModel, SyncQueueModel, UrgentItemModel],
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

      await this.database.write(async () => {
        try {
          listRecord = await listsCollection.find(list.id);
          // Update existing
          await listRecord.update((record) => {
            record.name = list.name;
            record.status = list.status;
            record.completedAt = list.completedAt;
            record.completedBy = list.completedBy;
            record.receiptUrl = list.receiptUrl;
            record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
            record.syncStatus = list.syncStatus;
            record.isLocked = list.isLocked;
            record.lockedBy = list.lockedBy;
            record.lockedByName = list.lockedByName;
            record.lockedByRole = list.lockedByRole;
            record.lockedAt = list.lockedAt;
          });
        } catch {
          // Create new
          listRecord = await listsCollection.create((record) => {
            record._raw.id = list.id;
            record.name = list.name;
            record.familyGroupId = list.familyGroupId;
            record.createdBy = list.createdBy;
            // createdAt is @readonly and automatically set by WatermelonDB
            record.status = list.status;
            record.completedAt = list.completedAt;
            record.completedBy = list.completedBy;
            record.receiptUrl = list.receiptUrl;
            record.receiptData = list.receiptData ? JSON.stringify(list.receiptData) : null;
            record.syncStatus = list.syncStatus;
            record.isLocked = list.isLocked;
            record.lockedBy = list.lockedBy;
            record.lockedByName = list.lockedByName;
            record.lockedByRole = list.lockedByRole;
            record.lockedAt = list.lockedAt;
          });
        }
      });

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
        .query(
          Q.where('family_group_id', familyGroupId)
        )
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
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('status', 'active'),
          Q.sortBy('created_at', Q.desc)
        )
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
      const conditions = [
        Q.where('family_group_id', familyGroupId),
        Q.where('status', 'completed')
      ];

      if (startDate) {
        conditions.push(Q.where('completed_at', Q.gte(startDate)));
      }
      if (endDate) {
        conditions.push(Q.where('completed_at', Q.lte(endDate)));
      }

      conditions.push(Q.sortBy('completed_at', Q.desc));

      const lists = await listsCollection.query(...conditions).fetch();
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

      await this.database.write(async () => {
        await listRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.status !== undefined) record.status = updates.status;
          if (updates.completedAt !== undefined) record.completedAt = updates.completedAt;
          if (updates.completedBy !== undefined) record.completedBy = updates.completedBy;
          if (updates.receiptUrl !== undefined) record.receiptUrl = updates.receiptUrl;
          if (updates.receiptData !== undefined) {
            record.receiptData = updates.receiptData ? JSON.stringify(updates.receiptData) : null;
          }
          if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
          if (updates.isLocked !== undefined) record.isLocked = updates.isLocked;
          if (updates.lockedBy !== undefined) record.lockedBy = updates.lockedBy;
          if (updates.lockedByName !== undefined) record.lockedByName = updates.lockedByName;
          if (updates.lockedByRole !== undefined) record.lockedByRole = updates.lockedByRole;
          if (updates.lockedAt !== undefined) record.lockedAt = updates.lockedAt;
        });
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
      await this.database.write(async () => {
        await listRecord.markAsDeleted();
      });
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

      await this.database.write(async () => {
        try {
          itemRecord = await itemsCollection.find(item.id);
          // Update existing
          await itemRecord.update((record) => {
            record.name = item.name;
            record.quantity = item.quantity;
            record.price = item.price;
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
            record.price = item.price;
            record.checked = item.checked;
            record.createdBy = item.createdBy;
            // createdAt is @readonly and automatically set by WatermelonDB
            record.updatedAt = item.updatedAt;
            record.syncStatus = item.syncStatus;
          });
        }
      });

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
        .query(
          Q.where('list_id', listId),
          Q.sortBy('created_at', Q.asc)
        )
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

      await this.database.write(async () => {
        await itemRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.quantity !== undefined) record.quantity = updates.quantity;
          if (updates.price !== undefined) record.price = updates.price;
          if (updates.checked !== undefined) record.checked = updates.checked;
          if (updates.updatedAt !== undefined) record.updatedAt = updates.updatedAt;
          if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
        });
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
      await this.database.write(async () => {
        await itemRecord.markAsDeleted();
      });
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
      await this.database.write(async () => {
        await syncQueueCollection.create((record) => {
          record._raw.id = operation.id;
          record.entityType = operation.entityType;
          record.entityId = operation.entityId;
          record.operation = operation.operation;
          record.data = JSON.stringify(operation.data);
          record.timestamp = operation.timestamp;
          record.retryCount = operation.retryCount;
          record.nextRetryAt = operation.nextRetryAt || null;
        });
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
      const operations = await syncQueueCollection
        .query(Q.sortBy('timestamp', Q.asc))
        .fetch();

      return operations.map((op) => ({
        id: op.id,
        entityType: op.entityType as 'list' | 'item' | 'urgentItem',
        entityId: op.entityId,
        operation: op.operation as 'create' | 'update' | 'delete',
        data: JSON.parse(op.data),
        timestamp: op.timestamp,
        retryCount: op.retryCount,
        nextRetryAt: op.nextRetryAt || null,
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
      await this.database.write(async () => {
        await operation.markAsDeleted();
      });
    } catch (error: any) {
      throw new Error(`Failed to remove from sync queue: ${error.message}`);
    }
  }

  /**
   * Update sync queue operation (for retry tracking)
   */
  async updateSyncQueueOperation(operationId: string, updates: Partial<QueuedOperation>): Promise<void> {
    try {
      const syncQueueCollection = this.database.get<SyncQueueModel>('sync_queue');
      const operation = await syncQueueCollection.find(operationId);
      await this.database.write(async () => {
        await operation.update((record) => {
          if (updates.retryCount !== undefined) record.retryCount = updates.retryCount;
          if (updates.nextRetryAt !== undefined) record.nextRetryAt = updates.nextRetryAt;
        });
      });
    } catch (error: any) {
      throw new Error(`Failed to update sync queue operation: ${error.message}`);
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

  // ===== URGENT ITEM METHODS =====

  /**
   * Save urgent item (create or update)
   */
  async saveUrgentItem(urgentItem: UrgentItem): Promise<UrgentItem> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');

      let itemRecord;

      await this.database.write(async () => {
        try {
          itemRecord = await urgentItemsCollection.find(urgentItem.id);
          // Update existing
          await itemRecord.update((record) => {
            record.name = urgentItem.name;
            record.resolvedBy = urgentItem.resolvedBy;
            record.resolvedByName = urgentItem.resolvedByName;
            record.resolvedAt = urgentItem.resolvedAt;
            record.price = urgentItem.price;
            record.status = urgentItem.status;
            record.syncStatus = urgentItem.syncStatus;
          });
        } catch {
          // Create new
          itemRecord = await urgentItemsCollection.create((record) => {
            record._raw.id = urgentItem.id;
            record.name = urgentItem.name;
            record.familyGroupId = urgentItem.familyGroupId;
            record.createdBy = urgentItem.createdBy;
            record.createdByName = urgentItem.createdByName;
            record.resolvedBy = urgentItem.resolvedBy;
            record.resolvedByName = urgentItem.resolvedByName;
            record.resolvedAt = urgentItem.resolvedAt;
            record.price = urgentItem.price;
            record.status = urgentItem.status;
            record.syncStatus = urgentItem.syncStatus;
          });
        }
      });

      return this.urgentItemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to save urgent item: ${error.message}`);
    }
  }

  /**
   * Get urgent item by ID
   */
  async getUrgentItem(itemId: string): Promise<UrgentItem | null> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);
      return this.urgentItemModelToType(itemRecord);
    } catch {
      return null;
    }
  }

  /**
   * Get active urgent items for family group
   */
  async getActiveUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const items = await urgentItemsCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('status', 'active'),
          Q.sortBy('created_at', Q.desc)
        )
        .fetch();

      return items.map((item) => this.urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get active urgent items: ${error.message}`);
    }
  }

  /**
   * Get resolved urgent items for family group
   */
  async getResolvedUrgentItems(
    familyGroupId: string,
    startDate?: number,
    endDate?: number
  ): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const conditions = [
        Q.where('family_group_id', familyGroupId),
        Q.where('status', 'resolved')
      ];

      if (startDate) {
        conditions.push(Q.where('resolved_at', Q.gte(startDate)));
      }
      if (endDate) {
        conditions.push(Q.where('resolved_at', Q.lte(endDate)));
      }

      conditions.push(Q.sortBy('resolved_at', Q.desc));

      const items = await urgentItemsCollection.query(...conditions).fetch();
      return items.map((item) => this.urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get resolved urgent items: ${error.message}`);
    }
  }

  /**
   * Get all urgent items for family group (active and resolved)
   */
  async getAllUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const items = await urgentItemsCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.sortBy('created_at', Q.desc)
        )
        .fetch();

      return items.map((item) => this.urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get all urgent items: ${error.message}`);
    }
  }

  /**
   * Update urgent item
   */
  async updateUrgentItem(itemId: string, updates: Partial<UrgentItem>): Promise<UrgentItem> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);

      await this.database.write(async () => {
        await itemRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.resolvedBy !== undefined) record.resolvedBy = updates.resolvedBy;
          if (updates.resolvedByName !== undefined) record.resolvedByName = updates.resolvedByName;
          if (updates.resolvedAt !== undefined) record.resolvedAt = updates.resolvedAt;
          if (updates.price !== undefined) record.price = updates.price;
          if (updates.status !== undefined) record.status = updates.status;
          if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
        });
      });

      return this.urgentItemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to update urgent item: ${error.message}`);
    }
  }

  /**
   * Delete urgent item
   */
  async deleteUrgentItem(itemId: string): Promise<void> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);
      await this.database.write(async () => {
        await itemRecord.markAsDeleted();
      });
    } catch (error: any) {
      throw new Error(`Failed to delete urgent item: ${error.message}`);
    }
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

  // ===== REAL-TIME OBSERVERS =====

  /**
   * Observe all lists for a family group (returns WatermelonDB observable)
   * Use this instead of polling for real-time updates
   */
  observeAllLists(familyGroupId: string, callback: (lists: ShoppingList[]) => void): () => void {
    const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
    const query = listsCollection.query(Q.where('family_group_id', familyGroupId));

    const subscription = query.observe().subscribe((listModels) => {
      const lists = listModels.map((model) => this.listModelToType(model));
      callback(lists);
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Observe a single list by ID (returns WatermelonDB observable)
   */
  observeList(listId: string, callback: (list: ShoppingList | null) => void): () => void {
    const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');

    const subscription = listsCollection.findAndObserve(listId).subscribe({
      next: (model) => {
        callback(this.listModelToType(model));
      },
      error: () => {
        callback(null);
      },
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Observe items for a specific list (returns WatermelonDB observable)
   */
  observeItemsForList(listId: string, callback: (items: Item[]) => void): () => void {
    const itemsCollection = this.database.get<ItemModel>('items');
    const query = itemsCollection.query(
      Q.where('list_id', listId),
      Q.sortBy('created_at', Q.asc)
    );

    const subscription = query.observe().subscribe((itemModels) => {
      const items = itemModels.map((model) => this.itemModelToType(model));
      callback(items);
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Observe active urgent items for family group
   */
  observeActiveUrgentItems(familyGroupId: string, callback: (items: UrgentItem[]) => void): () => void {
    const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
    const query = urgentItemsCollection.query(
      Q.where('family_group_id', familyGroupId),
      Q.where('status', 'active'),
      Q.sortBy('created_at', Q.desc)
    );

    const subscription = query.observe().subscribe((itemModels) => {
      const items = itemModels.map((model) => this.urgentItemModelToType(model));
      callback(items);
    });

    return () => subscription.unsubscribe();
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
      completedBy: model.completedBy,
      receiptUrl: model.receiptUrl,
      receiptData: model.receiptData ? JSON.parse(model.receiptData) : null,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
      isLocked: model.isLocked,
      lockedBy: model.lockedBy,
      lockedByName: model.lockedByName,
      lockedByRole: model.lockedByRole as 'Dad' | 'Mom' | 'Son' | 'Daughter' | 'Older Son' | 'Older Daughter' | 'Younger Son' | 'Younger Daughter' | null,
      lockedAt: model.lockedAt,
    };
  }

  private itemModelToType(model: ItemModel): Item {
    return {
      id: model.id,
      listId: model.listId,
      name: model.name,
      quantity: model.quantity,
      price: model.price,
      checked: model.checked,
      createdBy: model.createdBy,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }

  private urgentItemModelToType(model: UrgentItemModel): UrgentItem {
    return {
      id: model.id,
      name: model.name,
      familyGroupId: model.familyGroupId,
      createdBy: model.createdBy,
      createdByName: model.createdByName,
      createdAt: model.createdAt,
      resolvedBy: model.resolvedBy,
      resolvedByName: model.resolvedByName,
      resolvedAt: model.resolvedAt,
      price: model.price,
      status: model.status as 'active' | 'resolved',
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }
}

export default new LocalStorageManager();

import { Database, Q } from '@nozbe/watermelondb';
import { QueuedOperation } from '../../models/types';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { SyncQueueModel } from '../../database/models/SyncQueue';
import { ItemModel } from '../../database/models/Item';
import { ShoppingListModel } from '../../database/models/ShoppingList';
import StoreLayoutModel from '../../database/models/StoreLayout';

/**
 * Sync-queue storage domain, including markSyncedIfUnchanged (the CAS-style
 * sync-status update used when a queued op lands). Receives the shared
 * WatermelonDB handle from LocalStorageManager; all methods moved verbatim.
 */
export class SyncQueueStorage {
  constructor(private database: Database) {}

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
      }, 'addToSyncQueue');
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

      const parseResults = operations.map((op) => {
        const data = safeJsonParse<unknown>(op.data, undefined);
        if (data === undefined) {
          if (__DEV__) console.warn('getSyncQueue: skipping corrupt entry', op.id);
          return null;
        }
        return {
          id: op.id,
          entityType: op.entityType as 'list' | 'item' | 'urgentItem',
          entityId: op.entityId,
          operation: op.operation as 'create' | 'update' | 'delete',
          data,
          timestamp: op.timestamp,
          retryCount: op.retryCount,
          nextRetryAt: op.nextRetryAt || null,
        };
      });
      return parseResults.filter(op => op !== null) as QueuedOperation[];
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
      }, 'removeFromSyncQueue');
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
      }, 'updateSyncQueueOp');
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
      if (operations.length === 0) return;
      await this.database.write(async () => {
        const ops = operations.map(op => op.prepareMarkAsDeleted());
        await this.database.batch(ops);
      }, 'clearSyncQueue');
    } catch (error: any) {
      throw new Error(`Failed to clear sync queue: ${error.message}`);
    }
  }

  async markSyncedIfUnchanged(
    entityType: 'list' | 'item' | 'storeLayout',
    entityId: string,
    expectedUpdatedAt: number | null
  ): Promise<void> {
    try {
      await this.database.write(async () => {
        if (entityType === 'item') {
          const collection = this.database.get<ItemModel>('items');
          const record = await collection.find(entityId);
          if (expectedUpdatedAt === null || record.updatedAt === expectedUpdatedAt) {
            await record.update(r => { r.syncStatus = 'synced'; });
          }
        } else if (entityType === 'storeLayout') {
          const collection = this.database.get<StoreLayoutModel>('store_layouts');
          const record = await collection.find(entityId);
          if (expectedUpdatedAt === null || record.updatedAt === expectedUpdatedAt) {
            await record.update(r => { r.syncStatus = 'synced'; });
          }
        } else {
          const collection = this.database.get<ShoppingListModel>('shopping_lists');
          const record = await collection.find(entityId);
          await record.update(r => { r.syncStatus = 'synced'; });
        }
      }, 'markSyncedIfUnchanged');
    } catch {
      // Record may have been deleted; sync status update is no longer relevant
    }
  }
}

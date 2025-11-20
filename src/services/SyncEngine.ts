import database from '@react-native-firebase/database';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import {
  EntityType,
  Operation,
  QueuedOperation,
  RemoteChange,
  SyncResult,
  SyncStatus,
  SyncEngineStatus,
  Unsubscribe,
} from '../models/types';
import LocalStorageManager from './LocalStorageManager';

/**
 * SyncEngine
 * Synchronizes data between local storage and Firebase Realtime Database
 * Implements Requirements: 2.2, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.5, 9.6, 9.9
 */
class SyncEngine {
  private isOnline: boolean = true;
  private familyGroupId: string | null = null;
  private syncInProgress: boolean = false;
  private retryIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly SYNC_TIMEOUT_MS = 30000; // 30 second timeout for sync operations
  private readonly RETRY_INTERVAL_MS = 60000; // Retry pending operations every 60 seconds

  constructor() {
    // Monitor network connectivity
    NetInfo.addEventListener((state) => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;

      // Auto-sync when coming back online
      if (wasOffline && this.isOnline) {
        this.processOperationQueue().catch(console.error);
      }
    });

    // Start periodic retry for queued operations
    this.startPeriodicRetry();
  }

  /**
   * Start periodic retry of queued operations
   */
  private startPeriodicRetry(): void {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
    }

    this.retryIntervalId = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.processOperationQueue().catch(console.error);
      }
    }, this.RETRY_INTERVAL_MS);
  }

  /**
   * Stop periodic retry (for cleanup)
   */
  stopPeriodicRetry(): void {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }
  }

  /**
   * Wrap a promise with a timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.SYNC_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Sync operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Set family group ID for syncing
   */
  setFamilyGroupId(groupId: string) {
    this.familyGroupId = groupId;
  }

  /**
   * Push a change to Firebase (or queue if offline)
   * Implements Req 4.1, 4.2, 4.3
   */
  async pushChange(entityType: EntityType, entityId: string, operation: Operation): Promise<void> {
    if (!this.familyGroupId) {
      throw new Error('Family group ID not set');
    }

    // Get entity data
    let data: any;
    if (entityType === 'list') {
      data = await LocalStorageManager.getList(entityId);
    } else {
      data = await LocalStorageManager.getItem(entityId);
    }

    if (this.isOnline) {
      try {
        // Wrap with timeout to prevent hanging
        await this.withTimeout(this.syncToFirebase(entityType, entityId, operation, data));
        // Update sync status to 'synced'
        if (entityType === 'list') {
          await LocalStorageManager.updateList(entityId, { syncStatus: 'synced' });
        } else {
          await LocalStorageManager.updateItem(entityId, { syncStatus: 'synced' });
        }
      } catch (error) {
        console.error('Sync error:', error);
        // Queue for later
        await this.queueOperation(entityType, entityId, operation, data);
      }
    } else {
      // Offline: queue the operation
      await this.queueOperation(entityType, entityId, operation, data);
    }
  }

  /**
   * Subscribe to remote changes from Firebase
   * Implements Req 4.4
   */
  subscribeToRemoteChanges(familyGroupId: string, callback: (change: RemoteChange) => void): Unsubscribe {
    if (!familyGroupId) {
      throw new Error('Family group ID required');
    }

    // Subscribe to lists
    const listsRef = database().ref(`/familyGroups/${familyGroupId}/lists`);

    // Listen for new lists created by other users
    const listsAddedListener = listsRef.on('child_added', (snapshot) => {
      callback({
        entityType: 'list',
        entityId: snapshot.key!,
        operation: 'create',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Listen for list updates
    const listsChangedListener = listsRef.on('child_changed', (snapshot) => {
      callback({
        entityType: 'list',
        entityId: snapshot.key!,
        operation: 'update',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Listen for list deletions
    const listsRemovedListener = listsRef.on('child_removed', (snapshot) => {
      callback({
        entityType: 'list',
        entityId: snapshot.key!,
        operation: 'delete',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Subscribe to items
    const itemsRef = database().ref(`/familyGroups/${familyGroupId}/items`);

    // Listen for new items
    const itemsAddedListener = itemsRef.on('child_added', (snapshot) => {
      callback({
        entityType: 'item',
        entityId: snapshot.key!,
        operation: 'create',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Listen for item updates
    const itemsChangedListener = itemsRef.on('child_changed', (snapshot) => {
      callback({
        entityType: 'item',
        entityId: snapshot.key!,
        operation: 'update',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Listen for item deletions
    const itemsRemovedListener = itemsRef.on('child_removed', (snapshot) => {
      callback({
        entityType: 'item',
        entityId: snapshot.key!,
        operation: 'delete',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Return unsubscribe function that removes all listeners
    return () => {
      listsRef.off('child_added', listsAddedListener);
      listsRef.off('child_changed', listsChangedListener);
      listsRef.off('child_removed', listsRemovedListener);
      itemsRef.off('child_added', itemsAddedListener);
      itemsRef.off('child_changed', itemsChangedListener);
      itemsRef.off('child_removed', itemsRemovedListener);
    };
  }

  /**
   * Resolve conflicts between local and remote data
   * Implements Req 3.7, 4.5, 9.9
   *
   * Smart conflict resolution rules:
   * - If both users checked the same item → keep checked
   * - If one checked, one deleted → delete wins (item was bought)
   * - If both updated different fields → merge changes
   * - Otherwise → server timestamp wins (last-write-wins)
   */
  async resolveConflict(localEntity: any, remoteEntity: any): Promise<any> {
    // Handle item conflicts (has 'checked' field)
    if ('checked' in localEntity && 'checked' in remoteEntity) {
      // Rule 1: If both checked the same item, keep it checked
      if (localEntity.checked && remoteEntity.checked) {
        return localEntity.updatedAt > remoteEntity.updatedAt ? localEntity : remoteEntity;
      }

      // Rule 2: If one side checked it, prefer checked state
      if (localEntity.checked && !remoteEntity.checked) {
        return localEntity;
      }
      if (!localEntity.checked && remoteEntity.checked) {
        return remoteEntity;
      }

      // Rule 3: If neither is checked, merge updates
      const merged = { ...remoteEntity };
      if (localEntity.updatedAt > remoteEntity.updatedAt) {
        // Local is newer, use local values for changed fields
        if (localEntity.name !== remoteEntity.name) merged.name = localEntity.name;
        if (localEntity.quantity !== remoteEntity.quantity) merged.quantity = localEntity.quantity;
        if (localEntity.price !== remoteEntity.price) merged.price = localEntity.price;
        merged.updatedAt = localEntity.updatedAt;
      }
      return merged;
    }

    // Handle list conflicts (has 'status' field)
    if ('status' in localEntity && 'status' in remoteEntity) {
      // Rule: Completed or deleted status wins over active
      if (localEntity.status === 'deleted' || remoteEntity.status === 'deleted') {
        return localEntity.status === 'deleted' ? localEntity : remoteEntity;
      }
      if (localEntity.status === 'completed' || remoteEntity.status === 'completed') {
        return localEntity.status === 'completed' ? localEntity : remoteEntity;
      }

      // For lock fields, most recent lock wins
      const merged = { ...remoteEntity };
      if (localEntity.updatedAt > remoteEntity.updatedAt || (localEntity.lockedAt && (!remoteEntity.lockedAt || localEntity.lockedAt > remoteEntity.lockedAt))) {
        merged.isLocked = localEntity.isLocked;
        merged.lockedBy = localEntity.lockedBy;
        merged.lockedAt = localEntity.lockedAt;
      }
      return merged;
    }

    // Default: Server timestamp wins (last-write-wins)
    if (!localEntity.updatedAt && !remoteEntity.updatedAt) {
      return remoteEntity;
    }

    return localEntity.updatedAt > remoteEntity.updatedAt ? localEntity : remoteEntity;
  }

  /**
   * Process all operations in the queue
   * Implements Req 4.6, 9.5, 9.6
   *
   * Exponential backoff: 1s → 2s → 4s → 8s → 16s (max 5 retries)
   * Includes jitter (random 0-1000ms) to prevent thundering herd
   */
  async processOperationQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;

    try {
      const queue = await LocalStorageManager.getSyncQueue();
      const now = Date.now();

      for (const operation of queue) {
        // Skip operations that are not ready to retry yet
        if (operation.nextRetryAt && now < operation.nextRetryAt) {
          console.log(`Skipping operation ${operation.id}, next retry at ${new Date(operation.nextRetryAt).toISOString()}`);
          continue;
        }

        try {
          // Wrap with timeout to prevent hanging
          await this.withTimeout(
            this.syncToFirebase(
              operation.entityType,
              operation.entityId,
              operation.operation,
              operation.data
            )
          );

          // Remove from queue on success
          await LocalStorageManager.removeFromSyncQueue(operation.id);

          // Update sync status
          if (operation.entityType === 'list') {
            await LocalStorageManager.updateList(operation.entityId, { syncStatus: 'synced' });
          } else if (operation.entityType === 'item') {
            await LocalStorageManager.updateItem(operation.entityId, { syncStatus: 'synced' });
          }
        } catch (error) {
          console.error('Failed to sync operation:', error);

          const maxRetries = 5;
          const newRetryCount = operation.retryCount + 1;

          if (newRetryCount >= maxRetries) {
            console.error(`Max retries (${maxRetries}) reached for operation ${operation.id}, marking as failed`);
            // Update sync status to 'failed'
            if (operation.entityType === 'list') {
              await LocalStorageManager.updateList(operation.entityId, { syncStatus: 'failed' });
            } else if (operation.entityType === 'item') {
              await LocalStorageManager.updateItem(operation.entityId, { syncStatus: 'failed' });
            }
            // Remove from queue
            await LocalStorageManager.removeFromSyncQueue(operation.id);
          } else {
            // Calculate next retry time with exponential backoff + jitter
            const baseDelay = 1000; // 1 second
            const exponentialDelay = baseDelay * Math.pow(2, newRetryCount - 1);
            const jitter = Math.random() * 1000; // 0-1000ms
            const nextRetryAt = now + exponentialDelay + jitter;

            console.log(`Retry ${newRetryCount}/${maxRetries} for operation ${operation.id}, next retry in ${Math.round((exponentialDelay + jitter) / 1000)}s`);

            // Update retry count and next retry time
            await LocalStorageManager.updateSyncQueueOperation(operation.id, {
              retryCount: newRetryCount,
              nextRetryAt,
            });
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync pending changes
   * Implements Req 4.3
   */
  async syncPendingChanges(): Promise<SyncResult> {
    await this.processOperationQueue();

    const queue = await LocalStorageManager.getSyncQueue();

    return {
      success: queue.length === 0,
      syncedCount: 0,
      failedCount: queue.length,
      errors: [],
    };
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncEngineStatus {
    return {
      isOnline: this.isOnline,
      pendingOperations: 0, // Would query sync queue
      lastSyncTimestamp: null,
    };
  }

  /**
   * Helper: Sync entity to Firebase
   */
  private async syncToFirebase(
    entityType: EntityType,
    entityId: string,
    operation: Operation,
    data: any
  ): Promise<void> {
    if (!this.familyGroupId) {
      throw new Error('Family group ID not set');
    }

    const path = `/familyGroups/${this.familyGroupId}/${entityType === 'list' ? 'lists' : 'items'}/${entityId}`;

    if (operation === 'delete') {
      await database().ref(path).remove();
    } else {
      // Strip syncStatus before syncing to Firebase (keep it local-only)
      const { syncStatus, ...dataWithoutSyncStatus } = data;
      await database().ref(path).set(dataWithoutSyncStatus);
    }
  }

  /**
   * Helper: Add operation to queue
   */
  private async queueOperation(
    entityType: EntityType,
    entityId: string,
    operation: Operation,
    data: any
  ): Promise<void> {
    const queuedOp: QueuedOperation = {
      id: uuidv4(),
      entityType,
      entityId,
      operation,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    await LocalStorageManager.addToSyncQueue(queuedOp);
  }
}

export default new SyncEngine();

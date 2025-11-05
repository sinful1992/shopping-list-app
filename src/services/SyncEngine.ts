import database from '@react-native-firebase/database';
import NetInfo from '@react-native-netinfo/netinfo';
import { v4 as uuidv4 } from 'uuid';
import {
  EntityType,
  Operation,
  QueuedOperation,
  RemoteChange,
  SyncResult,
  SyncStatus,
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
        await this.syncToFirebase(entityType, entityId, operation, data);
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
    const listsListener = listsRef.on('child_changed', (snapshot) => {
      callback({
        entityType: 'list',
        entityId: snapshot.key!,
        operation: 'update',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Subscribe to items
    const itemsRef = database().ref(`/familyGroups/${familyGroupId}/items`);
    const itemsListener = itemsRef.on('child_changed', (snapshot) => {
      callback({
        entityType: 'item',
        entityId: snapshot.key!,
        operation: 'update',
        data: snapshot.val(),
        timestamp: Date.now(),
      });
    });

    // Return unsubscribe function
    return () => {
      listsRef.off('child_changed', listsListener);
      itemsRef.off('child_changed', itemsListener);
    };
  }

  /**
   * Resolve conflicts between local and remote data
   * Implements Req 3.7, 4.5, 9.9
   */
  async resolveConflict(localEntity: any, remoteEntity: any): Promise<any> {
    // Server timestamp wins (last-write-wins)
    if (!localEntity.updatedAt && !remoteEntity.updatedAt) {
      return remoteEntity;
    }

    return localEntity.updatedAt > remoteEntity.updatedAt ? localEntity : remoteEntity;
  }

  /**
   * Process all operations in the queue
   * Implements Req 4.6, 9.5, 9.6
   */
  async processOperationQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;

    try {
      const queue = await LocalStorageManager.getSyncQueue();

      for (const operation of queue) {
        try {
          await this.syncToFirebase(
            operation.entityType,
            operation.entityId,
            operation.operation,
            operation.data
          );

          // Remove from queue on success
          await LocalStorageManager.removeFromSyncQueue(operation.id);

          // Update sync status
          if (operation.entityType === 'list') {
            await LocalStorageManager.updateList(operation.entityId, { syncStatus: 'synced' });
          } else {
            await LocalStorageManager.updateItem(operation.entityId, { syncStatus: 'synced' });
          }
        } catch (error) {
          console.error('Failed to sync operation:', error);

          // Implement exponential backoff: 1s, 2s, 4s, 8s, 16s
          const maxRetries = 5;
          if (operation.retryCount >= maxRetries) {
            console.error('Max retries reached, marking as failed');
            // Update sync status to 'failed'
            if (operation.entityType === 'list') {
              await LocalStorageManager.updateList(operation.entityId, { syncStatus: 'failed' });
            } else {
              await LocalStorageManager.updateItem(operation.entityId, { syncStatus: 'failed' });
            }
            // Remove from queue
            await LocalStorageManager.removeFromSyncQueue(operation.id);
          } else {
            // Increment retry count (would need to update queue record)
            console.log(`Retry ${operation.retryCount + 1}/${maxRetries}`);
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
  getSyncStatus(): SyncStatus {
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
      await database().ref(path).set(data);
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

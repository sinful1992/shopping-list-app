import { getDatabase, ref, set, remove } from '@react-native-firebase/database';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import {
  EntityType,
  Operation,
  QueuedOperation,
  SyncResult,
  SyncEngineStatus,
  ShoppingList,
  Item,
  StoreLayout,
  Unsubscribe,
} from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import CrashReporting from './CrashReporting';

interface QueueProcessResult {
  processed: number;
  deferred: number;
  skipReason: null | 'offline' | 'busy';
}

/**
 * SyncEngine
 * Synchronizes data between local storage and Firebase Realtime Database
 * Implements Requirements: 2.2, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.5, 9.6, 9.9
 */
class SyncEngine {
  private isOnline: boolean = true;
  private familyGroupId: string | null = null;
  // Bumped on sign-out: work started for the old account must not queue or send afterwards
  private session = 0;
  // pushChange writes not yet settled: not in the queue yet, but not sent either
  private inFlight = 0;
  private inFlightWaiters: Array<() => void> = [];
  private syncInProgress: boolean = false;
  private retryIntervalId: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(status: SyncEngineStatus) => void>();
  private readonly SYNC_TIMEOUT_MS = 30000; // 30 second timeout for sync operations
  private readonly RETRY_INTERVAL_MS = 60000; // Retry pending operations every 60 seconds
  private readonly MAX_RETRIES = 5; // for errors that are not about the network
  private readonly MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

  constructor() {
    NetInfo.addEventListener((state) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      if (!wasOnline && this.isOnline) {
        this.processOperationQueue().catch(error => {
          CrashReporting.recordError(error as Error, 'SyncEngine auto-sync');
        });
      }
      if (wasOnline !== this.isOnline) {
        // Connectivity flipped — let subscribers re-render even though the
        // queue itself hasn't changed yet
        this.notifyStatus();
      }
    });
    // Periodic retry starts lazily in setFamilyGroupId — starting it here
    // made the interval tick pre-login and leak into every test that
    // transitively imported this singleton (jest "worker failed to exit").
  }

  /**
   * Subscribe to sync status changes (queue size / connectivity).
   * Fired after queue mutations and connectivity flips.
   */
  onStatusChange(callback: (status: SyncEngineStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatus(): void {
    if (this.statusListeners.size === 0) {
      return;
    }
    this.getSyncStatus()
      .then((status) => {
        this.statusListeners.forEach((callback) => callback(status));
      })
      .catch((error) => {
        CrashReporting.recordError(error as Error, 'SyncEngine notifyStatus');
      });
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
        this.processOperationQueue().catch(error => {
          CrashReporting.recordError(error as Error, 'SyncEngine periodic retry');
        });
      }
    }, this.RETRY_INTERVAL_MS);
  }

  /**
   * Stop periodic retry (for cleanup)
   * @internal test seam
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
   * Set family group ID for syncing (first real use — starts periodic retry)
   */
  setFamilyGroupId(groupId: string) {
    this.familyGroupId = groupId;
    this.startPeriodicRetry();
  }

  /**
   * Sign-out: forget the family, so a write still in flight can't be queued
   * after the local data is cleared and replayed into the next account's family.
   */
  resetForSignOut(): void {
    this.session++;
    this.familyGroupId = null;
    this.stopPeriodicRetry();
  }

  /**
   * Push a change to Firebase (or queue if offline)
   * Implements Req 4.1, 4.2, 4.3
   */
  async pushChange(
    entityType: EntityType,
    entityId: string,
    operation: Operation,
    data?: ShoppingList | Item | StoreLayout | null
  ): Promise<void> {
    if (!this.familyGroupId) {
      throw new Error('Family group ID not set');
    }
    const session = this.session;

    // Delete doesn't need data — syncToFirebase calls .remove()
    // For create/update: use provided data, fall back to DB read only if not provided
    let syncData: ShoppingList | Item | StoreLayout | null = data ?? null;
    if (operation !== 'delete' && syncData == null) {
      if (entityType === 'list') syncData = await LocalStorageManager.getList(entityId);
      else if (entityType === 'item') syncData = await LocalStorageManager.getItem(entityId);
      else if (entityType === 'storeLayout') syncData = await LocalStorageManager.getStoreLayoutById(entityId);
    }

    const updatedAt = syncData && 'updatedAt' in syncData ? syncData.updatedAt : null;
    if (session !== this.session) return;

    if (this.isOnline) {
      const write = this.syncToFirebase(entityType, entityId, operation, syncData);
      this.inFlight++;
      try {
        await this.withTimeout(write);
        if (session !== this.session) return;
        await LocalStorageManager.markSyncedIfUnchanged(entityType as 'list' | 'item' | 'storeLayout', entityId, updatedAt);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'SyncEngine.pushChange');
        if (session !== this.session) return;
        const queuedId = await this.queueOperation(entityType, entityId, operation, syncData);
        this.dropQueuedOperationOnLateWrite(queuedId, write, entityType, entityId, updatedAt);
      } finally {
        this.inFlight--;
        if (this.inFlight === 0) {
          this.inFlightWaiters.splice(0).forEach(resolve => resolve());
        }
      }
    } else {
      await this.queueOperation(entityType, entityId, operation, syncData);
    }
  }

  /**
   * Process all operations in the queue
   * Implements Req 4.6, 9.5, 9.6
   *
   * Exponential backoff: 1s → 2s → 4s → 8s → 16s (max 5 retries)
   * Includes jitter (random 0-1000ms) to prevent thundering herd
   */
  async processOperationQueue(): Promise<QueueProcessResult> {
    if (this.syncInProgress) {
      return { processed: 0, deferred: 0, skipReason: 'busy' };
    }
    if (!this.isOnline) {
      return { processed: 0, deferred: 0, skipReason: 'offline' };
    }

    this.syncInProgress = true;
    const session = this.session;
    let processed = 0;
    let deferred = 0;

    try {
      const queue = await LocalStorageManager.getSyncQueue();
      const now = Date.now();

      for (const operation of queue) {
        if (session !== this.session) break;
        if (operation.nextRetryAt && now < operation.nextRetryAt) {
          deferred++;
          continue;
        }

        if (await this.revivesDeletedList(operation)) {
          CrashReporting.log(`Dropped sync operation ${operation.id} (list/${operation.entityId} ${operation.operation}): list deleted on this phone`);
          await LocalStorageManager.removeFromSyncQueue(operation.id);
          continue;
        }

        try {
          await this.withTimeout(
            this.syncToFirebase(
              operation.entityType,
              operation.entityId,
              operation.operation,
              operation.data
            )
          );

          await LocalStorageManager.removeFromSyncQueue(operation.id);

          const queuedUpdatedAt = operation.data && 'updatedAt' in operation.data ? operation.data.updatedAt : null;
          await LocalStorageManager.markSyncedIfUnchanged(operation.entityType as 'list' | 'item' | 'storeLayout', operation.entityId, queuedUpdatedAt);
          processed++;
        } catch (error) {
          CrashReporting.recordError(error as Error, `SyncEngine.processOperationQueue operation ${operation.id}`);
          if (session !== this.session) break;

          const newRetryCount = operation.retryCount + 1;
          const refused = this.isRefusedByServer(error);

          // A network failure (shop Wi-Fi with no internet) keeps the change until it gets through
          if (refused || (!this.isNetworkError(error) && newRetryCount >= this.MAX_RETRIES)) {
            CrashReporting.log(
              `Dropped sync operation ${operation.id} (${operation.entityType}/${operation.entityId} ${operation.operation}) ` +
              `after ${newRetryCount} tries: ${refused ? 'refused by server' : 'max retries'}: ${this.errorText(error)}`
            );
            if (operation.entityType === 'list') {
              await LocalStorageManager.updateList(operation.entityId, { syncStatus: 'failed' });
            } else if (operation.entityType === 'item') {
              await LocalStorageManager.updateItem(operation.entityId, { syncStatus: 'failed' });
            } else if (operation.entityType === 'storeLayout') {
              await LocalStorageManager.updateStoreLayout(operation.entityId, { syncStatus: 'failed' });
            }
            await LocalStorageManager.removeFromSyncQueue(operation.id);
          } else {
            // Exponential backoff with jitter prevents thundering herd on server recovery
            const baseDelay = 1000;
            const exponentialDelay = Math.min(baseDelay * Math.pow(2, newRetryCount - 1), this.MAX_RETRY_DELAY_MS);
            const jitter = Math.random() * 1000;
            const nextRetryAt = now + exponentialDelay + jitter;

            await LocalStorageManager.updateSyncQueueOperation(operation.id, {
              retryCount: newRetryCount,
              nextRetryAt,
            });
            deferred++;
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }

    this.notifyStatus();
    return { processed, deferred, skipReason: null };
  }

  /**
   * Sync pending changes
   * Implements Req 4.3
   */
  async syncPendingChanges(): Promise<SyncResult> {
    const result = await this.processOperationQueue();

    if (result.skipReason === 'offline') {
      const queue = await LocalStorageManager.getSyncQueue();
      return {
        success: queue.length === 0,
        syncedCount: 0,
        failedCount: queue.length,
        errors: [],
      };
    }

    if (result.skipReason === 'busy') {
      return {
        success: false,
        syncedCount: 0,
        failedCount: null,
        errors: [],
      };
    }

    return {
      success: result.deferred === 0,
      syncedCount: result.processed,
      failedCount: result.deferred,
      errors: [],
    };
  }

  /** Changes being sent right now. A failed send joins the queue only after its timeout. */
  getInFlightCount(): number {
    return this.inFlight;
  }

  /** Resolves once no change is being sent. May wait as long as a send's timeout; callers cap it. */
  waitForInFlight(): Promise<void> {
    if (this.inFlight === 0) return Promise.resolve();
    return new Promise(resolve => this.inFlightWaiters.push(resolve));
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<SyncEngineStatus> {
    const queue = await LocalStorageManager.getSyncQueue();
    return {
      isOnline: this.isOnline,
      pendingOperations: queue.length,
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
    data: ShoppingList | Item | StoreLayout | null
  ): Promise<void> {
    if (!this.familyGroupId) {
      throw new Error('Family group ID not set');
    }

    const path =
      entityType === 'list'        ? `/familyGroups/${this.familyGroupId}/lists/${entityId}` :
      entityType === 'item'        ? `/familyGroups/${this.familyGroupId}/items/${entityId}` :
                                     `/familyGroups/${this.familyGroupId}/storeLayouts/${entityId}`;

    const db = getDatabase();
    if (operation === 'delete') {
      await remove(ref(db, path));
    } else {
      if (data == null) throw new Error(`syncToFirebase: null payload for ${operation} on ${entityType}/${entityId}`);
      // Strip syncStatus before syncing to Firebase (keep it local-only)
      const { syncStatus: _, ...dataWithoutSyncStatus } = data;
      await set(ref(db, path), dataWithoutSyncStatus);
    }
  }

  /**
   * A timed-out push isn't a cancelled push: the Firebase write stays in the
   * RTDB outbox and lands once connectivity returns (typically the moment the
   * screen unlocks). Without this the queued fallback outlives the write that
   * already succeeded, so the banner reports a pending change forever and the
   * queue replays the same payload.
   */
  private dropQueuedOperationOnLateWrite(
    queuedId: string,
    write: Promise<void>,
    entityType: EntityType,
    entityId: string,
    updatedAt: number | null
  ): void {
    write
      .then(async () => {
        try {
          await LocalStorageManager.removeFromSyncQueue(queuedId);
        } catch {
          // processOperationQueue drained it first — nothing left to drop
        }
        await LocalStorageManager.markSyncedIfUnchanged(entityType as 'list' | 'item' | 'storeLayout', entityId, updatedAt);
        this.notifyStatus();
      })
      .catch(() => {
        // The write really did fail; the queued operation stands
      });
  }

  /**
   * Whether a queued list write would bring back a list deleted since it was
   * queued. Retries are replayed out of order, so a write that timed out
   * before the delete (a quick scan's receipt, then Skip) could otherwise land
   * after it and turn the deleted list active again for the whole family.
   * A deleted list is never restored, so such a write is dropped.
   */
  private async revivesDeletedList(operation: QueuedOperation): Promise<boolean> {
    if (operation.entityType !== 'list' || operation.operation === 'delete') return false;
    if ((operation.data as ShoppingList | null)?.status === 'deleted') return false;
    const local = await LocalStorageManager.getList(operation.entityId);
    return local?.status === 'deleted';
  }

  /** Firebase refuses the write (rules or validation): sending it again can't succeed. */
  private isRefusedByServer(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code ?? '';
    const message = this.errorText(error);
    return code === 'database/permission-denied' || /permission[-_ ]denied/i.test(message);
  }

  /** The write did not reach Firebase: a timeout, or no connection. */
  private isNetworkError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code ?? '';
    const message = this.errorText(error);
    return /^database\/(network-error|disconnected|unavailable)$/.test(code) ||
      /timed out|network|disconnected|offline/i.test(message);
  }

  private errorText(error: unknown): string {
    return typeof error === 'string' ? error : (error as Error | null)?.message ?? '';
  }

  /**
   * Helper: Add operation to queue. Returns the queued operation's id.
   */
  private async queueOperation(
    entityType: EntityType,
    entityId: string,
    operation: Operation,
    data: ShoppingList | Item | StoreLayout | null
  ): Promise<string> {
    // Single localized assertion: TS can't prove entityType/data pair up,
    // but callers always pass matching pairs.
    const queuedOp = {
      id: uuidv4(),
      entityType,
      entityId,
      operation,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    } as QueuedOperation;

    await LocalStorageManager.addToSyncQueue(queuedOp);
    this.notifyStatus();
    return queuedOp.id;
  }
}

export default new SyncEngine();

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
  // Order of writes per entity ("item/<id>"). Every write is the whole object, so the newest
  // one replaces all before it: an older queued copy must never be sent after a newer write.
  private writeSeq = 0;
  private latestWrite = new Map<string, number>();
  // Which write each queued operation of this run came from. One read from storage and not
  // listed here was queued in an earlier run, so it is older than any write of this run.
  private queuedSeq = new Map<string, number>();
  // Entity of every queued operation this engine knows, so a write reads the stored queue only
  // when an older operation of the same entity can be in it. Operations of an earlier run are
  // unknown until the queue was read once (queueSeen).
  private queuedKey = new Map<string, string>();
  private queuedPerEntity = new Map<string, number>();
  private queueSeen = false;
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
    this.latestWrite.clear();
    this.queuedSeq.clear();
    this.queuedKey.clear();
    this.queuedPerEntity.clear();
    this.queueSeen = false;
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
    // Counted from the start, so the local read and the queue write are covered too
    this.inFlight++;
    try {
      await this.sendOrQueue(entityType, entityId, operation, data);
    } finally {
      this.inFlight--;
      if (this.inFlight === 0) {
        this.inFlightWaiters.splice(0).forEach(resolve => resolve());
      }
    }
  }

  private async sendOrQueue(
    entityType: EntityType,
    entityId: string,
    operation: Operation,
    data?: ShoppingList | Item | StoreLayout | null
  ): Promise<void> {
    const session = this.session;
    // Taken before the first await: the order of taps is the order of writes
    const key = this.entityKey(entityType, entityId);
    const seq = ++this.writeSeq;
    this.latestWrite.set(key, seq);

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
    // The read above can finish after a newer write of the same entity was made: that one
    // carries the newer state, and sending this one now would put the old state over it.
    if (this.latestWrite.get(key) !== seq) return;

    if (this.isOnline) {
      const write = this.syncToFirebase(entityType, entityId, operation, syncData);
      try {
        await this.withTimeout(write);
        if (session !== this.session) return;
        await this.dropOlderQueued(key, seq);
        if (session !== this.session) return;
        await LocalStorageManager.markSyncedIfUnchanged(entityType as 'list' | 'item' | 'storeLayout', entityId, updatedAt);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'SyncEngine.pushChange');
        if (session !== this.session) return;
        // A newer write of the same entity has started: it is sent or queued itself
        if (this.latestWrite.get(key) !== seq) return;
        const queuedId = await this.queueOperation(entityType, entityId, operation, syncData, seq);
        this.dropQueuedOperationOnLateWrite(queuedId, write, entityType, entityId, updatedAt);
        if (session !== this.session) return;
        await this.dropOlderQueued(key, seq, queuedId);
      }
    } else {
      const queuedId = await this.queueOperation(entityType, entityId, operation, syncData, seq);
      if (session !== this.session) return;
      await this.dropOlderQueued(key, seq, queuedId);
    }
  }

  private entityKey(entityType: EntityType, entityId: string): string {
    return `${entityType}/${entityId}`;
  }

  private rememberQueued(operationId: string, key: string): void {
    if (this.queuedKey.has(operationId)) return;
    this.queuedKey.set(operationId, key);
    this.queuedPerEntity.set(key, (this.queuedPerEntity.get(key) ?? 0) + 1);
  }

  private forgetQueued(operationId: string): void {
    const key = this.queuedKey.get(operationId);
    if (key === undefined) return;
    this.queuedKey.delete(operationId);
    const left = (this.queuedPerEntity.get(key) ?? 1) - 1;
    if (left > 0) this.queuedPerEntity.set(key, left);
    else this.queuedPerEntity.delete(key);
  }

  /** The stored queue was read in full: operations queued by an earlier run are known from now on. */
  private noteStoredQueue(queue: QueuedOperation[]): void {
    for (const queued of queue) {
      this.rememberQueued(queued.id, this.entityKey(queued.entityType, queued.entityId));
    }
    this.queueSeen = true;
  }

  /** Remove a queued operation that may already be gone (sent, or dropped by another path). */
  private async removeQueued(operationId: string): Promise<void> {
    this.queuedSeq.delete(operationId);
    this.forgetQueued(operationId);
    try {
      await LocalStorageManager.removeFromSyncQueue(operationId);
    } catch {
      // Already removed
    }
  }

  /**
   * After write `seq` of an entity was sent or queued: take every older queued operation of
   * the same entity out of the queue, so no retry can put an old value over the new one.
   * A failure here is not a failed write; processOperationQueue checks again before each send.
   */
  private async dropOlderQueued(key: string, seq: number, keepId?: string): Promise<void> {
    const own = keepId !== undefined && this.queuedKey.has(keepId) ? 1 : 0;
    if (this.queueSeen && (this.queuedPerEntity.get(key) ?? 0) <= own) return;
    try {
      const queue = await LocalStorageManager.getSyncQueue();
      this.noteStoredQueue(queue);
      let dropped = 0;
      for (const queued of queue) {
        if (queued.id === keepId) continue;
        if (this.entityKey(queued.entityType, queued.entityId) !== key) continue;
        if ((this.queuedSeq.get(queued.id) ?? 0) >= seq) continue;
        await this.removeQueued(queued.id);
        dropped++;
      }
      if (dropped > 0) this.notifyStatus();
    } catch (error) {
      CrashReporting.recordError(error as Error, 'SyncEngine.dropOlderQueued');
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
      this.noteStoredQueue(queue);
      const now = Date.now();

      // The newest queued operation per entity. The queue is oldest first by clock time, but two
      // taps can share a millisecond, so the order of writes in this run decides before position.
      const newestQueued = new Map<string, string>();
      for (const operation of queue) {
        const key = this.entityKey(operation.entityType, operation.entityId);
        const current = newestQueued.get(key);
        if (current === undefined || (this.queuedSeq.get(operation.id) ?? 0) >= (this.queuedSeq.get(current) ?? 0)) {
          newestQueued.set(key, operation.id);
        }
      }

      for (const operation of queue) {
        if (session !== this.session) break;
        const key = this.entityKey(operation.entityType, operation.entityId);
        if (newestQueued.get(key) !== operation.id) {
          CrashReporting.log(`Dropped sync operation ${operation.id} (${key} ${operation.operation}): a newer change of it is queued`);
          await this.removeQueued(operation.id);
          continue;
        }
        if (operation.nextRetryAt && now < operation.nextRetryAt) {
          deferred++;
          continue;
        }

        if (await this.revivesDeletedList(operation)) {
          CrashReporting.log(`Dropped sync operation ${operation.id} (list/${operation.entityId} ${operation.operation}): list deleted on this phone`);
          await this.removeQueued(operation.id);
          continue;
        }

        // Checked last, with no await before the send: a write started meanwhile wins
        if (session !== this.session) break;
        if (this.isSuperseded(operation)) {
          CrashReporting.log(`Dropped sync operation ${operation.id} (${key} ${operation.operation}): a newer change of it was sent`);
          await this.removeQueued(operation.id);
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

          await this.removeQueued(operation.id);

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
            await this.removeQueued(operation.id);
          } else if (this.isSuperseded(operation)) {
            // A newer change started while this one was being sent: no retry for the old one
            await this.removeQueued(operation.id);
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
        // processOperationQueue may have drained it first — then nothing is left to drop
        await this.removeQueued(queuedId);
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
  /** A newer write of the same entity has started since this operation was queued. */
  private isSuperseded(operation: QueuedOperation): boolean {
    const latest = this.latestWrite.get(this.entityKey(operation.entityType, operation.entityId)) ?? 0;
    return latest > (this.queuedSeq.get(operation.id) ?? 0);
  }

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
    data: ShoppingList | Item | StoreLayout | null,
    seq: number
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

    this.queuedSeq.set(queuedOp.id, seq);
    this.rememberQueued(queuedOp.id, this.entityKey(entityType, entityId));
    await LocalStorageManager.addToSyncQueue(queuedOp);
    this.notifyStatus();
    return queuedOp.id;
  }
}

export default new SyncEngine();

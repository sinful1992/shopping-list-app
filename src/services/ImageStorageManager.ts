import { getStorage, ref as storageRef, getDownloadURL, deleteObject, putFile, writeToFile } from '@react-native-firebase/storage';
import { FilePath } from '@react-native-firebase/app';
import { v4 as uuidv4 } from 'uuid';
import NetInfo from '@react-native-community/netinfo';
import { QueuedUpload, UploadQueueResult, UploadError, ShoppingList } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';
import CrashReporting from './CrashReporting';
import { isReceiptStoragePath } from '../utils/uri';
import EncryptedStorage from 'react-native-encrypted-storage';
import { safeJsonParse } from '../utils/safeJsonParse';

/**
 * ImageStorageManager
 * Uploads receipt images to Firebase Cloud Storage
 * Implements Requirements: 5.4, 5.5, 5.6, 5.7, 9.4, 9.7
 */
class ImageStorageManager {
  private readonly UPLOAD_QUEUE_KEY = '@upload_queue';
  private processing: Promise<UploadQueueResult> | null = null;
  // One pass queued behind the running one, for captures added after the
  // running pass read the queue.
  private followUp: Promise<UploadQueueResult> | null = null;
  // Every read-modify-write of the stored queue runs through this chain, so
  // a capture queued while a pass removes an entry is not overwritten.
  private queueWrites: Promise<unknown> = Promise.resolve();
  // Per list: pointing the list at an image (a scan, or an upload landing)
  // and deciding an old image is unreferenced run one at a time, so an
  // upload never overwrites a newer scan between its check and its write.
  private listLocks = new Map<string, Promise<unknown>>();
  private watchingConnection = false;

  private static readonly MAX_RETRIES = 5;

  /**
   * Save a new capture's scan to a list and queue the photo for upload.
   * A list already showing an uploaded image keeps showing it, to the whole
   * family, until the new one has uploaded: a path into this phone's cache
   * would sync to devices that cannot open it. A first scan has nothing to
   * keep, so the list points at the capture straight away.
   */
  async setListReceipt(listId: string, filePath: string, patch: Partial<ShoppingList>): Promise<void> {
    await this.withListLock(listId, async () => {
      const shown = (await LocalStorageManager.getList(listId))?.receiptUrl;
      const replacing = isReceiptStoragePath(shown);
      await ShoppingListManager.updateList(listId, replacing ? patch : { ...patch, receiptUrl: filePath });
      await this.queueReceiptForUpload(filePath, listId, replacing ? shown : undefined);
    });
  }

  /**
   * The newest capture of a list still waiting to upload, on this phone.
   * Until it uploads the list may still show the image it replaces, so
   * whatever wants the latest photo here (viewing it, re-reading it) asks
   * this first.
   */
  async pendingCapture(listId: string): Promise<string | null> {
    const queue = await this.getUploadQueue();
    return queue.filter(item => item.listId === listId).pop()?.filePath ?? null;
  }

  /**
   * Whether a queued capture is still the one its list wants: the newest
   * capture of the list, on a list that still shows it or the image it
   * replaces. Anything else was superseded by a rescan here or elsewhere.
   */
  private isWanted(upload: QueuedUpload, list: ShoppingList | null, queue: QueuedUpload[]): list is ShoppingList {
    if (!list || list.status === 'deleted') return false;
    const newest = queue.filter(item => item.listId === upload.listId).pop();
    if (newest && newest.id !== upload.id) return false;
    return list.receiptUrl === upload.filePath
      || (!!upload.replacesPath && list.receiptUrl === upload.replacesPath);
  }

  /**
   * Upload a queued capture to Firebase Cloud Storage and point its list at it
   * Implements Req 5.4, 5.5
   */
  private async uploadReceipt(upload: QueuedUpload, familyGroupId: string): Promise<void> {
    try {
      // Generate storage path: /receipts/{familyGroupId}/{listId}/{timestamp}.jpg
      const { filePath, listId } = upload;
      const timestamp = Date.now();
      const storagePath = `receipts/${familyGroupId}/${listId}/${timestamp}.jpg`;

      // Create storage reference
      const reference = storageRef(getStorage(), storagePath);

      await putFile(reference, filePath);

      await this.withListLock(listId, async () => {
        // Point the list at the upload only if it still wants this capture: a
        // rescan or a discarded quick scan while the upload was in flight means
        // nothing does, and it would sit in the bucket unreferenced.
        const list = await LocalStorageManager.getList(listId);
        if (!this.isWanted(upload, list, await this.getUploadQueue())) {
          await deleteObject(reference).catch(() => {});
        } else {
          // Through ShoppingListManager, not local storage alone, so the path
          // syncs and the rest of the family can load the image.
          await ShoppingListManager.updateList(listId, { receiptUrl: storagePath });
        }
        await this.finishUpload(upload);
      });
    } catch (error: any) {
      throw new Error(`Failed to upload receipt: ${error.message}`);
    }
  }

  /**
   * Take an entry off the queue. The image it replaced is deleted once
   * nothing refers to it: not the list, and no other queued capture of it.
   * Runs under the list's lock.
   */
  private async finishUpload(upload: QueuedUpload): Promise<void> {
    const replaced = upload.replacesPath;
    if (replaced) {
      const list = await LocalStorageManager.getList(upload.listId);
      const shown = !!list && list.status !== 'deleted' && list.receiptUrl === replaced;
      const queue = await this.getUploadQueue();
      const pending = queue.some(item => item.id !== upload.id && item.replacesPath === replaced);
      if (!shown && !pending) {
        await this.deleteReceipt(replaced)
          .catch(err => this.report(err, 'ImageStorageManager replaced receipt delete'));
      }
    }
    await this.removeFromQueue(upload.id);
  }

  /** A failed report must not turn a finished upload into a retry. */
  private report(error: unknown, context: string): void {
    try {
      CrashReporting.recordError(error as Error, context);
    } catch {
      // Nothing left to tell.
    }
  }

  private withListLock<T>(listId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.listLocks.get(listId) ?? Promise.resolve()).then(task);
    const tail = run.catch(() => undefined);
    this.listLocks.set(listId, tail);
    tail.then(() => {
      if (this.listLocks.get(listId) === tail) this.listLocks.delete(listId);
    });
    return run;
  }

  /**
   * Download a receipt from Cloud Storage back to the local cache so it can
   * be re-processed (e.g. OCR retry after the local capture file is gone).
   * Returns the local file path.
   */
  async downloadReceiptToCache(storagePath: string, listId: string): Promise<string> {
    try {
      const localPath = `${FilePath.CACHES_DIRECTORY}/ocr-retry-${listId}.jpg`;
      const reference = storageRef(getStorage(), storagePath);
      await writeToFile(reference, localPath);
      return localPath;
    } catch (error: any) {
      throw new Error(`Failed to download receipt: ${error.message}`);
    }
  }

  /**
   * Get download URL for receipt
   * Implements Req 5.7
   */
  async getReceiptDownloadUrl(storagePath: string): Promise<string> {
    try {
      const reference = storageRef(getStorage(), storagePath);
      return await getDownloadURL(reference);
    } catch (error: any) {
      throw new Error(`Failed to get receipt URL: ${error.message}`);
    }
  }

  /**
   * Delete receipt from storage
   */
  async deleteReceipt(storagePath: string): Promise<void> {
    try {
      const reference = storageRef(getStorage(), storagePath);
      await deleteObject(reference);
    } catch (error: any) {
      throw new Error(`Failed to delete receipt: ${error.message}`);
    }
  }

  /**
   * Queue receipt for upload
   * Implements Req 5.6, 9.4
   */
  async queueReceiptForUpload(filePath: string, listId: string, replacesPath?: string): Promise<void> {
    try {
      await this.mutateQueue(queue => {
        // A capture replacing one still waiting to upload takes over what
        // that one replaced: the waiting one is dropped as superseded.
        const inherited = replacesPath
          ?? queue.find(item => item.listId === listId && item.replacesPath)?.replacesPath;
        const queuedUpload: QueuedUpload = {
          id: uuidv4(),
          filePath,
          listId,
          timestamp: Date.now(),
          retryCount: 0,
          ...(inherited ? { replacesPath: inherited } : {}),
        };
        return [...queue, queuedUpload];
      });
    } catch (error: any) {
      throw new Error(`Failed to queue upload: ${error.message}`);
    }
  }

  /**
   * Process all queued uploads
   * Implements Req 9.7
   *
   * A call while a pass is running never starts a second concurrent pass,
   * which would upload the same file twice. The running pass read the queue
   * before whatever this caller just added, so the call gets one follow-up
   * pass instead, shared by every caller that arrives meanwhile.
   */
  processUploadQueue(): Promise<UploadQueueResult> {
    this.watchConnection();
    if (!this.processing) {
      this.processing = this.runUploadQueue().finally(() => { this.processing = null; });
      return this.processing;
    }
    if (!this.followUp) {
      this.followUp = this.processing
        .catch(() => undefined)
        .then(() => {
          this.followUp = null;
          return this.processUploadQueue();
        });
    }
    return this.followUp;
  }

  /**
   * Run the queue again when the connection comes back, rather than leaving
   * an offline scan until the next app start. Registered on first use, not
   * at import, so modules that only import this one never touch NetInfo.
   */
  private watchConnection(): void {
    if (this.watchingConnection) return;
    this.watchingConnection = true;
    let wasOnline = true;
    NetInfo.addEventListener(state => {
      const online = state.isConnected !== false;
      if (online && !wasOnline) {
        this.processUploadQueue().catch(() => {});
      }
      wasOnline = online;
    });
  }

  private async isOffline(): Promise<boolean> {
    const state = await NetInfo.fetch().catch(() => null);
    return state?.isConnected === false;
  }

  private async runUploadQueue(): Promise<UploadQueueResult> {
    let processedCount = 0;
    let successCount = 0;
    const errors: UploadError[] = [];
    // Offline, every upload would fail and use up one of its retries; the
    // queue runs again when the connection returns.
    if (await this.isOffline()) {
      return { processedCount, successCount, failedCount: 0, errors };
    }
    const queue = await this.getUploadQueue();

    for (const upload of queue) {
      // A list discarded (a skipped quick scan) or rescanned since the
      // capture was queued no longer wants this file.
      const list = await LocalStorageManager.getList(upload.listId);
      if (!this.isWanted(upload, list, queue)) {
        await this.withListLock(upload.listId, () => this.finishUpload(upload));
        continue;
      }
      processedCount++;
      try {
        // Stored under the list's own group, which the Storage rules check
        // against the uploader's familyGroupId claim.
        await this.uploadReceipt(upload, list.familyGroupId);
        successCount++;
      } catch (error) {
        // The connection dropped mid-pass: not this upload's fault, so it
        // keeps its retries, and the rest wait for the connection too.
        if (await this.isOffline()) {
          processedCount--;
          break;
        }
        if (upload.retryCount < ImageStorageManager.MAX_RETRIES) {
          upload.retryCount++;
          await this.updateQueueItem(upload);
          continue;
        }
        errors.push({
          listId: upload.listId,
          filePath: upload.filePath,
          error: 'Max retries exceeded',
        });
        // Dropping it would leave the list on a path into this phone's
        // cache, which no other device can load. It stays queued for the
        // next reconnect or start, reported once.
        if (upload.retryCount === ImageStorageManager.MAX_RETRIES) {
          this.report(error, 'ImageStorageManager upload out of retries');
          upload.retryCount++;
          await this.updateQueueItem(upload);
        }
      }
    }

    return {
      processedCount,
      successCount,
      failedCount: processedCount - successCount,
      errors,
    };
  }

  /**
   * Helper: Get upload queue from storage
   */
  private async getUploadQueue(): Promise<QueuedUpload[]> {
    const queueJson = await EncryptedStorage.getItem(this.UPLOAD_QUEUE_KEY);
    return safeJsonParse<QueuedUpload[]>(queueJson, []);
  }

  /**
   * Helper: Remove item from queue
   */
  private async removeFromQueue(uploadId: string): Promise<void> {
    await this.mutateQueue(queue => queue.filter((item) => item.id !== uploadId));
  }

  /**
   * Helper: Update queue item
   */
  private async updateQueueItem(upload: QueuedUpload): Promise<void> {
    await this.mutateQueue(queue => queue.map((item) => (item.id === upload.id ? upload : item)));
  }

  /** Read, change and write the stored queue, one change at a time. */
  private mutateQueue(change: (queue: QueuedUpload[]) => QueuedUpload[]): Promise<void> {
    const write = this.queueWrites.then(async () => {
      const queue = await this.getUploadQueue();
      await EncryptedStorage.setItem(this.UPLOAD_QUEUE_KEY, JSON.stringify(change(queue)));
    });
    this.queueWrites = write.catch(() => undefined);
    return write;
  }
}

export default new ImageStorageManager();

import { getStorage, ref as storageRef, getDownloadURL, deleteObject, putFile, writeToFile } from '@react-native-firebase/storage';
import { utils } from '@react-native-firebase/app';
import { v4 as uuidv4 } from 'uuid';
import { QueuedUpload, UploadQueueResult, UploadError } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';
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

  /**
   * Upload receipt image to Firebase Cloud Storage
   * Implements Req 5.4, 5.5
   */
  async uploadReceipt(
    filePath: string,
    listId: string,
    familyGroupId: string,
  ): Promise<string> {
    try {
      // Generate storage path: /receipts/{familyGroupId}/{listId}/{timestamp}.jpg
      const timestamp = Date.now();
      const storagePath = `receipts/${familyGroupId}/${listId}/${timestamp}.jpg`;

      // Create storage reference
      const reference = storageRef(getStorage(), storagePath);

      await putFile(reference, filePath);

      // Point the list at the upload only if it still shows this capture: a
      // rescan or a discarded quick scan while the upload was in flight means
      // nothing wants it, and it would sit in the bucket unreferenced.
      const list = await LocalStorageManager.getList(listId);
      if (!list || list.status === 'deleted' || list.receiptUrl !== filePath) {
        await deleteObject(reference).catch(() => {});
        return storagePath;
      }
      // Through ShoppingListManager, not local storage alone, so the path
      // syncs and the rest of the family can load the image.
      await ShoppingListManager.updateList(listId, { receiptUrl: storagePath });

      return storagePath;
    } catch (error: any) {
      throw new Error(`Failed to upload receipt: ${error.message}`);
    }
  }

  /**
   * Download a receipt from Cloud Storage back to the local cache so it can
   * be re-processed (e.g. OCR retry after the local capture file is gone).
   * Returns the local file path.
   */
  async downloadReceiptToCache(storagePath: string, listId: string): Promise<string> {
    try {
      const localPath = `${utils.FilePath.CACHES_DIRECTORY}/ocr-retry-${listId}.jpg`;
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
  async queueReceiptForUpload(filePath: string, listId: string): Promise<void> {
    try {
      const queuedUpload: QueuedUpload = {
        id: uuidv4(),
        filePath,
        listId,
        timestamp: Date.now(),
        retryCount: 0,
      };

      await this.mutateQueue(queue => [...queue, queuedUpload]);
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

  private async runUploadQueue(): Promise<UploadQueueResult> {
    const queue = await this.getUploadQueue();
    let processedCount = 0;
    let successCount = 0;
    const errors: UploadError[] = [];

    for (const upload of queue) {
      // A list discarded (a skipped quick scan) or rescanned since the
      // capture was queued no longer wants this file.
      const list = await LocalStorageManager.getList(upload.listId);
      if (!list || list.status === 'deleted' || list.receiptUrl !== upload.filePath) {
        await this.removeFromQueue(upload.id);
        continue;
      }
      processedCount++;
      try {
        // Stored under the list's own group, which the Storage rules check
        // against the uploader's familyGroupId claim.
        await this.uploadReceipt(upload.filePath, upload.listId, list.familyGroupId);
        successCount++;

        // Remove from queue on success
        await this.removeFromQueue(upload.id);
      } catch {
        if (upload.retryCount >= 5) {
          // Max retries reached, remove from queue
          errors.push({
            listId: upload.listId,
            filePath: upload.filePath,
            error: 'Max retries exceeded',
          });
          await this.removeFromQueue(upload.id);
        } else {
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

import storage from '@react-native-firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { QueuedUpload, UploadQueueResult, UploadError } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ImageStorageManager
 * Uploads receipt images to Firebase Cloud Storage
 * Implements Requirements: 5.4, 5.5, 5.6, 5.7, 9.4, 9.7
 */
class ImageStorageManager {
  private readonly UPLOAD_QUEUE_KEY = '@upload_queue';

  /**
   * Upload receipt image to Firebase Cloud Storage
   * Implements Req 5.4, 5.5
   */
  async uploadReceipt(
    filePath: string,
    listId: string,
    familyGroupId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      // Generate storage path: /receipts/{familyGroupId}/{listId}/{timestamp}.jpg
      const timestamp = Date.now();
      const storagePath = `receipts/${familyGroupId}/${listId}/${timestamp}.jpg`;

      // Create storage reference
      const reference = storage().ref(storagePath);

      // Upload file
      const task = reference.putFile(filePath);

      // Monitor progress
      if (onProgress) {
        task.on('state_changed', (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        });
      }

      // Wait for upload to complete
      await task;

      // Get download URL
      const downloadUrl = await reference.getDownloadURL();

      // Update list with receipt URL
      await LocalStorageManager.updateList(listId, {
        receiptUrl: storagePath,
      });

      return storagePath;
    } catch (error: any) {
      throw new Error(`Failed to upload receipt: ${error.message}`);
    }
  }

  /**
   * Get download URL for receipt
   * Implements Req 5.7
   */
  async getReceiptDownloadUrl(storagePath: string): Promise<string> {
    try {
      const reference = storage().ref(storagePath);
      return await reference.getDownloadURL();
    } catch (error: any) {
      throw new Error(`Failed to get download URL: ${error.message}`);
    }
  }

  /**
   * Delete receipt from storage
   */
  async deleteReceipt(storagePath: string): Promise<void> {
    try {
      const reference = storage().ref(storagePath);
      await reference.delete();
    } catch (error: any) {
      throw new Error(`Failed to delete receipt: ${error.message}`);
    }
  }

  /**
   * Queue receipt for upload (when offline)
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

      // Get existing queue
      const queue = await this.getUploadQueue();
      queue.push(queuedUpload);

      // Save updated queue
      await AsyncStorage.setItem(this.UPLOAD_QUEUE_KEY, JSON.stringify(queue));
    } catch (error: any) {
      throw new Error(`Failed to queue upload: ${error.message}`);
    }
  }

  /**
   * Process all queued uploads
   * Implements Req 9.7
   */
  async processUploadQueue(familyGroupId: string): Promise<UploadQueueResult> {
    const queue = await this.getUploadQueue();
    let processedCount = 0;
    let successCount = 0;
    const errors: UploadError[] = [];

    for (const upload of queue) {
      processedCount++;
      try {
        await this.uploadReceipt(upload.filePath, upload.listId, familyGroupId);
        successCount++;

        // Remove from queue on success
        await this.removeFromQueue(upload.id);
      } catch (error: any) {
        console.error('Upload failed:', error);

        if (upload.retryCount >= 5) {
          // Max retries reached, remove from queue
          errors.push({
            listId: upload.listId,
            filePath: upload.filePath,
            error: 'Max retries exceeded',
          });
          await this.removeFromQueue(upload.id);
        } else {
          // Increment retry count
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
   * Get count of queued uploads
   */
  async getQueuedUploadsCount(): Promise<number> {
    const queue = await this.getUploadQueue();
    return queue.length;
  }

  /**
   * Helper: Get upload queue from storage
   */
  private async getUploadQueue(): Promise<QueuedUpload[]> {
    try {
      const queueJson = await AsyncStorage.getItem(this.UPLOAD_QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Helper: Remove item from queue
   */
  private async removeFromQueue(uploadId: string): Promise<void> {
    const queue = await this.getUploadQueue();
    const updatedQueue = queue.filter((item) => item.id !== uploadId);
    await AsyncStorage.setItem(this.UPLOAD_QUEUE_KEY, JSON.stringify(updatedQueue));
  }

  /**
   * Helper: Update queue item
   */
  private async updateQueueItem(upload: QueuedUpload): Promise<void> {
    const queue = await this.getUploadQueue();
    const index = queue.findIndex((item) => item.id === upload.id);
    if (index !== -1) {
      queue[index] = upload;
      await AsyncStorage.setItem(this.UPLOAD_QUEUE_KEY, JSON.stringify(queue));
    }
  }
}

export default new ImageStorageManager();

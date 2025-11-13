import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import {
  OCRResult,
  OCRStatus,
  QueuedOCRRequest,
  OCRQueueResult,
  OCRError,
  ReceiptData,
  ReceiptLineItem,
} from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ReceiptOCRProcessor
 * Sends receipt images to Google Cloud Vision API for text extraction
 * Implements Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.8
 */
class ReceiptOCRProcessor {
  private readonly apiKey: string;
  private readonly OCR_QUEUE_KEY = '@ocr_queue';
  private readonly API_USAGE_KEY = '@api_usage_count';

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
  }

  /**
   * Process receipt image with OCR from local file path
   * Implements Req 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async processReceipt(localFilePath: string, listId: string): Promise<OCRResult> {
    try {
      if (!this.apiKey) {
        throw new Error('Google Cloud Vision API key not configured');
      }

      // Read local image and convert to base64
      const base64Image = await this.readLocalImageAsBase64(localFilePath);

      // Send to Google Cloud Vision API
      const extractedText = await this.callVisionAPI(base64Image);

      // Parse receipt data
      const receiptData = this.parseReceiptText(extractedText);

      // Increment API usage count
      await this.incrementAPIUsage();
      const apiUsageCount = await this.getAPIUsageCount();

      // Check confidence threshold
      if (receiptData.confidence < 70) {
        // Low confidence - mark as failed
        return {
          success: false,
          receiptData: null,
          confidence: receiptData.confidence,
          error: 'Low confidence OCR result',
          apiUsageCount,
        };
      }

      // Save receipt data
      await LocalStorageManager.saveReceiptData(listId, receiptData);

      // Trigger sync
      await SyncEngine.pushChange('list', listId, 'update');

      return {
        success: true,
        receiptData,
        confidence: receiptData.confidence,
        error: null,
        apiUsageCount,
      };
    } catch (error: any) {
      return {
        success: false,
        receiptData: null,
        confidence: 0,
        error: error.message,
        apiUsageCount: await this.getAPIUsageCount(),
      };
    }
  }

  /**
   * Queue OCR request for later processing
   * Implements Req 6.7, 9.8
   */
  async queueOCRRequest(localFilePath: string, listId: string): Promise<void> {
    const queuedRequest: QueuedOCRRequest = {
      id: uuidv4(),
      imageUrl: localFilePath, // Note: imageUrl field stores local file path
      listId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const queue = await this.getOCRQueue();
    queue.push(queuedRequest);
    await AsyncStorage.setItem(this.OCR_QUEUE_KEY, JSON.stringify(queue));
  }

  /**
   * Process all queued OCR requests
   * Implements Req 9.8
   */
  async processOCRQueue(): Promise<OCRQueueResult> {
    const queue = await this.getOCRQueue();
    let processedCount = 0;
    let successCount = 0;
    const errors: OCRError[] = [];

    for (const request of queue) {
      processedCount++;
      try {
        const result = await this.processReceipt(request.imageUrl, request.listId);
        if (result.success) {
          successCount++;
          await this.removeFromOCRQueue(request.id);
        } else {
          errors.push({
            listId: request.listId,
            error: result.error || 'Unknown error',
          });
          await this.removeFromOCRQueue(request.id);
        }
      } catch (error: any) {
        errors.push({
          listId: request.listId,
          error: error.message,
        });
        await this.removeFromOCRQueue(request.id);
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
   * Retry failed OCR
   * Implements Req 6.6
   */
  async retryFailedOCR(listId: string): Promise<OCRResult> {
    const list = await LocalStorageManager.getList(listId);
    if (!list || !list.receiptUrl) {
      throw new Error('No receipt found for this list');
    }

    const imageUrl = list.receiptUrl;
    return await this.processReceipt(imageUrl, listId);
  }

  /**
   * Get OCR processing status
   */
  async getOCRStatus(listId: string): Promise<OCRStatus> {
    const receiptData = await LocalStorageManager.getReceiptData(listId);

    if (!receiptData) {
      return {
        status: 'pending',
        confidence: null,
        processedAt: null,
      };
    }

    return {
      status: 'completed',
      confidence: receiptData.confidence,
      processedAt: receiptData.extractedAt,
    };
  }

  /**
   * Helper: Call Google Cloud Vision API
   * Implements Req 6.2
   */
  private async callVisionAPI(base64Image: string): Promise<string> {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;

    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image,
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
              maxResults: 1,
            },
          ],
        },
      ],
    };

    const response = await axios.post(url, requestBody);

    if (response.data.responses[0].error) {
      throw new Error(response.data.responses[0].error.message);
    }

    const textAnnotations = response.data.responses[0].textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text found in image');
    }

    return textAnnotations[0].description;
  }

  /**
   * Helper: Parse receipt text
   * Implements Req 6.3
   */
  private parseReceiptText(text: string): ReceiptData {
    const lines = text.split('\n').filter((line) => line.trim());

    // Extract merchant name (typically first bold/large text)
    const merchantName = lines[0] || null;

    // Extract date (common formats: MM/DD/YYYY, DD-MM-YYYY, DD'MMM'YY, etc.)
    const dateRegex = /\b(\d{1,2}[\/\-\.'\s](?:\d{1,2}|[A-Za-z]{3})[\/\-\.'\s]\d{2,4})\b/;
    const dateMatch = text.match(dateRegex);
    const purchaseDate = dateMatch ? dateMatch[0] : null;

    // Detect currency (£, $, €, etc.)
    let currency = 'USD';
    if (text.includes('£') || /GBP|UK|Premier Inn|Tesco|Sainsbury/i.test(text)) {
      currency = 'GBP';
    } else if (text.includes('€') || /EUR/i.test(text)) {
      currency = 'EUR';
    }

    // Enhanced amount regex - handles £, $, €, and prices without currency symbol
    const amountRegex = /[£$€]?\s*(\d+\.\d{2})/g;
    const amounts: number[] = [];
    let match;
    while ((match = amountRegex.exec(text)) !== null) {
      amounts.push(parseFloat(match[1]));
    }
    const totalAmount = amounts.length > 0 ? Math.max(...amounts) : null;

    // Extract line items - improved pattern matching
    const lineItems: ReceiptLineItem[] = [];

    // Skip header/footer keywords
    const skipKeywords = /VAT|total|subtotal|tax|card|visa|mastercard|amex|check|closed|receipt|thank you|cashier|server|table/i;

    for (const line of lines) {
      // Skip lines with keywords
      if (skipKeywords.test(line)) continue;

      // Match patterns like: "Item Name 12.99" or "Item Name £12.99" or "Item Name 330 12.99"
      // Improved regex to capture item name and price more accurately
      const patterns = [
        // Pattern 1: Item name followed by price (with or without currency)
        /^(.+?)\s+[£$€]?\s*(\d+\.\d{2})$/,
        // Pattern 2: Item name with quantity/size then price (e.g., "Coca Cola 330 3.45")
        /^(.+?)\s+\d+\s+[£$€]?\s*(\d+\.\d{2})$/,
        // Pattern 3: Item with quantity prefix (e.g., "2x Item Name 10.00")
        /^(\d+x?\s+.+?)\s+[£$€]?\s*(\d+\.\d{2})$/,
      ];

      for (const pattern of patterns) {
        const itemMatch = line.match(pattern);
        if (itemMatch) {
          const description = itemMatch[1].trim();
          const price = parseFloat(itemMatch[2]);

          // Filter out very short descriptions (likely not real items)
          if (description.length > 2 && price > 0 && price < 1000) {
            lineItems.push({
              description,
              quantity: null,
              price,
            });
            break; // Found a match, move to next line
          }
        }
      }
    }

    // Calculate confidence (simple heuristic)
    let confidence = 50; // Base confidence
    if (merchantName) confidence += 15;
    if (purchaseDate) confidence += 15;
    if (totalAmount) confidence += 10;
    if (lineItems.length > 0) confidence += 10;

    return {
      merchantName,
      purchaseDate,
      totalAmount,
      currency,
      lineItems,
      extractedAt: Date.now(),
      confidence: Math.min(confidence, 100),
    };
  }

  /**
   * Helper: Read local image file and convert to base64
   */
  private async readLocalImageAsBase64(filePath: string): Promise<string> {
    try {
      // Clean up file path (remove file:// prefix if present)
      const cleanPath = filePath.replace('file://', '');

      // Read file as base64
      const base64 = await RNFS.readFile(cleanPath, 'base64');
      return base64;
    } catch (error: any) {
      throw new Error(`Failed to read local image: ${error.message}`);
    }
  }

  /**
   * Helper: Get OCR queue
   */
  private async getOCRQueue(): Promise<QueuedOCRRequest[]> {
    try {
      const queueJson = await AsyncStorage.getItem(this.OCR_QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Helper: Remove from OCR queue
   */
  private async removeFromOCRQueue(requestId: string): Promise<void> {
    const queue = await this.getOCRQueue();
    const updatedQueue = queue.filter((item) => item.id !== requestId);
    await AsyncStorage.setItem(this.OCR_QUEUE_KEY, JSON.stringify(updatedQueue));
  }

  /**
   * Helper: Increment API usage count
   * Implements Req 6.8
   */
  private async incrementAPIUsage(): Promise<void> {
    const count = await this.getAPIUsageCount();
    await AsyncStorage.setItem(this.API_USAGE_KEY, String(count + 1));
  }

  /**
   * Helper: Get API usage count
   * Implements Req 6.8
   */
  private async getAPIUsageCount(): Promise<number> {
    try {
      const countStr = await AsyncStorage.getItem(this.API_USAGE_KEY);
      return countStr ? parseInt(countStr, 10) : 0;
    } catch (error) {
      return 0;
    }
  }
}

// Initialize with API key from environment
const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
export default new ReceiptOCRProcessor(apiKey);

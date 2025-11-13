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
  VisionApiResponse,
  VisionAnnotateImageResponse,
  VisionEntityAnnotation,
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
      const visionResponse = await this.callVisionAPI(base64Image);

      // Parse receipt data with spatial information
      const receiptData = this.parseReceiptWithSpatialData(visionResponse);

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
  private async callVisionAPI(base64Image: string): Promise<VisionAnnotateImageResponse> {
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
            },
          ],
        },
      ],
    };

    const response = await axios.post<VisionApiResponse>(url, requestBody);

    if (response.data.responses[0].error) {
      throw new Error(response.data.responses[0].error.message);
    }

    return response.data.responses[0];
  }

  /**
   * Helper: Extract words with spatial coordinates
   */
  private extractWordsWithCoordinates(textAnnotations: VisionEntityAnnotation[]): Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    // Skip first element (full text), process individual words
    return textAnnotations.slice(1).map(annotation => {
      const vertices = annotation.boundingPoly.vertices;

      // Calculate bounding box dimensions
      const x = Math.min(...vertices.map(v => v.x || 0));
      const y = Math.min(...vertices.map(v => v.y || 0));
      const maxX = Math.max(...vertices.map(v => v.x || 0));
      const maxY = Math.max(...vertices.map(v => v.y || 0));

      return {
        text: annotation.description,
        x,
        y,
        width: maxX - x,
        height: maxY - y,
      };
    });
  }

  /**
   * Helper: Group words into lines based on Y-coordinate
   */
  private groupWordsIntoLines(words: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>): Array<Array<typeof words[0]>> {
    if (words.length === 0) return [];

    const VERTICAL_THRESHOLD = 15; // pixels tolerance for same line
    const lines: Array<Array<typeof words[0]>> = [];
    let currentLine: Array<typeof words[0]> = [];
    let lastY = -1;

    // Sort by Y first to process top to bottom
    const sortedWords = [...words].sort((a, b) => a.y - b.y);

    for (const word of sortedWords) {
      if (lastY === -1 || Math.abs(word.y - lastY) < VERTICAL_THRESHOLD) {
        currentLine.push(word);
        lastY = word.y;
      } else {
        if (currentLine.length > 0) {
          // Sort line words by X (left to right)
          currentLine.sort((a, b) => a.x - b.x);
          lines.push([...currentLine]);
        }
        currentLine = [word];
        lastY = word.y;
      }
    }

    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Helper: Calculate receipt zones to filter header/footer
   */
  private calculateReceiptZones(lineGroups: Array<Array<any>>): { headerEnd: number; footerStart: number } {
    if (lineGroups.length === 0) return { headerEnd: 0, footerStart: Infinity };

    const totalLines = lineGroups.length;

    // Header zone: top 30% (store name, address, date)
    const headerEnd = Math.floor(totalLines * 0.3);

    // Footer zone: bottom 25% (totals, payment, VAT summary)
    const footerStart = Math.floor(totalLines * 0.75);

    return { headerEnd, footerStart };
  }

  /**
   * Helper: Validate if a line is a valid product item
   */
  private isValidProductLine(description: string, price: number, lineText: string): boolean {
    // REJECT: Too short
    if (description.length < 3) return false;

    // REJECT: Date patterns (e.g., "31 Jul'25 19:00", "01/01/2025")
    if (/\d{1,2}[\/\-\.\s']+(?:[A-Za-z]{3}|\d{1,2})[\/\-\.\s']+\d{2,4}/i.test(description)) return false;
    if (/\d{1,2}:\d{2}/i.test(description)) return false; // Time patterns

    // REJECT: "TO PAY" and similar payment terms
    if (/\b(to\s*pay|amount|payable|paid|due)\b/i.test(description)) return false;

    // REJECT: Single letter/number codes (T1, T2, A, B) - but allow longer codes
    if (/^[A-Z]{1,2}\d{1,2}$/.test(description)) return false;

    // REJECT: Contains percentage (VAT lines)
    if (/\d{1,3}%/.test(lineText)) return false;

    // REJECT: Transaction metadata keywords
    if (/\b(tbl|table|check|chk|guest|gst|cover|server)\b/i.test(description)) return false;

    // REJECT: VAT category pattern (e.g., "T1 2.33 Food 20%")
    if (/^[A-Z]\d+\s+[\d.]+\s+\w+\s+\d+%?$/.test(lineText)) return false;

    // REJECT: Contains category words (Food, Beverage, etc)
    if (/\b(food|beverage|soft\s*bev|alcohol|service)\b/i.test(description)) return false;

    // ACCEPT: Has at least some letters (allow numbers mixed with letters)
    if (/[A-Za-z]/.test(description)) return true;

    // REJECT: Everything else (pure numbers, punctuation)
    return false;
  }

  /**
   * Helper: Parse receipt using spatial information from Vision API
   * Implements Req 6.3
   */
  private parseReceiptWithSpatialData(visionResponse: VisionAnnotateImageResponse): ReceiptData {
    const { textAnnotations } = visionResponse;

    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text found in image');
    }

    // Get full text from first annotation
    const text = textAnnotations[0].description;
    const plainLines = text.split('\n').filter((line) => line.trim());

    // Extract merchant name (typically first line)
    const merchantName = plainLines[0] || null;

    // Extract language
    const detectedLanguage = textAnnotations[0].locale;

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

    // Extract words with spatial coordinates
    const words = this.extractWordsWithCoordinates(textAnnotations);

    // Group words into lines based on Y-coordinate
    const lineGroups = this.groupWordsIntoLines(words);

    // Find all prices and determine total
    const allPrices: number[] = [];
    words.forEach(word => {
      const priceMatch = word.text.match(/^[£$€]?\s*(\d+\.?\d{0,2})$/);
      if (priceMatch) {
        allPrices.push(parseFloat(priceMatch[1]));
      }
    });
    const totalAmount = allPrices.length > 0 ? Math.max(...allPrices) : null;

    // Extract line items using spatial data
    const lineItems: ReceiptLineItem[] = [];
    const skipKeywords = /^(VAT|total|subtotal|sub|tax|balance|due|card|visa|mastercard|amex|receipt|thank|cashier|server|table|tbl|chk|check|guest|gst|cover|change|payment|date|time|tel|phone|address|street|road|lane|ave|avenue|www\.|http|store|manager|customer|food|soft\s*bev|beverage|alcohol|service|tender|cash|credit|debit|to\s*pay|amount|paid|payable)/i;

    // Calculate zones to skip header/footer
    const { headerEnd, footerStart } = this.calculateReceiptZones(lineGroups);
    const receiptWidth = Math.max(...words.map(w => w.x + w.width), 1);

    // Track multi-line items (common in UK supermarkets)
    let pendingDescription = '';

    for (let i = 0; i < lineGroups.length; i++) {
      const lineWords = lineGroups[i];
      if (lineWords.length === 0) continue;

      // ZONE FILTER: Skip header (first 30%)
      if (i < headerEnd) {
        pendingDescription = '';
        continue;
      }

      // ZONE FILTER: Skip footer (last 25%)
      if (i >= footerStart) {
        pendingDescription = '';
        continue;
      }

      const lineText = lineWords.map(w => w.text).join(' ');

      // Skip header/footer lines by keyword
      if (lineText.length < 2 || skipKeywords.test(lineText.trim())) {
        pendingDescription = '';
        continue;
      }

      // Skip VAT category lines (e.g., "T1 2.33 Food 20%")
      if (/^[A-Z]{1,2}\d+\s+[\d.]+\s+[A-Za-z\s]+\d{1,3}%?$/.test(lineText)) {
        pendingDescription = '';
        continue;
      }

      // Skip transaction metadata (e.g., "Tbl 7/1 Chk 6139")
      if (/\b(tbl|table|check|chk|guest|gst|cover)\s*\d+/i.test(lineText)) {
        pendingDescription = '';
        continue;
      }

      // Find price on this line (rightmost, right-aligned)
      const priceWord = lineWords
        .filter(w => {
          const isPricePattern = /^[£$€]?\s*\d+\.?\d{0,2}$/.test(w.text);
          const isRightAligned = (w.x / receiptWidth) > 0.5; // Must be in right half
          return isPricePattern && isRightAligned;
        })
        .sort((a, b) => b.x - a.x)[0]; // Rightmost

      if (priceWord) {
        const priceMatch = priceWord.text.match(/(\d+\.?\d{0,2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);

          // Skip unreasonable prices (but allow small prices like 0.50)
          if (price <= 0 || price > 1000) continue;

          // Description is everything left of the price
          const descriptionWords = lineWords.filter(w => w.x < priceWord.x);
          let description = descriptionWords.map(w => w.text).join(' ').trim();

          // If we have a pending description from previous line, prepend it
          if (pendingDescription) {
            description = pendingDescription + ' ' + description;
            pendingDescription = '';
          }

          // Clean up description
          // Remove leading item codes (e.g., "12345678 MILK" → "MILK")
          description = description.replace(/^\d{6,}\s+/, '');
          // Remove leading SKU patterns (e.g., "SKU123 ITEM" → "ITEM")
          description = description.replace(/^SKU\d+\s+/i, '');
          // Remove quantity indicators (e.g., "2 @ £1.50" or "2x Item")
          description = description.replace(/^\d+\s*[@x]\s*[£$€]?\s*[\d.]+\s*/i, '');
          // Remove standalone numbers at start
          description = description.replace(/^\d+\s+/, '');

          // VALIDATION: Check if valid product line
          if (!this.isValidProductLine(description, price, lineText)) continue;

          lineItems.push({
            description: description.trim(),
            quantity: null,
            price,
          });
        }
      } else {
        // No price on this line - might be continuation of previous item (multi-line)
        // Store it as pending description for next line
        // But only if it looks like text (not numbers/codes)
        if (lineText.length > 2 && !/^\d+$/.test(lineText) && !skipKeywords.test(lineText)) {
          // Remove item codes from pending text too
          let cleanText = lineText.replace(/^\d{6,}\s+/, '');
          cleanText = cleanText.replace(/^SKU\d+\s+/i, '');

          if (cleanText.length > 2) {
            pendingDescription = pendingDescription ? pendingDescription + ' ' + cleanText : cleanText;
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

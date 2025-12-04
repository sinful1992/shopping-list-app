import { v4 as uuidv4 } from 'uuid';
import RNFS from 'react-native-fs';
import { supabase } from './SupabaseClient';
import auth from '@react-native-firebase/auth';
import {
  OCRResult,
  OCRStatus,
  QueuedOCRRequest,
  OCRQueueResult,
  OCRError,
  ReceiptData,
  ReceiptLineItem,
  ReceiptDiscount,
  VATBreakdownItem,
  VisionApiResponse,
  VisionAnnotateImageResponse,
  VisionEntityAnnotation,
  User,
} from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import UsageTracker from './UsageTracker';

/**
 * ReceiptOCRProcessor
 * Sends receipt images to Google Cloud Vision API for text extraction
 * Implements Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.8
 */
class ReceiptOCRProcessor {
  private readonly apiKey: string;
  private readonly OCR_QUEUE_KEY = '@ocr_queue';
  private readonly API_USAGE_KEY = '@api_usage_count';

  // Store detection patterns
  private readonly STORE_PATTERNS = {
    lidl: /\blidl\b/i,
    tesco: /\btesco\b/i,
    sainsburys: /\bsainsbury/i,
    coop: /\bco-?op\b/i,
  };

  // Quantity patterns
  private readonly QTY_MULTIPLIER = /^(\d+)\s*[x×]\s*[£$€]?([\d.]+)/i; // "2 x £1.95"
  private readonly QTY_WEIGHT = /^(\d+\.?\d*)\s*kg\s*[@]?\s*[£$€]?([\d.]+)\s*\/\s*kg/i; // "0.990 kg @ £0.90/kg"

  // Discount patterns
  private readonly DISCOUNT_NEGATIVE = /^(.+?)\s+(-\d+\.?\d*)$/; // "15% off coupon -0.26"
  private readonly DISCOUNT_KEYWORDS = /\b(coupon|discount|off|saving|price\s*cut|clubcard|nectar|lidl\s*plus|member)\b/i;

  // VAT patterns
  private readonly VAT_LIDL = /^([A-Z])\s+(\d+)\s*%\s+([\d.]+)\s+([\d.]+)$/; // "A 0% 56.21 0.00"
  private readonly VAT_ASTERISK = /\*$/; // Items ending with *

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GOOGLE_CLOUD_VISION_API_KEY || '';
  }

  /**
   * Helper: Detect store from merchant name
   */
  private detectStore(text: string): 'lidl' | 'tesco' | 'sainsburys' | 'coop' | 'other' {
    if (this.STORE_PATTERNS.lidl.test(text)) return 'lidl';
    if (this.STORE_PATTERNS.tesco.test(text)) return 'tesco';
    if (this.STORE_PATTERNS.sainsburys.test(text)) return 'sainsburys';
    if (this.STORE_PATTERNS.coop.test(text)) return 'coop';
    return 'other';
  }

  /**
   * Process receipt image with OCR from local file path
   * Implements Req 6.1, 6.2, 6.3, 6.4, 6.5
   * Sprint 2: Enforces OCR usage limits based on subscription tier
   */
  async processReceipt(localFilePath: string, listId: string, user: User): Promise<OCRResult> {
    try {
      // Check if user can process OCR based on their subscription tier
      // NOTE: This is a client-side UX check. Actual enforcement happens in Cloud Function.
      const permission = await UsageTracker.canProcessOCR(user);
      if (!permission.allowed) {
        return {
          success: false,
          receiptData: null,
          confidence: 0,
          error: permission.reason || 'OCR limit reached',
          apiUsageCount: await this.getAPIUsageCount(),
        };
      }

      if (!user.familyGroupId) {
        throw new Error('User must belong to a family group to use OCR');
      }

      // Read local image and convert to base64
      const base64Image = await this.readLocalImageAsBase64(localFilePath);

      // Send to Cloud Function which calls Google Cloud Vision API
      // The API key is stored securely in Cloud Functions config
      const visionResponse = await this.callVisionAPI(base64Image, user.familyGroupId);

      // Parse receipt data with spatial information
      const receiptData = this.parseReceiptWithSpatialData(visionResponse);

      // Usage counter is incremented by Cloud Function server-side

      // Increment API usage count
      await this.incrementAPIUsage();
      const apiUsageCount = await this.getAPIUsageCount();

      // Check confidence threshold
      const isLowConfidence = receiptData.confidence < 70;

      // Always save receipt data (even if low confidence)
      await LocalStorageManager.saveReceiptData(listId, receiptData);

      // Trigger sync
      await SyncEngine.pushChange('list', listId, 'update');

      return {
        success: !isLowConfidence,
        receiptData, // Always include extracted data (not null)
        confidence: receiptData.confidence,
        error: isLowConfidence ? 'Low confidence OCR result - please verify data' : null,
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
   * Helper: Call Google Cloud Vision API via Supabase Edge Function
   * Implements Req 6.2
   *
   * SECURITY: The API key is stored in Supabase secrets,
   * not in the client app. This prevents key exposure.
   */
  private async callVisionAPI(base64Image: string, familyGroupId: string): Promise<VisionAnnotateImageResponse> {
    // Get current user ID
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    // Call Supabase Edge Function which has the API key securely stored
    const { data, error } = await supabase.functions.invoke('process-ocr', {
      body: {
        image: base64Image,
        familyGroupId,
        userId: currentUser.uid,
      },
    });

    if (error) {
      throw new Error(error.message || 'OCR processing failed');
    }

    if (!data.success) {
      throw new Error(data.error || 'OCR processing failed');
    }

    return data.result;
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
   * Uses content-aware detection instead of fixed percentages
   */
  private calculateReceiptZones(
    lineGroups: Array<Array<any>>,
    plainLines: string[]
  ): { headerEnd: number; footerStart: number } {
    if (lineGroups.length === 0) return { headerEnd: 0, footerStart: Infinity };

    const totalLines = lineGroups.length;

    // Find first line with a price pattern (start of items)
    // Search only in first 40% to avoid false positives
    let headerEnd = 0;
    for (let i = 0; i < Math.min(totalLines, Math.floor(totalLines * 0.4)); i++) {
      const line = lineGroups[i].map(w => w.text).join(' ');
      // Look for price pattern but exclude date/time/phone lines
      if (/[£$€]?\d+\.\d{2}/.test(line) && !/date|time|tel|phone/i.test(line)) {
        headerEnd = i;
        break;
      }
    }

    // Find "TOTAL" or "TO PAY" line (start of footer)
    // Search from bottom up, only in bottom 50%
    let footerStart = totalLines;
    for (let i = totalLines - 1; i >= Math.floor(totalLines * 0.5); i--) {
      const line = plainLines[i] || '';
      if (/\b(total|to\s*pay|subtotal)\b/i.test(line)) {
        footerStart = i;
        break;
      }
    }

    // Fallback to percentage-based if content detection fails
    // Use much smaller percentages than before (10% header, 10% footer)
    if (headerEnd === 0) headerEnd = Math.floor(totalLines * 0.1);
    if (footerStart === totalLines) footerStart = Math.floor(totalLines * 0.9);

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

    // NOTE: Removed category word rejection (food, beverage, etc) as these appear in product names

    // ACCEPT: Has at least some letters (allow numbers mixed with letters)
    if (/[A-Za-z]/.test(description)) return true;

    // REJECT: Everything else (pure numbers, punctuation)
    return false;
  }

  /**
   * Helper: Parse receipt using spatial information from Vision API
   * Implements Req 6.3
   * Enhanced for UK supermarkets: Lidl, Tesco, Sainsbury's, Co-op
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

    // Detect store type for store-specific parsing
    const store = this.detectStore(text);

    // Extract date (common formats: MM/DD/YYYY, DD-MM-YYYY, DD'MMM'YY, etc.)
    const dateRegex = /\b(\d{1,2}[\/\-\.'\s](?:\d{1,2}|[A-Za-z]{3})[\/\-\.'\s]\d{2,4})\b/;
    const dateMatch = text.match(dateRegex);
    const purchaseDate = dateMatch ? dateMatch[0] : null;

    // Detect currency (£, $, €, etc.)
    let currency = 'USD';
    if (text.includes('£') || /GBP|UK|Premier Inn|Tesco|Sainsbury|Lidl|Co-op/i.test(text)) {
      currency = 'GBP';
    } else if (text.includes('€') || /EUR/i.test(text)) {
      currency = 'EUR';
    }

    // Extract words with spatial coordinates
    const words = this.extractWordsWithCoordinates(textAnnotations);

    // Group words into lines based on Y-coordinate
    const lineGroups = this.groupWordsIntoLines(words);

    // Find total amount by looking for "Total", "Subtotal", or rightmost price in footer
    let totalAmount: number | null = null;
    let subtotal: number | null = null;

    // Strategy 1: Look for line with "Total" or "Subtotal" keyword
    for (const line of plainLines) {
      if (/\b(total|to\s*pay)\b/i.test(line) && !/\bsub\s*total\b/i.test(line)) {
        const priceMatch = line.match(/[£$€]?\s*(\d{1,4}\.\d{2})\b/);
        if (priceMatch) {
          const amount = parseFloat(priceMatch[1]);
          if (amount > 0 && amount < 1000) {
            totalAmount = amount;
          }
        }
      }
      if (/\b(subtotal|sub\s*total)\b/i.test(line)) {
        const priceMatch = line.match(/[£$€]?\s*(\d{1,4}\.\d{2})\b/);
        if (priceMatch) {
          subtotal = parseFloat(priceMatch[1]);
        }
      }
    }

    // Strategy 2: If no total found, use largest reasonable price
    if (totalAmount === null) {
      const reasonablePrices: number[] = [];
      words.forEach(word => {
        const priceMatch = word.text.match(/^[£$€]?\s*(\d{1,3}\.\d{2})$/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          if (price > 0 && price < 1000) {
            reasonablePrices.push(price);
          }
        }
      });
      totalAmount = reasonablePrices.length > 0 ? Math.max(...reasonablePrices) : null;
    }

    // Extract discounts
    const discounts: ReceiptDiscount[] = [];
    for (const line of plainLines) {
      // Look for negative amounts (discounts)
      const negMatch = line.match(/^(.+?)\s+(-\d+\.?\d*)$/);
      if (negMatch) {
        const desc = negMatch[1].trim();
        const amount = parseFloat(negMatch[2]);

        // Determine discount type
        let type: ReceiptDiscount['type'] = 'other';
        if (/coupon/i.test(desc)) type = 'coupon';
        else if (/price\s*cut/i.test(desc)) type = 'price_cut';
        else if (/clubcard|nectar|lidl\s*plus|member/i.test(desc)) type = 'loyalty';
        else if (/off|discount|saving/i.test(desc)) type = 'promotion';

        discounts.push({ description: desc, amount, type });
      }
    }
    const totalDiscount = discounts.length > 0
      ? discounts.reduce((sum, d) => sum + d.amount, 0)
      : null;

    // Extract VAT breakdown (store-specific)
    const vatBreakdown: VATBreakdownItem[] = [];

    if (store === 'lidl') {
      // Lidl format: "A 0% 56.21 0.00"
      for (const line of plainLines) {
        const vatMatch = line.match(this.VAT_LIDL);
        if (vatMatch) {
          vatBreakdown.push({
            code: vatMatch[1],
            rate: parseInt(vatMatch[2]),
            salesAmount: parseFloat(vatMatch[3]),
            vatAmount: parseFloat(vatMatch[4]),
          });
        }
      }
    } else {
      // Tesco/Sainsbury's/Co-op: Count items with asterisk
      let vatableTotal = 0;
      for (const line of plainLines) {
        if (this.VAT_ASTERISK.test(line)) {
          const priceMatch = line.match(/(\d+\.?\d{2})\s*\*?$/);
          if (priceMatch) {
            vatableTotal += parseFloat(priceMatch[1]);
          }
        }
      }
      if (vatableTotal > 0) {
        const vatAmount = vatableTotal / 6; // 20% VAT = divide by 6
        vatBreakdown.push({
          code: '*',
          rate: 20,
          salesAmount: vatableTotal - vatAmount,
          vatAmount: Math.round(vatAmount * 100) / 100,
        });
      }
    }

    // Extract line items using spatial data
    const lineItems: ReceiptLineItem[] = [];
    // Removed "food", "soft", "beverage", "alcohol", "service" - these appear in product names
    const skipKeywords = /^(VAT|total|subtotal|sub|tax|balance|due|card|visa|mastercard|amex|receipt|thank|cashier|server|table|tbl|chk|check|guest|gst|cover|change|payment|date|time|tel|phone|address|street|road|lane|ave|avenue|www\.|http|store|manager|customer|tender|cash|credit|debit|to\s*pay|amount|paid|payable)/i;

    // Calculate zones to skip header/footer (content-aware)
    const { headerEnd, footerStart } = this.calculateReceiptZones(lineGroups, plainLines);
    const receiptWidth = Math.max(...words.map(w => w.x + w.width), 1);

    // Track multi-line items
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

      // Skip if it's a discount line (already processed)
      if (/^.+\s+-\d+\.?\d*$/.test(lineText)) {
        pendingDescription = '';
        continue;
      }

      // Skip header/footer lines by keyword
      if (lineText.length < 2 || skipKeywords.test(lineText.trim())) {
        pendingDescription = '';
        continue;
      }

      // Skip VAT category lines
      if (/^[A-Z]{1,2}\d*\s+\d+\s*%?\s+[\d.]+\s+[\d.]+$/.test(lineText)) {
        pendingDescription = '';
        continue;
      }

      // Skip transaction metadata
      if (/\b(tbl|table|check|chk|guest|gst|cover)\s*\d+/i.test(lineText)) {
        pendingDescription = '';
        continue;
      }

      // Find price on this line (rightmost, right-aligned)
      // Lowered threshold from 0.5 to 0.35 to catch more prices
      const priceWord = lineWords
        .filter(w => {
          const isPricePattern = /^[£$€]?\s*\d+\.?\d{0,2}$/.test(w.text);
          const isRightAligned = (w.x / receiptWidth) > 0.35;
          return isPricePattern && isRightAligned;
        })
        .sort((a, b) => b.x - a.x)[0];

      if (priceWord) {
        const priceMatch = priceWord.text.match(/(\d+\.?\d{0,2})/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);

          if (price <= 0 || price > 1000) continue;

          // Description is everything left of the price
          const descriptionWords = lineWords.filter(w => w.x < priceWord.x);
          let description = descriptionWords.map(w => w.text).join(' ').trim();

          if (pendingDescription) {
            description = pendingDescription + ' ' + description;
            pendingDescription = '';
          }

          // Extract quantity and unit price BEFORE cleaning description
          let quantity: number | null = null;
          let unitPrice: number | null = null;

          // Check for "2 x £1.95" pattern
          const qtyMatch = description.match(this.QTY_MULTIPLIER);
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1]);
            unitPrice = parseFloat(qtyMatch[2]);
            // Remove quantity pattern from description
            description = description.replace(this.QTY_MULTIPLIER, '').trim();
          }

          // Check for weight pattern "0.990 kg @ £0.90/kg" - don't set quantity for weight
          const weightMatch = description.match(this.QTY_WEIGHT);
          if (weightMatch) {
            // For weight-based items, just clean up the description
            description = description.replace(this.QTY_WEIGHT, '').trim();
          }

          // Clean up description
          description = description.replace(/^\d{6,}\s+/, ''); // Remove item codes
          description = description.replace(/^SKU\d+\s+/i, ''); // Remove SKU
          description = description.replace(/^\d+\s+/, ''); // Remove standalone numbers

          // Extract VAT code (A, B, or *)
          let vatCode: string | null = null;
          const vatCodeMatch = description.match(/\s+([AB*])$/);
          if (vatCodeMatch) {
            vatCode = vatCodeMatch[1];
            description = description.replace(/\s+[AB*]$/, '');
          }

          // VALIDATION: Check if valid product line
          if (!this.isValidProductLine(description, price, lineText)) continue;

          lineItems.push({
            description: description.trim(),
            quantity,
            unitPrice,
            price,
            vatCode,
          });
        }
      } else {
        // No price - might be continuation
        if (lineText.length > 2 && !/^\d+$/.test(lineText) && !skipKeywords.test(lineText)) {
          let cleanText = lineText.replace(/^\d{6,}\s+/, '');
          cleanText = cleanText.replace(/^SKU\d+\s+/i, '');

          if (cleanText.length > 2) {
            pendingDescription = pendingDescription ? pendingDescription + ' ' + cleanText : cleanText;
          }
        }
      }
    }

    // Fallback: If spatial parsing yielded no items, try plain text parsing
    if (lineItems.length === 0) {
      const fallbackItems = this.fallbackPlainTextParsing(plainLines, store);
      lineItems.push(...fallbackItems);
    }

    // Calculate confidence with UK-specific bonuses
    let confidence = 50;
    if (merchantName) confidence += 15;
    if (purchaseDate) confidence += 15;
    if (totalAmount) confidence += 10;
    if (lineItems.length > 0) confidence += 10;
    if (currency === 'GBP') confidence += 5;
    if (vatBreakdown.length > 0) confidence += 5;
    if (discounts.length > 0) confidence += 3;
    if (store !== 'other') confidence += 5;

    return {
      merchantName,
      purchaseDate,
      totalAmount,
      subtotal,
      currency,
      lineItems,
      discounts,
      totalDiscount,
      vatBreakdown,
      store,
      extractedAt: Date.now(),
      confidence: Math.min(confidence, 100),
    };
  }

  /**
   * Fallback: Parse receipt using plain text when spatial parsing fails
   * Simpler regex-based approach that works on raw text lines
   */
  private fallbackPlainTextParsing(
    plainLines: string[],
    store: 'lidl' | 'tesco' | 'sainsburys' | 'coop' | 'other'
  ): ReceiptLineItem[] {
    const items: ReceiptLineItem[] = [];
    const skipKeywords = /^(VAT|total|subtotal|sub|tax|balance|due|card|visa|mastercard|amex|receipt|thank|cashier|change|payment|date|time|tel|phone|address|www\.|http|store|manager|customer|tender|cash|credit|debit|to\s*pay|amount|paid|payable)/i;

    for (const line of plainLines) {
      // Skip short lines and header/footer keywords
      if (line.length < 5 || skipKeywords.test(line.trim())) continue;

      // Skip VAT summary lines
      if (/^[A-Z]\s+\d+\s*%\s+[\d.]+\s+[\d.]+$/.test(line)) continue;

      // Look for pattern: description followed by price
      // Tesco/Sainsbury's format: "PRODUCT NAME    1.99" or "PRODUCT NAME    1.99 *"
      const priceMatch = line.match(/^(.+?)\s+([£$€]?\s*\d+\.\d{2})\s*\*?$/);
      if (priceMatch) {
        let description = priceMatch[1].trim();
        const priceStr = priceMatch[2].replace(/[£$€\s]/g, '');
        const price = parseFloat(priceStr);

        // Validate price is reasonable
        if (price <= 0 || price > 500) continue;

        // Clean up description
        description = description.replace(/^\d{6,}\s+/, ''); // Remove item codes
        description = description.replace(/^SKU\d+\s+/i, ''); // Remove SKU

        // Skip if description is too short after cleanup
        if (description.length < 3) continue;

        // Skip if it looks like a total/subtotal line
        if (/\b(total|subtotal|balance|change)\b/i.test(description)) continue;

        // Extract quantity if present (e.g., "2 x £1.99")
        let quantity: number | null = null;
        let unitPrice: number | null = null;
        const qtyMatch = description.match(/^(\d+)\s*[x×]\s*[£$€]?([\d.]+)\s*/i);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1]);
          unitPrice = parseFloat(qtyMatch[2]);
          description = description.replace(/^\d+\s*[x×]\s*[£$€]?[\d.]+\s*/i, '').trim();
        }

        // Extract VAT code if present
        let vatCode: string | null = null;
        if (/\s+[AB*]$/.test(description)) {
          vatCode = description.slice(-1);
          description = description.slice(0, -1).trim();
        }

        items.push({
          description: description.trim(),
          quantity,
          unitPrice,
          price,
          vatCode,
        });
      }
    }

    return items;
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

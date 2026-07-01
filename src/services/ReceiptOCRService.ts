import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptData, ReceiptLineItem, OCRResult } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';
import ImageStorageManager from './ImageStorageManager';
import { sanitizeText } from '../utils/sanitize';
import { toFileUri } from '../utils/uri';

const OCR_SERVER_URL_KEY = '@ocr_server_url';
const DEFAULT_OCR_SERVER_URL = 'https://sinful1-receipt-ocr.hf.space';

/**
 * Upper bound on the server round-trip. PaddleOCR cold-start can take
 * ~20s when the model isn't resident; warm requests are a few seconds.
 * 120s is generous for cold-start without letting a truly stuck request
 * spinner the UI indefinitely.
 */
const OCR_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Parse a numeric string from the OCR server into a money-valued number.
 * Returns null for empty, non-finite, or unparseable input. Rounds to 2dp
 * so discount arithmetic downstream doesn't accumulate float noise.
 * Accepts negatives (used for discount rows).
 */
function parseNumber(input: string | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const n = parseFloat(input);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Response shape from our self-hosted PaddleOCR server (POST /ocr).
 */
interface OCRServerResponse {
  merchant_name: string | null;
  store_location: string | null;
  date: string | null;
  line_items: Array<{
    description: string | null;
    quantity: number;
    unit_price: string;
    total_price: string;
    discount: string | null;
    needs_review?: boolean;
  }>;
  subtotal: string | null;
  savings: string | null;
  total: string | null;
  // Receipt-level anomalies (item_index: null) alongside the per-item
  // needs_review flags above — e.g. no_items, no_total.
  anomalies?: Array<{ type: string; item_index: number | null }>;
}

/**
 * ReceiptOCRService
 *
 * Sends receipt images to our self-hosted PaddleOCR server for processing.
 * Replaces the previous Google Cloud Vision approach — no API keys,
 * no cloud costs, runs on Oracle Cloud free tier or local network.
 */
class ReceiptOCRService {
  /**
   * Get the configured OCR server URL.
   */
  async getServerUrl(): Promise<string> {
    const stored = await AsyncStorage.getItem(OCR_SERVER_URL_KEY);
    return stored ?? DEFAULT_OCR_SERVER_URL;
  }

  /**
   * Return the raw stored URL without falling back to the default.
   * Returns null when the user hasn't overridden the default.
   */
  async getStoredServerUrl(): Promise<string | null> {
    return AsyncStorage.getItem(OCR_SERVER_URL_KEY);
  }

  async clearServerUrl(): Promise<void> {
    await AsyncStorage.removeItem(OCR_SERVER_URL_KEY);
  }

  /**
   * Save the OCR server URL.
   */
  async setServerUrl(url: string): Promise<void> {
    const cleaned = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cleaned)) {
      throw new Error('OCR server URL must start with http:// or https://');
    }
    await AsyncStorage.setItem(OCR_SERVER_URL_KEY, cleaned);
  }

  /**
   * Check if the OCR server is reachable and the model is loaded.
   */
  async checkHealth(): Promise<{ ok: boolean; modelLoaded: boolean }> {
    const serverUrl = await this.getServerUrl();
    if (!serverUrl) {
      return { ok: false, modelLoaded: false };
    }

    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return { ok: false, modelLoaded: false };
      }

      const data = await response.json();
      return { ok: true, modelLoaded: data.model_loaded === true };
    } catch {
      return { ok: false, modelLoaded: false };
    }
  }

  /**
   * Extract receipt data from an image without persisting.
   * Forwards AbortSignal to fetch for cancellation support.
   */
  async extractReceipt(localFilePath: string, signal?: AbortSignal): Promise<OCRResult> {
    const serverUrl = await this.getServerUrl();

    // Compose the caller's AbortSignal with a local timeout so a stuck
    // server round-trip surfaces as an actionable error instead of an
    // indefinite spinner. If the caller aborts first, the timeout is a no-op.
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), OCR_REQUEST_TIMEOUT_MS);
    const onCallerAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onCallerAbort);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: toFileUri(localFilePath),
        type: 'image/jpeg',
        name: 'receipt.jpg',
      } as any);

      const response = await fetch(`${serverUrl}/ocr`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          receiptData: null,
          totalAmount: null,
          merchantName: null,
          purchaseDate: null,
          currency: null,
          confidence: 0,
          error: `OCR server error (${response.status}): ${errorText}`,
          apiUsageCount: 0,
        };
      }

      const serverData: OCRServerResponse = await response.json();
      const mapped = this.mapToReceiptData(serverData);
      const { receiptData, totalAmount, merchantName, purchaseDate, currency } = mapped;
      const success = receiptData.lineItems.length > 0;
      const lowConfidence = receiptData.confidence < 60;

      return {
        success,
        receiptData,
        totalAmount,
        merchantName,
        purchaseDate,
        currency,
        confidence: receiptData.confidence,
        error: !success
          ? 'No items detected — please retake the photo'
          : lowConfidence
            ? 'Low confidence result — please verify'
            : null,
        apiUsageCount: 0,
      };
    } catch (error: any) {
      // Caller-initiated abort: re-throw so the caller (e.g. React cleanup)
      // can ignore it. Timeout-initiated abort: surface a distinct message.
      if (signal?.aborted) throw error;

      const timedOut = error?.name === 'AbortError';
      return {
        success: false,
        receiptData: null,
        totalAmount: null,
        merchantName: null,
        purchaseDate: null,
        currency: null,
        confidence: 0,
        error: timedOut
          ? 'OCR server took too long — try again in a moment'
          : error.message || 'Failed to process receipt',
        apiUsageCount: 0,
      };
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  /**
   * Process a receipt image: extract OCR data and persist to the list.
   */
  async processReceipt(localFilePath: string, listId: string): Promise<OCRResult> {
    const result = await this.extractReceipt(localFilePath);

    if (result.receiptData) {
      await ShoppingListManager.updateList(listId, {
        receiptData: result.receiptData,
        totalAmount: result.totalAmount,
        merchantName: result.merchantName,
        purchaseDate: result.purchaseDate,
        currency: result.currency,
      });
    }

    return result;
  }

  /**
   * Retry OCR for an existing list.
   */
  async retryOCR(listId: string): Promise<OCRResult> {
    const list = await LocalStorageManager.getList(listId);
    if (!list || !list.receiptUrl) {
      return {
        success: false,
        receiptData: null,
        confidence: 0,
        error: 'No receipt image found for this list',
        apiUsageCount: 0,
        totalAmount: null,
        merchantName: null,
        purchaseDate: null,
        currency: null,
      };
    }

    // After upload, receiptUrl holds the Cloud Storage path
    // ("receipts/{group}/{list}/...") instead of the local capture file —
    // fetch it back to cache before re-running OCR.
    let filePath = list.receiptUrl;
    if (filePath.startsWith('receipts/')) {
      try {
        filePath = await ImageStorageManager.downloadReceiptToCache(filePath, listId);
      } catch (error: any) {
        return {
          success: false,
          receiptData: null,
          confidence: 0,
          error: error.message || 'Could not download the receipt image',
          apiUsageCount: 0,
          totalAmount: null,
          merchantName: null,
          purchaseDate: null,
          currency: null,
        };
      }
    }

    return this.processReceipt(filePath, listId);
  }

  /**
   * Map the server's snake_case response to the app's ReceiptData type.
   */
  private mapToReceiptData(data: OCRServerResponse): { receiptData: ReceiptData; totalAmount: number | null; merchantName: string | null; purchaseDate: string | null; currency: string } {
    // Previously dropped any item with no description entirely — but that's
    // exactly the case the server flags via needs_review (e.g. a price-only
    // row where OCR missed the description text). Keep it with an empty
    // description and needsReview=true so the user can see and fix it,
    // rather than silently losing a real priced item off the receipt.
    const lineItems: ReceiptLineItem[] = (data.line_items || [])
      .map(item => ({
        description: item.description ? sanitizeText(item.description, 200) : '',
        quantity: item.quantity ?? null,
        unitPrice: parseNumber(item.unit_price),
        price: parseNumber(item.total_price),
        vatCode: null,
        needsReview: item.needs_review === true,
      }));

    const totalAmount = parseNumber(data.total);
    const subtotal = parseNumber(data.subtotal);

    const discounts = (data.line_items || [])
      .map(item => ({ raw: parseNumber(item.discount), desc: item.description }))
      .filter((d): d is { raw: number; desc: string | null } => d.raw !== null)
      .map(({ raw, desc }) => ({
        description: desc || 'Discount',
        amount: raw,
        type: 'loyalty' as const,
      }));

    const totalDiscount = parseNumber(data.savings);

    // Confidence scored on real evidence only — no base padding.
    // Line items are the headline signal; everything else is corroboration.
    let confidence = 0;
    if (lineItems.length > 0) confidence += 50;
    if (totalAmount !== null) confidence += 20;
    if (data.merchant_name) confidence += 15;
    if (data.date) confidence += 10;
    if (subtotal !== null) confidence += 5;

    const merchantName = data.merchant_name ? sanitizeText(data.merchant_name, 100) : null;
    const store = this.detectStore(merchantName);

    return {
      totalAmount,
      merchantName,
      purchaseDate: data.date,
      currency: 'GBP',
      receiptData: {
        subtotal,
        lineItems,
        discounts,
        totalDiscount,
        vatBreakdown: [],
        store,
        extractedAt: Date.now(),
        confidence: Math.min(confidence, 100),
      },
    };
  }

  private detectStore(merchantName: string | null | undefined): ReceiptData['store'] {
    if (!merchantName) return null;
    const name = merchantName.toUpperCase();
    if (name.includes('LIDL')) return 'lidl';
    if (name.includes('TESCO')) return 'tesco';
    if (name.includes('SAINSBURY')) return 'sainsburys';
    if (name.includes('CO-OP') || name.includes('COOP')) return 'coop';
    return 'other';
  }
}

export default new ReceiptOCRService();

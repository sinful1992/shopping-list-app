import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptData, ReceiptLineItem, OCRResult } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';

const OCR_SERVER_URL_KEY = '@ocr_server_url';

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
  }>;
  subtotal: string | null;
  savings: string | null;
  total: string | null;
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
  async getServerUrl(): Promise<string | null> {
    return AsyncStorage.getItem(OCR_SERVER_URL_KEY);
  }

  /**
   * Save the OCR server URL.
   */
  async setServerUrl(url: string): Promise<void> {
    // Trim trailing slash
    const cleaned = url.replace(/\/+$/, '');
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
    if (!serverUrl) {
      return {
        success: false,
        receiptData: null,
        confidence: 0,
        error: 'OCR server URL not configured. Set it in Settings.',
        apiUsageCount: 0,
      };
    }

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath}`,
        type: 'image/jpeg',
        name: 'receipt.jpg',
      } as any);

      const response = await fetch(`${serverUrl}/ocr`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          receiptData: null,
          confidence: 0,
          error: `OCR server error (${response.status}): ${errorText}`,
          apiUsageCount: 0,
        };
      }

      const serverData: OCRServerResponse = await response.json();
      const receiptData = this.mapToReceiptData(serverData);
      const success = receiptData.lineItems.length > 0;
      const lowConfidence = receiptData.confidence < 60;

      return {
        success,
        receiptData,
        confidence: receiptData.confidence,
        error: !success
          ? 'No items detected — please retake the photo'
          : lowConfidence
            ? 'Low confidence result — please verify'
            : null,
        apiUsageCount: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        receiptData: null,
        confidence: 0,
        error: error.message || 'Failed to process receipt',
        apiUsageCount: 0,
      };
    }
  }

  /**
   * Process a receipt image: extract OCR data and persist to the list.
   */
  async processReceipt(localFilePath: string, listId: string): Promise<OCRResult> {
    const result = await this.extractReceipt(localFilePath);

    if (result.receiptData) {
      await ShoppingListManager.updateList(listId, { receiptData: result.receiptData });
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
      };
    }

    return this.processReceipt(list.receiptUrl, listId);
  }

  /**
   * Map the server's snake_case response to the app's ReceiptData type.
   */
  private mapToReceiptData(data: OCRServerResponse): ReceiptData {
    const lineItems: ReceiptLineItem[] = (data.line_items || [])
      .filter(item => item.description)
      .map(item => ({
        description: item.description!,
        quantity: item.quantity ?? null,
        unitPrice: parseNumber(item.unit_price),
        price: parseNumber(item.total_price),
        vatCode: null,
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

    const store = this.detectStore(data.merchant_name);

    return {
      merchantName: data.merchant_name,
      purchaseDate: data.date,
      totalAmount,
      subtotal,
      currency: 'GBP',
      lineItems,
      discounts,
      totalDiscount,
      vatBreakdown: [],
      store,
      extractedAt: Date.now(),
      confidence: Math.min(confidence, 100),
    };
  }

  private detectStore(merchantName: string | null): ReceiptData['store'] {
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

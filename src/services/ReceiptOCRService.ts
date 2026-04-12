import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptData, ReceiptLineItem, OCRResult } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';

const OCR_SERVER_URL_KEY = '@ocr_server_url';

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
   * Process a receipt image and return structured data.
   *
   * @param localFilePath Path to the receipt image on device
   * @param listId Shopping list ID to save results against
   */
  async processReceipt(localFilePath: string, listId: string): Promise<OCRResult> {
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
      // Read image file as base64, then convert to blob for multipart upload
      const cleanPath = localFilePath.replace('file://', '');
      const base64 = await RNFS.readFile(cleanPath, 'base64');

      // Build multipart form data
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

      // Save receipt data and trigger sync
      await ShoppingListManager.updateList(listId, { receiptData });

      return {
        success: receiptData.confidence >= 50,
        receiptData,
        confidence: receiptData.confidence,
        error: receiptData.confidence < 50 ? 'Low confidence result - please verify' : null,
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
        unitPrice: item.unit_price ? parseFloat(item.unit_price) : null,
        price: item.total_price ? parseFloat(item.total_price) : null,
        vatCode: null,
      }));

    const totalAmount = data.total ? parseFloat(data.total) : null;
    const subtotal = data.subtotal ? parseFloat(data.subtotal) : null;

    // Build discounts from line items that have them
    const discounts = (data.line_items || [])
      .filter(item => item.discount)
      .map(item => ({
        description: item.description || 'Discount',
        amount: parseFloat(item.discount!),
        type: 'loyalty' as const,
      }));

    const totalDiscount = data.savings ? parseFloat(data.savings) : null;

    // Calculate confidence based on what was detected
    let confidence = 50;
    if (data.merchant_name) confidence += 15;
    if (data.date) confidence += 10;
    if (totalAmount) confidence += 10;
    if (lineItems.length > 0) confidence += 15;
    if (subtotal) confidence += 5;

    // Detect store from merchant name
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

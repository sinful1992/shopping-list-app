/**
 * The scan request carries the list as `hints` (receipt-ocr >= 1.2.0), and
 * the response's sum check comes back as per-line flags and a confidence
 * signal. Older servers send none of it, and nothing changes for them.
 */
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ImageStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ocrHints', () => ({ __esModule: true, buildOcrHints: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@react-native-firebase/auth';
import ReceiptOCRService from '../ReceiptOCRService';

const line = (desc: string, price: string, extra: Record<string, unknown> = {}) => ({
  description: desc, quantity: 1, unit_price: price, total_price: price, discount: null, ...extra,
});

function response(overrides: Record<string, unknown> = {}) {
  return {
    merchant_name: 'COSTCO',
    store_location: null,
    date: '2026-07-28',
    line_items: [line('HLMAN MAYO', '5.99'), line('KS BAGUETTE', '2.49')],
    subtotal: '8.48',
    savings: null,
    total: '8.48',
    anomalies: [],
    ...overrides,
  };
}

function mockFetch(body: unknown) {
  const fn = jest.fn().mockResolvedValue({ ok: true, json: async () => body });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function bodyField(body: unknown, name: string): unknown {
  const anyBody = body as any;
  if (anyBody && typeof anyBody.get === 'function') return anyBody.get(name) ?? undefined;
  return (anyBody?._parts as Array<[string, unknown]>).find(([key]) => key === name)?.[1];
}

const HINTS = { store: 'Costco', items: [{ name: 'mayo', lastPrice: 5.49 }] };

describe('ReceiptOCRService hints and sum check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (getAuth as jest.Mock).mockReturnValue({ currentUser: { uid: 'test-uid' } });
  });

  it('sends the list as a hints part when given one', async () => {
    const fetchMock = mockFetch(response());
    await ReceiptOCRService.extractReceipt('/tmp/r.jpg', undefined, HINTS);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(bodyField(init?.body, 'hints') as string)).toEqual(HINTS);
  });

  it('sends no hints part without a list, or with an empty one', async () => {
    const fetchMock = mockFetch(response());
    await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    await ReceiptOCRService.extractReceipt('/tmp/r.jpg', undefined, { store: null, items: [] });
    for (const [, init] of fetchMock.mock.calls) {
      expect(bodyField(init?.body, 'hints')).toBeUndefined();
    }
  });

  it('maps needs_check and corrected_from onto the line', async () => {
    mockFetch(response({
      line_items: [
        line('HLMAN MAYO', '5.99', { needs_check: true }),
        line('170642', '-2.00', { corrected_from: '2.00' }),
      ],
      subtotal: '3.99',
      total: '3.99',
      arithmetic: { closes: true, residual: 0, corrections: 1 },
    }));
    const result = await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    const [mayo, coupon] = result.receiptData!.lineItems;
    expect(mayo.needsCheck).toBe(true);
    expect(mayo.correctedFrom).toBeNull();
    expect(coupon.needsCheck).toBe(false);
    expect(coupon.correctedFrom).toBe(2);
    expect(coupon.price).toBe(-2);
  });

  it('an old server response maps with no flags', async () => {
    mockFetch(response());
    const result = await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    for (const item of result.receiptData!.lineItems) {
      expect(item.needsCheck).toBe(false);
      expect(item.correctedFrom).toBeNull();
    }
  });

  it('trusts the server sum check when it had something to check against', async () => {
    // Tesco: items add to the subtotal, a savings block takes the total down.
    // The app's own items-to-total check can't see that; the server's can.
    mockFetch(response({
      merchant_name: 'TESCO',
      line_items: [line('MILK', '1.50'), line('EGGS', '1.80')],
      subtotal: '3.30',
      savings: '-0.35',
      total: '2.95',
      arithmetic: { closes: true, residual: 0, corrections: 0 },
    }));
    const result = await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    expect(result.confidence).toBe(100);
  });

  it('caps confidence when the server says the sum does not close', async () => {
    mockFetch(response({ arithmetic: { closes: false, residual: 0.5, corrections: 0 } }));
    const result = await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    expect(result.confidence).toBeLessThanOrEqual(50);
  });

  it('falls back to its own check when the server had no anchor', async () => {
    mockFetch(response({
      subtotal: null,
      total: '9.00',
      arithmetic: { closes: false, residual: null, corrections: 0 },
    }));
    const result = await ReceiptOCRService.extractReceipt('/tmp/r.jpg');
    expect(result.confidence).toBeLessThanOrEqual(50);
  });
});

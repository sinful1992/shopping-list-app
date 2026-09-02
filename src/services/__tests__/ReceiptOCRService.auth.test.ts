/**
 * Guards the OCR request path after the shared secret was removed from the
 * bundle. The old build shipped a static X-OCR-Key that anyone could read out
 * of the public repo or the APK; scans now go through the ocr-proxy edge
 * function on a Firebase ID token, and the secret never leaves the server.
 *
 * The assertions that matter: no request ever carries X-OCR-Key, and the
 * local-dev override still reaches a dev server directly.
 */
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ImageStorageManager', () => ({ __esModule: true, default: {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@react-native-firebase/auth';
import ReceiptOCRService from '../ReceiptOCRService';

const okResponse = {
  merchant_name: 'TESCO',
  store_location: null,
  date: '2026-09-01',
  line_items: [
    { description: 'MILK', quantity: 1, unit_price: '1.20', total_price: '1.20', discount: null },
  ],
  subtotal: '1.20',
  savings: null,
  total: '1.20',
  anomalies: [],
};

function mockFetch() {
  const fn = jest.fn().mockResolvedValue({ ok: true, json: async () => okResponse });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function lastCall(fn: jest.Mock): { url: string; headers: Record<string, string> } {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1];
  return { url: String(url), headers: (init?.headers ?? {}) as Record<string, string> };
}

describe('ReceiptOCRService request auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (getAuth as jest.Mock).mockReturnValue({ currentUser: { uid: 'test-uid' } });
  });

  it('sends scans to the ocr-proxy edge function with a Firebase ID token', async () => {
    const fetchMock = mockFetch();

    await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    const { url, headers } = lastCall(fetchMock);
    expect(url).toContain('/functions/v1/ocr-proxy');
    expect(headers['X-Firebase-Token']).toBe('test-id-token');
    expect(headers['Authorization']).toMatch(/^Bearer /);
  });

  it('never sends the retired shared secret on any path', async () => {
    const fetchMock = mockFetch();

    await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('http://192.168.1.50:8000');
    await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['X-OCR-Key']).toBeUndefined();
    }
  });

  it('honours a stored server URL by calling that server directly', async () => {
    const fetchMock = mockFetch();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('http://192.168.1.50:8000');

    await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    const { url, headers } = lastCall(fetchMock);
    expect(url).toBe('http://192.168.1.50:8000/ocr');
    expect(headers['X-Firebase-Token']).toBeUndefined();
  });

  it('fails with a readable error when signed out and using the proxy', async () => {
    const fetchMock = mockFetch();
    (getAuth as jest.Mock).mockReturnValue({ currentUser: null });

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

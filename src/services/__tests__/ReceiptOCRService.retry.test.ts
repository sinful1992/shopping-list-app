/**
 * Retrying OCR reads the receipt the list's data came from. Until a rescan
 * has uploaded, the list still shows the image it replaces, so the retry
 * reads this phone's pending capture instead.
 */
const mockGetList = jest.fn();
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: (...args: unknown[]) => mockGetList(...args) },
}));
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: {} }));
const mockPendingCapture = jest.fn();
const mockDownload = jest.fn();
jest.mock('../ImageStorageManager', () => ({
  __esModule: true,
  default: {
    pendingCapture: (...args: unknown[]) => mockPendingCapture(...args),
    downloadReceiptToCache: (...args: unknown[]) => mockDownload(...args),
  },
}));
jest.mock('../ocrHints', () => ({ __esModule: true, buildOcrHints: jest.fn() }));

import ReceiptOCRService from '../ReceiptOCRService';

const OLD = 'receipts/fg-1/l1/1000.jpg';

describe('ReceiptOCRService.retryOCR', () => {
  let processReceipt: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetList.mockResolvedValue({ id: 'l1', receiptUrl: OLD });
    mockDownload.mockResolvedValue('/cache/ocr-retry-l1.jpg');
    processReceipt = jest.spyOn(ReceiptOCRService, 'processReceipt').mockResolvedValue({ success: true } as any);
  });

  it('reads a rescan still waiting to upload, not the image it replaces', async () => {
    mockPendingCapture.mockResolvedValue('/cache/b.jpg');
    await ReceiptOCRService.retryOCR('l1');

    expect(mockDownload).not.toHaveBeenCalled();
    expect(processReceipt).toHaveBeenCalledWith('/cache/b.jpg', 'l1');
  });

  it('downloads the uploaded receipt when nothing is pending', async () => {
    mockPendingCapture.mockResolvedValue(null);
    await ReceiptOCRService.retryOCR('l1');

    expect(mockDownload).toHaveBeenCalledWith(OLD, 'l1');
    expect(processReceipt).toHaveBeenCalledWith('/cache/ocr-retry-l1.jpg', 'l1');
  });
});

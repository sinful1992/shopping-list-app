/**
 * Receipt captures are queued and uploaded so the rest of the family can see
 * them. These pin the queue's rules: upload under the list's own group, skip
 * a list that was discarded or rescanned since, retry a failure, and never
 * run two passes at once.
 */

const mockStore: Record<string, string> = {};
jest.mock('../SecureStorage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  },
}));

let mockConnected: boolean | null = true;
const mockNetListeners: Array<(s: { isConnected: boolean | null }) => void> = [];
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: mockConnected })),
    addEventListener: jest.fn((cb: (s: { isConnected: boolean | null }) => void) => {
      mockNetListeners.push(cb);
      return jest.fn();
    }),
  },
}));
const setConnected = (connected: boolean) => {
  mockConnected = connected;
  mockNetListeners.forEach(cb => cb({ isConnected: connected }));
};

const mockPutFile = jest.fn();
const mockDeleteObject = jest.fn().mockResolvedValue(undefined);
// Every @react-native-firebase/* package maps to one stub file (jest.config
// moduleNameMapper), so storage and app share this one mock.
jest.mock('@react-native-firebase/storage', () => ({
  utils: { FilePath: { CACHES_DIRECTORY: '/cache' } },
  getStorage: jest.fn(() => ({})),
  ref: jest.fn((_s: unknown, path: string) => ({ path })),
  putFile: (...args: unknown[]) => mockPutFile(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  getDownloadURL: jest.fn(),
  writeToFile: jest.fn(),
}));

const mockLists: Record<string, any> = {};
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: jest.fn(async (id: string) => mockLists[id] ?? null) },
}));
const mockUpdateList = jest.fn(async (id: string, patch: any) => { Object.assign(mockLists[id], patch); return mockLists[id]; });
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: (...args: unknown[]) => mockRecordError(...args) },
}));
jest.mock('../ShoppingListManager', () => ({
  __esModule: true,
  default: { updateList: (id: string, patch: any) => mockUpdateList(id, patch) },
}));

import ImageStorageManager from '../ImageStorageManager';

const QUEUE_KEY = '@upload_queue';
const queued = () => JSON.parse(mockStore[QUEUE_KEY] ?? '[]');

beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  Object.keys(mockLists).forEach(k => delete mockLists[k]);
  mockConnected = true;
  mockPutFile.mockReset();
  mockPutFile.mockImplementation(() => Promise.resolve());
  mockUpdateList.mockClear();
  mockDeleteObject.mockClear();
  mockDeleteObject.mockImplementation(() => Promise.resolve());
  mockRecordError.mockReset();
});

describe('receipt upload queue', () => {
  it('uploads under the list group and points the list at the Storage path', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'completed', receiptUrl: '/cache/scan.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');

    const result = await ImageStorageManager.processUploadQueue();

    expect(result.successCount).toBe(1);
    expect(mockPutFile.mock.calls[0][0].path).toMatch(/^receipts\/fg-1\/l1\/\d+\.jpg$/);
    expect(mockUpdateList).toHaveBeenCalledWith('l1', { receiptUrl: expect.stringMatching(/^receipts\/fg-1\/l1\//) });
    expect(queued()).toEqual([]);
  });

  it('drops a capture whose list was discarded or rescanned, without uploading', async () => {
    mockLists.gone = { id: 'gone', familyGroupId: 'fg-1', status: 'deleted', receiptUrl: '/cache/a.jpg' };
    mockLists.rescanned = { id: 'rescanned', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/new.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/a.jpg', 'gone');
    await ImageStorageManager.queueReceiptForUpload('/cache/old.jpg', 'rescanned');
    await ImageStorageManager.queueReceiptForUpload('/cache/x.jpg', 'missing');

    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it('keeps a failed upload queued with its retry counted', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    mockPutFile.mockImplementation(() => Promise.reject(new Error('403')));
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');

    const result = await ImageStorageManager.processUploadQueue();

    expect(result.failedCount).toBe(1);
    expect(queued()).toEqual([expect.objectContaining({ listId: 'l1', retryCount: 1 })]);
    expect(mockLists.l1.receiptUrl).toBe('/cache/scan.jpg');
  });

  it('a rescan during the upload deletes the stale object and leaves the list alone', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/first.jpg' };
    mockPutFile.mockImplementation(() => {
      mockLists.l1.receiptUrl = '/cache/second.jpg';
      return Promise.resolve();
    });
    await ImageStorageManager.queueReceiptForUpload('/cache/first.jpg', 'l1');

    await ImageStorageManager.processUploadQueue();

    expect(mockUpdateList).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockLists.l1.receiptUrl).toBe('/cache/second.jpg');
  });

  it('a quick scan skipped while its upload is in flight leaves no object behind', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    mockPutFile.mockImplementation(() => {
      mockLists.l1.status = 'deleted';
      return Promise.resolve();
    });
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');

    await ImageStorageManager.processUploadQueue();

    expect(mockUpdateList).not.toHaveBeenCalled();
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it('a second call during a pass never uploads the same file twice', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');

    await Promise.all([
      ImageStorageManager.processUploadQueue(),
      ImageStorageManager.processUploadQueue(),
      ImageStorageManager.processUploadQueue(),
    ]);

    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(queued()).toEqual([]);
  });

  it('a capture queued during a pass is uploaded by the follow-up pass', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/a.jpg' };
    mockLists.l2 = { id: 'l2', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/b.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/a.jpg', 'l1');

    let release!: () => void;
    mockPutFile.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    const first = ImageStorageManager.processUploadQueue();
    await new Promise(r => setImmediate(r));

    // The scan screen queues its capture and asks for a pass mid-upload.
    await ImageStorageManager.queueReceiptForUpload('/cache/b.jpg', 'l2');
    const second = ImageStorageManager.processUploadQueue();
    release();
    await first;
    const result = await second;

    expect(result.successCount).toBe(1);
    expect(mockPutFile).toHaveBeenCalledTimes(2);
    expect(mockLists.l2.receiptUrl).toMatch(/^receipts\/fg-1\/l2\//);
    expect(queued()).toEqual([]);
  });

  it('does not try, or use up retries, while offline', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');
    mockConnected = false;

    const result = await ImageStorageManager.processUploadQueue();

    expect(result.processedCount).toBe(0);
    expect(mockPutFile).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ retryCount: 0 })]);
  });

  it('a failure caused by losing the connection keeps its retries', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');
    mockPutFile.mockImplementation(() => {
      mockConnected = false;
      return Promise.reject(new Error('network'));
    });

    const result = await ImageStorageManager.processUploadQueue();

    expect(result.failedCount).toBe(0);
    expect(queued()).toEqual([expect.objectContaining({ retryCount: 0 })]);
  });

  it('runs the queue when the connection comes back', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/scan.jpg' };
    await ImageStorageManager.queueReceiptForUpload('/cache/scan.jpg', 'l1');
    mockConnected = false;
    await ImageStorageManager.processUploadQueue();
    setConnected(false);

    // Nothing but the connection returning starts this pass.
    setConnected(true);
    for (let i = 0; i < 20 && queued().length > 0; i++) {
      await new Promise(r => setImmediate(r));
    }

    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(queued()).toEqual([]);
  });
});

describe('a rescan replacing an uploaded receipt', () => {
  const OLD = 'receipts/fg-1/l1/1000.jpg';
  const deletedPaths = () => mockDeleteObject.mock.calls.map(c => c[0].path);

  beforeEach(() => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'completed', receiptUrl: OLD };
  });

  it('keeps the old receipt while the new one has not uploaded, and deletes it after', async () => {
    mockPutFile.mockImplementation(() => Promise.reject(new Error('403')));
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', { storeName: 'Tesco' });
    await ImageStorageManager.processUploadQueue();

    expect(mockLists.l1).toMatchObject({ receiptUrl: OLD, storeName: 'Tesco' });
    expect(await ImageStorageManager.pendingCapture('l1')).toBe('/cache/b.jpg');
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ filePath: '/cache/b.jpg', replacesPath: OLD })]);

    mockPutFile.mockImplementation(() => Promise.resolve());
    await ImageStorageManager.processUploadQueue();

    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(mockLists.l1.receiptUrl).not.toBe(OLD);
    expect(deletedPaths()).toEqual([OLD]);
    const pointed = mockUpdateList.mock.invocationCallOrder[mockUpdateList.mock.calls.length - 1];
    expect(pointed).toBeLessThan(mockDeleteObject.mock.invocationCallOrder[0]);
    expect(queued()).toEqual([]);
  });

  it('two rescans before the upload delete the old receipt once, after the last one uploads', async () => {
    mockConnected = false;
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    await ImageStorageManager.setListReceipt('l1', '/cache/c.jpg', {});
    expect(queued().map((q: any) => q.replacesPath)).toEqual([OLD, OLD]);

    mockConnected = true;
    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(deletedPaths()).toEqual([OLD]);
    expect(queued()).toEqual([]);
  });

  it('deletes the old receipt when the list is deleted before the rescan uploads', async () => {
    mockConnected = false;
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    mockLists.l1.status = 'deleted';

    mockConnected = true;
    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile).not.toHaveBeenCalled();
    expect(deletedPaths()).toEqual([OLD]);
    expect(queued()).toEqual([]);
  });

  it('a rescan out of retries stays queued and keeps the old receipt', async () => {
    mockPutFile.mockImplementation(() => Promise.reject(new Error('403')));
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    for (let i = 0; i < 8; i++) {
      await ImageStorageManager.processUploadQueue();
    }

    expect(mockLists.l1.receiptUrl).toBe(OLD);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ filePath: '/cache/b.jpg', replacesPath: OLD })]);

    mockPutFile.mockImplementation(() => Promise.resolve());
    await ImageStorageManager.processUploadQueue();
    expect(deletedPaths()).toEqual([OLD]);
    expect(queued()).toEqual([]);
  });

  it('a failed delete of the old receipt still finishes the upload', async () => {
    mockDeleteObject.mockImplementation(() => Promise.reject(new Error('500')));
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    const result = await ImageStorageManager.processUploadQueue();

    expect(result.successCount).toBe(1);
    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(queued()).toEqual([]);
  });

  it('other devices keep the old receipt until the rescan uploads, never a path on this phone', async () => {
    mockConnected = false;
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', { totalAmount: 12 });

    const synced = mockUpdateList.mock.calls.map(c => c[1]);
    expect(synced).toEqual([{ totalAmount: 12 }]);
    expect(mockLists.l1.receiptUrl).toBe(OLD);
  });

  it('a rescan here loses to a newer receipt synced from another phone', async () => {
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    mockLists.l1.receiptUrl = 'receipts/fg-1/l1/2000.jpg';
    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile).not.toHaveBeenCalled();
    expect(mockLists.l1.receiptUrl).toBe('receipts/fg-1/l1/2000.jpg');
    expect(deletedPaths()).not.toContain('receipts/fg-1/l1/2000.jpg');
    expect(queued()).toEqual([]);
  });

  it('a failing crash report still finishes the upload', async () => {
    mockDeleteObject.mockImplementation(() => Promise.reject(new Error('500')));
    mockRecordError.mockImplementation(() => { throw new Error('crashlytics'); });
    await ImageStorageManager.setListReceipt('l1', '/cache/b.jpg', {});
    const result = await ImageStorageManager.processUploadQueue();

    expect(result.successCount).toBe(1);
    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(queued()).toEqual([]);
  });

  it('a rescan while an upload points the list never loses the newer scan', async () => {
    mockLists.l1.receiptUrl = '/cache/b.jpg';
    await ImageStorageManager.queueReceiptForUpload('/cache/b.jpg', 'l1');
    let release!: () => void;
    mockUpdateList.mockImplementationOnce((id: string, patch: any) => new Promise(r => {
      release = () => { Object.assign(mockLists[id], patch); r(mockLists[id]); };
    }));

    const pass = ImageStorageManager.processUploadQueue();
    for (let i = 0; i < 20 && !release; i++) await new Promise(r => setImmediate(r));
    const uploaded = mockLists.l1.receiptUrl === '/cache/b.jpg' ? mockUpdateList.mock.calls[0][1].receiptUrl : null;
    const rescan = ImageStorageManager.setListReceipt('l1', '/cache/c.jpg', {});
    await new Promise(r => setImmediate(r));
    release();
    await Promise.all([pass, rescan]);

    expect(mockLists.l1.receiptUrl).toBe(uploaded);
    expect(queued()).toEqual([expect.objectContaining({ filePath: '/cache/c.jpg', replacesPath: uploaded })]);
    expect(await ImageStorageManager.pendingCapture('l1')).toBe('/cache/c.jpg');
  });
});

describe('a first scan that keeps failing', () => {
  it('stays queued past its retries, reported once, and uploads later', async () => {
    mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status: 'active', receiptUrl: '/cache/a.jpg' };
    mockPutFile.mockImplementation(() => Promise.reject(new Error('403')));
    await ImageStorageManager.queueReceiptForUpload('/cache/a.jpg', 'l1');
    for (let i = 0; i < 9; i++) {
      await ImageStorageManager.processUploadQueue();
    }

    expect(queued()).toEqual([expect.objectContaining({ filePath: '/cache/a.jpg' })]);
    expect(mockRecordError).toHaveBeenCalledTimes(1);

    mockPutFile.mockImplementation(() => Promise.resolve());
    await ImageStorageManager.processUploadQueue();
    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(queued()).toEqual([]);
  });
});

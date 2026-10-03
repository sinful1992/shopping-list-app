/**
 * Receipt captures are queued and uploaded so the rest of the family can see
 * them. These pin the queue's rules: upload under the list's own group, skip
 * a list that was discarded or rescanned since, retry a failure, and never
 * run two passes at once.
 */

const mockStore: Record<string, string> = {};
jest.mock('react-native-encrypted-storage', () => ({
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

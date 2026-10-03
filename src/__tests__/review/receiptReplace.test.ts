/**
 * Review tests for the rescan-replace rule (CONTRACT interface 1, codex P1 on
 * PR #40): the receipt a rescan replaces is deleted only once its replacement
 * is uploaded and the list points at it. Every path that drops a queue entry
 * — superseded, list deleted, failed — must end in either the old image still
 * referenced or the old image deleted, never both lost and never deleted
 * while something still needs it.
 *
 * The queue is seeded through its stored form, since `replacesPath` on the
 * entry is the interface; how the camera screen sets it is ada's.
 */

const mockStore: Record<string, string> = {};
jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: true })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

// Every Storage call in order, so "set the list, then delete" can be checked.
const mockEvents: string[] = [];
const mockPutFile = jest.fn();
const mockDeleteObject = jest.fn();
jest.mock('@react-native-firebase/storage', () => ({
  utils: { FilePath: { CACHES_DIRECTORY: '/cache' } },
  getStorage: jest.fn(() => ({})),
  ref: jest.fn((_s: unknown, path: string) => ({ path })),
  putFile: (...args: unknown[]) => mockPutFile(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  getDownloadURL: jest.fn(),
  writeToFile: jest.fn(),
}));

// Reporting is not under test; the firebase stub would throw inside it.
jest.mock('../../services/CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

const mockLists: Record<string, any> = {};
jest.mock('../../services/LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: jest.fn(async (id: string) => (mockLists[id] ? { ...mockLists[id] } : null)) },
}));
jest.mock('../../services/ShoppingListManager', () => ({
  __esModule: true,
  default: {
    updateList: jest.fn(async (id: string, patch: any) => {
      mockEvents.push(`set ${id} ${patch.receiptUrl ?? ''}`.trim());
      Object.assign(mockLists[id], patch);
      return { ...mockLists[id] };
    }),
    getListById: jest.fn(async (id: string) => (mockLists[id] ? { ...mockLists[id] } : null)),
  },
}));

import ImageStorageManager from '../../services/ImageStorageManager';

const QUEUE_KEY = '@upload_queue';
const OLD = 'receipts/fg-1/l1/1000.jpg';
const queued = (): any[] => JSON.parse(mockStore[QUEUE_KEY] ?? '[]');
const seed = (entries: Array<Record<string, unknown>>) => {
  mockStore[QUEUE_KEY] = JSON.stringify(entries.map((e, i) => ({
    id: `q${i}`, listId: 'l1', timestamp: i, retryCount: 0, ...e,
  })));
};
const deleted = () => mockDeleteObject.mock.calls.map(([r]) => r.path);
const list = (receiptUrl: string, status = 'completed') => {
  mockLists.l1 = { id: 'l1', familyGroupId: 'fg-1', status, receiptUrl };
};

beforeEach(() => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  Object.keys(mockLists).forEach(k => delete mockLists[k]);
  mockEvents.length = 0;
  mockPutFile.mockReset().mockImplementation(async (r: { path: string }) => { mockEvents.push(`put ${r.path}`); });
  mockDeleteObject.mockReset().mockImplementation(async (r: { path: string }) => { mockEvents.push(`delete ${r.path}`); });
});

describe('rescan replace: the old receipt outlives a failed upload', () => {
  it('keeps the old object while the replacement upload keeps failing', async () => {
    list('/cache/b.jpg');
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);
    mockPutFile.mockRejectedValue(new Error('storage/unauthorized'));

    await ImageStorageManager.processUploadQueue();

    expect(deleted()).not.toContain(OLD);
    expect(queued()).toHaveLength(1);
    expect(queued()[0].replacesPath).toBe(OLD);
  });

  it('points the list at the new upload before deleting the old one', async () => {
    list('/cache/b.jpg');
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);

    await ImageStorageManager.processUploadQueue();

    const setAt = mockEvents.findIndex(e => /^set l1 receipts\/fg-1\/l1\//.test(e));
    const deleteAt = mockEvents.indexOf(`delete ${OLD}`);
    expect(setAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(setAt);
    expect(queued()).toHaveLength(0);
  });

  it('dequeues even when deleting the old object fails (orphan, not a stuck entry)', async () => {
    list('/cache/b.jpg');
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);
    mockDeleteObject.mockRejectedValue(new Error('storage/retry-limit-exceeded'));

    await expect(ImageStorageManager.processUploadQueue()).resolves.toBeDefined();

    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(queued()).toHaveLength(0);
  });
});

describe('rescan replace: entries dropped without uploading', () => {
  it('a double rescan deletes the original once, after the last scan is up', async () => {
    // A was uploaded; B then C were scanned offline. C is what the list shows.
    list('/cache/c.jpg');
    seed([
      { filePath: '/cache/b.jpg', replacesPath: OLD },
      { filePath: '/cache/c.jpg', replacesPath: OLD },
    ]);

    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile.mock.calls.map(([, f]) => f)).toEqual(['/cache/c.jpg']);
    expect(deleted().filter(p => p === OLD)).toHaveLength(1);
    expect(mockEvents.indexOf(`delete ${OLD}`))
      .toBeGreaterThan(mockEvents.findIndex(e => /^set l1 receipts\//.test(e)));
    expect(queued()).toHaveLength(0);
  });

  it('a superseded entry does not delete the original while the newer scan still needs to replace it', async () => {
    list('/cache/c.jpg');
    seed([
      { filePath: '/cache/b.jpg', replacesPath: OLD },
      { filePath: '/cache/c.jpg', replacesPath: OLD },
    ]);
    mockPutFile.mockRejectedValue(new Error('network'));

    await ImageStorageManager.processUploadQueue();

    expect(deleted()).not.toContain(OLD);
  });

  it('a list deleted while its rescan waits to upload takes the old object with it', async () => {
    list('/cache/b.jpg', 'deleted');
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);

    await ImageStorageManager.processUploadQueue();

    expect(mockPutFile).not.toHaveBeenCalled();
    expect(deleted()).toContain(OLD);
    expect(queued()).toHaveLength(0);
  });

  it('a rescan that left the list on OLD swaps it, then deletes OLD', async () => {
    // Since codex P1 on #41 the list keeps showing OLD to the family until
    // the rescan is up; OLD must not go before the swap.
    list(OLD);
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);

    await ImageStorageManager.processUploadQueue();

    const setAt = mockEvents.findIndex(e => /^set l1 receipts\/fg-1\/l1\//.test(e));
    expect(setAt).toBeGreaterThanOrEqual(0);
    expect(mockEvents.indexOf(`delete ${OLD}`)).toBeGreaterThan(setAt);
    expect(mockLists.l1.receiptUrl).not.toBe(OLD);
  });

  it('never deletes a newer Storage path another phone synced in', async () => {
    const NEWER = 'receipts/fg-1/l1/2000.jpg';
    list(NEWER);
    seed([{ filePath: '/cache/b.jpg', replacesPath: OLD }]);

    await ImageStorageManager.processUploadQueue();

    expect(deleted()).not.toContain(NEWER);
    expect(mockLists.l1.receiptUrl).toBe(NEWER);
    expect(queued()).toHaveLength(0);
  });

  it('a rescan never publishes a phone-local path over an uploaded image', async () => {
    list(OLD);
    await (ImageStorageManager as any).setListReceipt('l1', '/cache/b.jpg', { totalAmount: 1 });

    expect(mockEvents.filter(e => e.startsWith('set l1 /'))).toEqual([]);
    expect(mockLists.l1.receiptUrl).toBe(OLD);
    expect(queued()[0]).toMatchObject({ filePath: '/cache/b.jpg', replacesPath: OLD });
  });
});

describe('rescan replace: queue entries from older app versions', () => {
  it('an entry with no replacesPath uploads and deletes nothing else', async () => {
    list('/cache/b.jpg');
    seed([{ filePath: '/cache/b.jpg' }]);

    await ImageStorageManager.processUploadQueue();

    expect(mockLists.l1.receiptUrl).toMatch(/^receipts\/fg-1\/l1\//);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });
});

describe('rescan replace: a rescan while the previous capture is uploading', () => {
  it('drops the in-flight upload, keeps A until C is up, then deletes A once', async () => {
    list(OLD);
    let releaseB: () => void = () => {};
    mockPutFile.mockImplementationOnce((r: { path: string }) => new Promise<void>(resolve => {
      mockEvents.push(`put ${r.path}`);
      releaseB = resolve;
    }));
    const ism = ImageStorageManager as any;

    await ism.setListReceipt('l1', '/cache/b.jpg', {});
    const pass = ism.processUploadQueue();
    await new Promise(r => setTimeout(r, 0));
    // B's putFile is in flight; the user rescans.
    await ism.setListReceipt('l1', '/cache/c.jpg', {});
    expect(queued().find((e: any) => e.filePath === '/cache/c.jpg').replacesPath).toBe(OLD);
    releaseB();
    await pass;
    await ism.processUploadQueue();

    const shown = mockLists.l1.receiptUrl;
    expect(shown).toMatch(/^receipts\/fg-1\/l1\//);
    expect(deleted().filter(p => p === OLD)).toHaveLength(1);
    // B's own upload is removed, C's is the one shown.
    const puts = mockPutFile.mock.calls.map(([r]) => r.path);
    expect(puts).toHaveLength(2);
    expect(deleted()).toContain(puts[0]);
    expect(shown).toBe(puts[1]);
    expect(queued()).toHaveLength(0);
  });
});

/**
 * A change that can't reach Firebase (task 100, review #8): a network failure
 * (shop Wi-Fi with no internet, a timed-out write) keeps the change queued
 * however often it fails, with the wait capped at 5 minutes. A write Firebase
 * refuses is dropped at once, and anything else after 5 tries; both drops are
 * logged.
 */

const mockSet = jest.fn((_ref: unknown, _data: unknown) => Promise.resolve());

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: (...args: unknown[]) => mockSet(args[0], args[1]),
  remove: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn(() => Promise.resolve()),
    removeFromSyncQueue: jest.fn(() => Promise.resolve()),
    markSyncedIfUnchanged: jest.fn(() => Promise.resolve()),
    getSyncQueue: jest.fn(() => Promise.resolve([])),
    getList: jest.fn(),
    updateItem: jest.fn(() => Promise.resolve()),
    updateSyncQueueOperation: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';
import CrashReporting from '../CrashReporting';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;

const itemOp = (retryCount: number) => ({
  id: 'q1', entityType: 'item', entityId: 'item-1', operation: 'update',
  data: { id: 'item-1', listId: 'list-1', name: 'Milk', updatedAt: 5, syncStatus: 'pending' },
  timestamp: 1, retryCount,
});

const fail = (error: Error & { code?: string }) => mockSet.mockImplementationOnce(() => Promise.reject(error));
const withCode = (code: string, message: string) => Object.assign(new Error(message), { code });

beforeAll(() => {
  SyncEngine.setFamilyGroupId('group-1');
});

afterAll(() => {
  SyncEngine.stopPeriodicRetry();
});

beforeEach(() => {
  jest.clearAllMocks();
});

async function replay(retryCount: number) {
  storage.getSyncQueue.mockResolvedValue([itemOp(retryCount)] as any);
  await SyncEngine.processOperationQueue();
}

const kept = () => {
  expect(storage.removeFromSyncQueue).not.toHaveBeenCalled();
  expect(storage.updateItem).not.toHaveBeenCalled();
  expect(storage.updateSyncQueueOperation).toHaveBeenCalledWith('q1', expect.objectContaining({ retryCount: expect.any(Number) }));
};

const dropped = () => {
  expect(storage.removeFromSyncQueue).toHaveBeenCalledWith('q1');
  expect(storage.updateItem).toHaveBeenCalledWith('item-1', { syncStatus: 'failed' });
  expect(CrashReporting.log).toHaveBeenCalledWith(expect.stringContaining('Dropped sync operation q1'));
};

it('keeps a timed-out write after its 5th failure', async () => {
  fail(new Error('Sync operation timed out after 30000ms'));
  await replay(4);
  kept();
});

it('keeps a network-error write after its 50th failure', async () => {
  fail(withCode('database/network-error', '[database/network-error] network'));
  await replay(49);
  kept();
});

it('waits at most about 5 minutes between network retries', async () => {
  const now = Date.now();
  fail(new Error('Sync operation timed out after 30000ms'));
  await replay(30);
  const { nextRetryAt } = storage.updateSyncQueueOperation.mock.calls[0][1] as { nextRetryAt: number };
  expect(nextRetryAt - now).toBeLessThanOrEqual(5 * 60 * 1000 + 1000 + 50);
  expect(nextRetryAt - now).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50);
});

it('drops a write the server refuses on the first try', async () => {
  fail(withCode('database/permission-denied', "[database/permission-denied] Client doesn't have permission"));
  await replay(0);
  dropped();
});

it('drops any other error after 5 tries', async () => {
  fail(new Error('Family group ID not set'));
  await replay(4);
  dropped();
});

it('retries any other error before its 5th try', async () => {
  fail(new Error('Family group ID not set'));
  await replay(3);
  kept();
});

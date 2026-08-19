/**
 * The push path's timeout is a fallback, not a cancellation: Firebase keeps a
 * timed-out write in its own outbox and lands it when connectivity returns.
 * These cover what happens to the queued fallback when it does.
 */

jest.useFakeTimers();

let mockResolveWrite: () => void;
let mockRejectWrite: (error: Error) => void;
const mockSet = jest.fn(() => new Promise<void>((resolve, reject) => {
  mockResolveWrite = resolve;
  mockRejectWrite = reject;
}));

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  set: (...args: unknown[]) => mockSet(...(args as [])),
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
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;

const item = {
  id: 'item-1', listId: 'list-1', name: 'Milk', quantity: null, price: null,
  checked: false, createdBy: 'user-1', createdAt: 1000, updatedAt: 1000,
  syncStatus: 'pending' as const, category: null, sortOrder: 1,
  measurementUnit: null, measurementValue: null,
};

beforeAll(() => {
  SyncEngine.setFamilyGroupId('group-1');
});

afterAll(() => {
  SyncEngine.stopPeriodicRetry();
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
});

/** Push an item whose Firebase write hangs, and let the 30s timeout fire. */
async function pushAndTimeOut() {
  const push = SyncEngine.pushChange('item', item.id, 'create', item);
  await jest.advanceTimersByTimeAsync(30_000);
  await push;
  const queued = storage.addToSyncQueue.mock.calls[0][0];
  return queued.id;
}

describe('SyncEngine.pushChange — a write that outlives its timeout', () => {
  it('queues a fallback when the write has not landed in time', async () => {
    await pushAndTimeOut();

    expect(storage.addToSyncQueue).toHaveBeenCalledTimes(1);
    expect(storage.addToSyncQueue.mock.calls[0][0]).toMatchObject({
      entityType: 'item',
      entityId: 'item-1',
      operation: 'create',
    });
    expect(storage.markSyncedIfUnchanged).not.toHaveBeenCalled();
  });

  it('drops the queued fallback once the write lands late, and marks it synced', async () => {
    const queuedId = await pushAndTimeOut();
    const statusChanges: number[] = [];
    const unsubscribe = SyncEngine.onStatusChange(s => statusChanges.push(s.pendingOperations));

    mockResolveWrite();
    await jest.advanceTimersByTimeAsync(0);

    expect(storage.removeFromSyncQueue).toHaveBeenCalledWith(queuedId);
    expect(storage.markSyncedIfUnchanged).toHaveBeenCalledWith('item', 'item-1', item.updatedAt);
    // Without this the banner keeps reporting a change that already synced.
    expect(statusChanges).toEqual([0]);
    unsubscribe();
  });

  it('leaves the queued fallback alone when the write really failed', async () => {
    const queuedId = await pushAndTimeOut();

    mockRejectWrite(new Error('permission denied'));
    await jest.advanceTimersByTimeAsync(0);

    expect(storage.removeFromSyncQueue).not.toHaveBeenCalledWith(queuedId);
    expect(storage.markSyncedIfUnchanged).not.toHaveBeenCalled();
  });

  it('keeps the record synced without queueing when the write lands in time', async () => {
    const push = SyncEngine.pushChange('item', item.id, 'update', item);
    mockResolveWrite();
    await push;

    expect(storage.addToSyncQueue).not.toHaveBeenCalled();
    expect(storage.markSyncedIfUnchanged).toHaveBeenCalledWith('item', 'item-1', item.updatedAt);
  });
});

/**
 * A deleted list is never restored (task 49). The queue replays retries out of
 * order, so a list write that timed out before the delete (a quick scan's
 * receipt, then Skip) must be dropped rather than land after the delete and
 * turn the list active again for the whole family.
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
    updateSyncQueueOperation: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;

const list = (status: 'active' | 'deleted' | 'completed') => ({
  id: 'list-1', name: '15 October 2026', familyGroupId: 'group-1', createdBy: 'user-1',
  createdAt: 1000, updatedAt: 2000, status, syncStatus: 'pending' as const,
});

const op = (id: string, entityType: 'list' | 'item', operation: 'create' | 'update' | 'delete', data: any) => ({
  id, entityType, entityId: data?.id ?? 'list-1', operation, data, timestamp: 1, retryCount: 1,
});

beforeAll(() => {
  SyncEngine.setFamilyGroupId('group-1');
});

afterAll(() => {
  SyncEngine.stopPeriodicRetry();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SyncEngine queue replay never revives a deleted list', () => {
  it('drops a stale active write for a list deleted on this phone', async () => {
    storage.getSyncQueue.mockResolvedValue([op('q1', 'list', 'update', list('active'))] as any);
    storage.getList.mockResolvedValue(list('deleted') as any);

    await SyncEngine.processOperationQueue();

    expect(mockSet).not.toHaveBeenCalled();
    expect(storage.removeFromSyncQueue).toHaveBeenCalledWith('q1');
  });

  it('drops a stale create too', async () => {
    storage.getSyncQueue.mockResolvedValue([op('q1', 'list', 'create', list('active'))] as any);
    storage.getList.mockResolvedValue(list('deleted') as any);

    await SyncEngine.processOperationQueue();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('still replays the delete itself', async () => {
    storage.getSyncQueue.mockResolvedValue([op('q2', 'list', 'update', list('deleted'))] as any);
    storage.getList.mockResolvedValue(list('deleted') as any);

    await SyncEngine.processOperationQueue();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ path: '/familyGroups/group-1/lists/list-1' }, expect.objectContaining({ status: 'deleted' }));
  });

  it('replays a write for a list that is still live', async () => {
    storage.getSyncQueue.mockResolvedValue([op('q3', 'list', 'update', list('active'))] as any);
    storage.getList.mockResolvedValue(list('active') as any);

    await SyncEngine.processOperationQueue();

    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('replays the stale write then the delete in queue order, and Firebase ends deleted', async () => {
    storage.getSyncQueue.mockResolvedValue([
      op('q1', 'list', 'update', list('active')),
      op('q2', 'list', 'update', list('deleted')),
    ] as any);
    storage.getList.mockResolvedValue(list('deleted') as any);

    await SyncEngine.processOperationQueue();

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][1]).toMatchObject({ status: 'deleted' });
  });

  it('leaves item writes alone', async () => {
    const item = { id: 'item-1', listId: 'list-1', name: 'Milk', checked: false, updatedAt: 1 };
    storage.getSyncQueue.mockResolvedValue([op('q4', 'item', 'update', item)] as any);

    await SyncEngine.processOperationQueue();

    expect(storage.getList).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledTimes(1);
  });
});

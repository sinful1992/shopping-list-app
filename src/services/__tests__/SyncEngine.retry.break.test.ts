const mockSet = jest.fn((_ref: unknown, _data: unknown) => Promise.resolve());

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: (...args: unknown[]) => mockSet(args[0], args[1]),
  remove: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn(() => Promise.resolve()),
    removeFromSyncQueue: jest.fn(() => Promise.resolve()),
    markSyncedIfUnchanged: jest.fn(() => Promise.resolve()),
    getSyncQueue: jest.fn(() => Promise.resolve([])),
    getList: jest.fn(() => Promise.resolve(null)),
    updateItem: jest.fn(() => Promise.resolve()),
    updateList: jest.fn(() => Promise.resolve()),
    updateSyncQueueOperation: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';
import CrashReporting from '../CrashReporting';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;
const op = (retryCount: number, over: object = {}) => ({
  id: 'q1', entityType: 'item', entityId: 'item-1', operation: 'update',
  data: { id: 'item-1', listId: 'list-1', name: 'Milk', updatedAt: 5, syncStatus: 'pending' },
  timestamp: 1, retryCount, ...over,
});
const failWith = (e: unknown) => mockSet.mockImplementationOnce(() => Promise.reject(e));
const withCode = (code: string, message: string) => Object.assign(new Error(message), { code });

beforeAll(() => SyncEngine.setFamilyGroupId('group-1'));
afterAll(() => SyncEngine.stopPeriodicRetry());
beforeEach(() => jest.clearAllMocks());

async function replay(o: object) {
  storage.getSyncQueue.mockResolvedValue([o] as any);
  return SyncEngine.processOperationQueue();
}
const kept = () => {
  expect(storage.removeFromSyncQueue).not.toHaveBeenCalled();
  expect(storage.updateSyncQueueOperation).toHaveBeenCalledWith('q1', expect.objectContaining({ retryCount: expect.any(Number) }));
};
const dropped = () => {
  expect(storage.removeFromSyncQueue).toHaveBeenCalledWith('q1');
  expect(CrashReporting.log).toHaveBeenCalledWith(expect.stringContaining('Dropped sync operation q1'));
};

it('S1 no code, message "Network request failed" at try 5: kept', async () => {
  failWith(new Error('Network request failed')); await replay(op(4)); kept();
});
it('S2 RN Firebase disconnected code at try 20: kept', async () => {
  failWith(withCode('database/disconnected', '[database/disconnected] The operation had to be aborted due to a network disconnect.'));
  await replay(op(19)); kept();
});
it('S3 timeout via withTimeout at try 100: kept, wait capped', async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  mockSet.mockImplementationOnce(() => new Promise(() => {}));
  const p = replay(op(99));
  await Promise.resolve(); await Promise.resolve();
  await jest.advanceTimersByTimeAsync(31000);
  await p;
  jest.useRealTimers();
  kept();
  const { nextRetryAt } = storage.updateSyncQueueOperation.mock.calls[0][1] as { nextRetryAt: number };
  expect(Number.isFinite(nextRetryAt)).toBe(true);
});
it('S4 permission denied by JS-SDK style message only, first try: dropped', async () => {
  failWith(new Error('PERMISSION_DENIED: Permission denied')); await replay(op(0)); dropped();
});
it('S5 permission-denied on a list op: list marked failed and dropped', async () => {
  failWith(withCode('database/permission-denied', 'denied'));
  await replay(op(0, { entityType: 'list', entityId: 'list-1', data: { id: 'list-1', updatedAt: 1, status: 'active' } }));
  dropped();
  expect(storage.updateList).toHaveBeenCalledWith('list-1', { syncStatus: 'failed' });
});
it('S6 error thrown as a plain string "network error" at try 5: kept (it is a network failure)', async () => {
  failWith('network error'); await replay(op(4)); kept();
});
it('S7 null rejection at try 5: dropped and logged without crashing', async () => {
  failWith(null); await replay(op(4)); dropped();
});
it('S8 plain object {code:"database/network-error"} (not an Error) at try 5: kept', async () => {
  failWith({ code: 'database/network-error' }); await replay(op(4)); kept();
});
it('S9 permission-denied whose message also says network: dropped (refusal wins)', async () => {
  failWith(withCode('database/permission-denied', 'network says permission denied')); await replay(op(0)); dropped();
});
it('S10 "Client is offline." (Firebase offline message) at try 5: kept', async () => {
  failWith(new Error('Client is offline.')); await replay(op(4)); kept();
});
it('S11 every drop is logged: a write reviving a deleted list is dropped with a log line', async () => {
  storage.getList.mockResolvedValueOnce({ id: 'list-1', status: 'deleted' } as any);
  await replay(op(0, { entityType: 'list', entityId: 'list-1', data: { id: 'list-1', updatedAt: 1, status: 'completed' } }));
  expect(storage.removeFromSyncQueue).toHaveBeenCalledWith('q1');
  expect(CrashReporting.log).toHaveBeenCalled();
});
it('S12 validation error (no code) at try 4 kept, at try 5 dropped', async () => {
  failWith(new Error('syncToFirebase: null payload')); await replay(op(3)); kept();
  jest.clearAllMocks();
  failWith(new Error('syncToFirebase: null payload')); await replay(op(4)); dropped();
});

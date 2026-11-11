/**
 * Left note 139 (audit 137, task 145): changes waiting in the queue were made in one family. When the
 * phone moves to another family they must not be sent into it.
 */
const mockSet = jest.fn((_ref: unknown, _data: unknown) => Promise.resolve());
let mockQueue: any[] = [];

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: (...args: unknown[]) => mockSet(args[0], args[1]),
  remove: jest.fn(() => Promise.resolve()),
  runTransaction: (r: unknown, fn: (current: unknown) => unknown) => {
    const next = fn(null);
    return mockSet(r, next).then(() => ({ committed: true, snapshot: { val: () => next } }));
  },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn(async (op: any) => { mockQueue.push(op); }),
    removeFromSyncQueue: jest.fn(async (id: string) => { mockQueue = mockQueue.filter(o => o.id !== id); }),
    clearSyncQueue: jest.fn(async () => { mockQueue = []; }),
    markSyncedIfUnchanged: jest.fn(() => Promise.resolve()),
    getSyncQueue: jest.fn(async () => [...mockQueue]),
    updateSyncQueueOperation: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(async () => null),
    getList: jest.fn(async () => null),
    getStoreLayoutById: jest.fn(async () => null),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';

const engine = SyncEngine as any;
const item = { id: 'i1', listId: 'l1', name: 'Milk', checked: true, createdBy: 'u', updatedAt: 10, syncStatus: 'pending' } as any;
const paths = () => mockSet.mock.calls.map(c => (c[0] as { path: string }).path);

beforeEach(() => {
  jest.clearAllMocks();
  mockQueue = [];
  engine.resetForSignOut();
});
afterAll(() => engine.stopPeriodicRetry());

it('a change queued in famA is not sent into famB after the family changes', async () => {
  SyncEngine.setFamilyGroupId('famA');
  engine.isOnline = false;
  await SyncEngine.pushChange('item', 'i1', 'update', item);
  expect(mockQueue).toHaveLength(1);

  SyncEngine.setFamilyGroupId('famB');
  engine.isOnline = true;
  await SyncEngine.processOperationQueue();
  expect(paths().filter(p => p.includes('famB'))).toEqual([]);
  expect(mockQueue).toHaveLength(0);
  expect(LocalStorageManager.clearSyncQueue).toHaveBeenCalledTimes(1);
});

it('setting the same family again keeps the queue and sends it there', async () => {
  SyncEngine.setFamilyGroupId('famA');
  engine.isOnline = false;
  await SyncEngine.pushChange('item', 'i1', 'update', item);
  SyncEngine.setFamilyGroupId('famA');
  engine.isOnline = true;
  await SyncEngine.processOperationQueue();
  expect(paths()).toEqual(['/familyGroups/famA/items/i1']);
  expect(LocalStorageManager.clearSyncQueue).not.toHaveBeenCalled();
});

it('the first family after sign-in (none before) keeps the queue', async () => {
  mockQueue = [{ id: 'q1', entityType: 'item', entityId: 'i1', operation: 'update', data: item, timestamp: 1, retryCount: 0 }];
  SyncEngine.setFamilyGroupId('famA');
  await SyncEngine.processOperationQueue();
  expect(paths()).toEqual(['/familyGroups/famA/items/i1']);
});

it('a push to famB after the change goes to famB', async () => {
  SyncEngine.setFamilyGroupId('famA');
  SyncEngine.setFamilyGroupId('famB');
  await SyncEngine.pushChange('item', 'i1', 'update', item);
  expect(paths()).toEqual(['/familyGroups/famB/items/i1']);
});

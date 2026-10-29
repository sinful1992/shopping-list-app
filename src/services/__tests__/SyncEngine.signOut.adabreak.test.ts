/**
 * ada break tests for review #2 (task 100): after sign-out the old account's
 * changes are gone from sync_queue. A push still in flight at sign-out
 * (captive shop Wi-Fi, write not answered) times out after 30 s and queues
 * itself, AFTER clearAllData; SyncEngine then sends it with the next
 * account's familyGroupId.
 */
jest.useFakeTimers();

const mockQueue: any[] = [];
const mockSet = jest.fn((_ref: any, _data: any) => new Promise<void>(() => {}));

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: (...a: any[]) => mockSet(a[0], a[1]),
  remove: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn(async (op: any) => { mockQueue.push(op); }),
    removeFromSyncQueue: jest.fn(async (id: string) => {
      const i = mockQueue.findIndex(o => o.id === id);
      if (i >= 0) mockQueue.splice(i, 1);
    }),
    markSyncedIfUnchanged: jest.fn(async () => undefined),
    getSyncQueue: jest.fn(async () => [...mockQueue]),
    updateSyncQueueOperation: jest.fn(async () => undefined),
    getList: jest.fn(async () => null),
    // What signOut's clearAllData does to the queue.
    clearAllData: jest.fn(async () => { mockQueue.length = 0; }),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';
import LocalStorageManager from '../LocalStorageManager';

const item = { id: 'i1', listId: 'l1', name: 'Alice milk', createdBy: 'alice', checked: false, updatedAt: 10, syncStatus: 'pending' } as any;

afterEach(() => {
  SyncEngine.stopPeriodicRetry();
  mockQueue.length = 0;
  mockSet.mockReset();
  mockSet.mockImplementation(() => new Promise<void>(() => {}));
});

describe('adabreak #2 SyncEngine across sign-out', () => {
  it('a push in flight at sign-out does not land in sync_queue after the clear', async () => {
    SyncEngine.setFamilyGroupId('famA');
    void SyncEngine.pushChange('item', 'i1', 'update', item); // write hangs

    // Logout: flush, count, then signOut clears local data.
    await SyncEngine.syncPendingChanges();
    const { pendingOperations } = await SyncEngine.getSyncStatus();
    expect(pendingOperations).toBe(0); // no "changes not sent" prompt
    await LocalStorageManager.clearAllData();

    await jest.advanceTimersByTimeAsync(31000); // the 30 s push timeout fires
    expect(mockQueue).toHaveLength(0);
  });

  it('the next account never sends the old account\'s item into its own family', async () => {
    SyncEngine.setFamilyGroupId('famA');
    void SyncEngine.pushChange('item', 'i1', 'update', item);
    await LocalStorageManager.clearAllData(); // sign-out
    await jest.advanceTimersByTimeAsync(31000);

    // Bob signs in on the same phone.
    SyncEngine.setFamilyGroupId('famB');
    mockSet.mockImplementation(() => Promise.resolve());
    await SyncEngine.processOperationQueue();
    const paths = mockSet.mock.calls.map(c => c[0].path);
    expect(paths).not.toContain('/familyGroups/famB/items/i1');
  });

  it('same for a list: the old list is not created in the next family', async () => {
    const list = { id: 'L1', name: 'Alice list', familyGroupId: 'famA', createdBy: 'alice', createdAt: 1, updatedAt: 10, status: 'active', syncStatus: 'pending' } as any;
    SyncEngine.setFamilyGroupId('famA');
    void SyncEngine.pushChange('list', 'L1', 'create', list);
    await LocalStorageManager.clearAllData();
    await jest.advanceTimersByTimeAsync(31000);
    SyncEngine.setFamilyGroupId('famB');
    mockSet.mockImplementation(() => Promise.resolve());
    await SyncEngine.processOperationQueue();
    expect(mockSet.mock.calls.map(c => c[0].path)).not.toContain('/familyGroups/famB/lists/L1');
  });

  it('logout flush on captive Wi-Fi answers within 10 s (3 queued changes)', async () => {
    SyncEngine.setFamilyGroupId('famA');
    for (const id of ['a', 'b', 'c']) {
      mockQueue.push({ id, entityType: 'item', entityId: id, operation: 'update', data: { ...item, id }, timestamp: 1, retryCount: 0 });
    }
    let done = false;
    void SyncEngine.syncPendingChanges().then(() => { done = true; });
    await jest.advanceTimersByTimeAsync(10000);
    expect(done).toBe(true);
    await jest.advanceTimersByTimeAsync(100000);
  });
});

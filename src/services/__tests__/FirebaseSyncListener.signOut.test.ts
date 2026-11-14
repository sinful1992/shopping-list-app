/**
 * Sign-out (task 100, review #2): signOut stops listeners, then
 * clears local data. Anything a listener already started (initial get, an
 * in-flight child handler) must not write the old account's rows back after
 * stopAllListeners returned.
 */
type Handler = (snap: { key: string; val: () => any }) => Promise<void>;
const mockHandlers: Record<string, Handler> = {};
const mockGets: Array<(v: any) => void> = [];

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  child: jest.fn(() => ({})),
  query: jest.fn((r: any) => r),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  // Every initial load waits until the test releases it (slow network).
  get: jest.fn(() => new Promise(resolve => { mockGets.push(resolve); })),
  onChildAdded: jest.fn(() => jest.fn()),
  onChildChanged: jest.fn((r: any, cb: Handler) => { mockHandlers[`changed:${r.path}`] = cb; return jest.fn(); }),
  onChildRemoved: jest.fn(() => jest.fn()),
}));

let mockGetListRelease: (() => void) | null = null;
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    getList: jest.fn(() => new Promise(resolve => { mockGetListRelease = () => resolve(null); })),
    saveList: jest.fn(() => Promise.resolve()),
    saveListsBatch: jest.fn(() => Promise.resolve()),
    updateList: jest.fn(() => Promise.resolve()),
    getLatestPriceHistoryTimestamp: jest.fn(() => Promise.resolve(null)),
    savePriceHistoryBatch: jest.fn(() => Promise.resolve()),
    savePriceHistoryRecord: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import FirebaseSyncListener from '../FirebaseSyncListener';
import LocalStorageManager from '../LocalStorageManager';

const storage = LocalStorageManager as unknown as Record<string, jest.Mock>;
const flush = () => new Promise(r => setImmediate(r));

const snapshotOf = (rows: Record<string, any>) => ({
  forEach: (fn: (s: { key: string; val: () => any }) => void) => {
    Object.entries(rows).forEach(([key, v]) => fn({ key, val: () => v }));
    return false;
  },
});
const remoteList = { name: 'Old family list', familyGroupId: 'famA', createdBy: 'alice', createdAt: 1000, status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGets.length = 0;
  FirebaseSyncListener.stopAllListeners();
});

describe('no listener writes after stopAllListeners (sign-out)', () => {
  it('lists initial load that lands after sign-out does not write the old lists back', async () => {
    FirebaseSyncListener.startListeningToLists('famA');
    FirebaseSyncListener.stopAllListeners(); // signOut: then clearAllData runs
    mockGets[0](snapshotOf({ 'list-1': remoteList })); // slow get lands now
    await flush();
    expect(storage.saveListsBatch).not.toHaveBeenCalled();
  });

  it('price history initial load that lands after sign-out does not write records back', async () => {
    FirebaseSyncListener.startListeningToPriceHistory('famA');
    await flush(); // getLatestPriceHistoryTimestamp resolved, get() pending
    FirebaseSyncListener.stopAllListeners();
    mockGets[0](snapshotOf({ r1: { id: 'r1', itemName: 'milk', price: 1, recordedAt: 5, familyGroupId: 'famA' } }));
    await flush();
    expect(storage.savePriceHistoryBatch).not.toHaveBeenCalled();
  });

  it('a list change event already being handled at sign-out does not save the list after the clear', async () => {
    FirebaseSyncListener.startListeningToLists('famA');
    const handler = mockHandlers['changed:familyGroups/famA/lists'];
    const pending = handler({ key: 'list-1', val: () => remoteList }); // awaiting getList
    FirebaseSyncListener.stopAllListeners();
    // clearAllData happens here, then the handler's local read returns
    mockGetListRelease!();
    await pending;
    expect(storage.saveList).not.toHaveBeenCalled();
  });

  it('a listener started after sign-out (the next account) still writes', async () => {
    FirebaseSyncListener.startListeningToLists('famA');
    FirebaseSyncListener.stopAllListeners();
    FirebaseSyncListener.startListeningToLists('famB');
    mockGets[1](snapshotOf({ 'list-2': { ...remoteList, familyGroupId: 'famB' } }));
    await flush();
    expect(storage.saveListsBatch).toHaveBeenCalledTimes(1);
  });
});

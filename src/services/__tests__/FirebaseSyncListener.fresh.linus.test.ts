/**
 * Break tests (fresh reviewer) for fetchListOnceForHistory (task 121).
 * LocalStorageManager is an in-memory map so the listener and the history
 * fallback share one "DB".
 */
type Handler = (snap: { key: string; val: () => any }) => Promise<void>;
const mockHandlers: Record<string, Handler> = {};
const mockStore = new Map<string, any>();

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(),
  onChildAdded: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.added = cb; return jest.fn(); }),
  onChildChanged: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.changed = cb; return jest.fn(); }),
  onChildRemoved: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.removed = cb; return jest.fn(); }),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    getList: jest.fn(async (id: string) => mockStore.get(id) ?? null),
    saveList: jest.fn(async (l: any) => { mockStore.set(l.id, l); return l; }),
    saveListsBatch: jest.fn(async (ls: any[]) => { ls.forEach(l => mockStore.set(l.id, l)); }),
    updateList: jest.fn(async () => undefined),
    saveItemsBatchUpsert: jest.fn(async () => undefined),
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import { get } from '@react-native-firebase/database';
import FirebaseSyncListener from '../FirebaseSyncListener';
import LocalStorageManager from '../LocalStorageManager';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;
const mockGet = get as jest.Mock;
const remote = (extra: object = {}) => ({
  name: 'Tesco', familyGroupId: 'fam-1', createdBy: 'u1', createdAt: 1000, status: 'completed', completedAt: 2000, ...extra,
});
const emptyItems = { forEach: () => false };

beforeAll(() => {
  mockGet.mockResolvedValue({ forEach: () => false, val: () => null });
  FirebaseSyncListener.startListeningToLists('fam-1');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
});

it('F1 (4cedcf5: read-only) a newer local copy is never overwritten by the Firebase read', async () => {
  mockStore.set('list-1', { id: 'list-1', totalAmount: 25, status: 'completed' });
  mockGet.mockResolvedValueOnce({ val: () => remote({ totalAmount: 10 }) });
  const l = await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  expect(l?.totalAmount).toBe(10);
  expect(mockStore.get('list-1').totalAmount).toBe(25);
  expect(storage.saveList).not.toHaveBeenCalled();
});

it('F2 after History saved the completed list, the listener still backfills its items when the list changes', async () => {
  // Push beat the items: History fetches the completed list (saving it), then the
  // rescan's child_changed arrives. Without History's save, syncListToLocal would
  // see a new completed list and backfill items.
  mockGet.mockResolvedValueOnce({ val: () => remote({ totalAmount: 10 }) });
  await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  mockGet.mockClear();
  mockGet.mockResolvedValue(emptyItems);
  await mockHandlers.changed({ key: 'list-1', val: () => remote({ totalAmount: 25 }) });
  await new Promise(r => setImmediate(r));
  // items read for list-1 (query on items path)
  expect(mockGet).toHaveBeenCalled();
});

it('F3 (4cedcf5: read-only) sign-out around the read: nothing is saved for the old account', async () => {
  mockGet.mockResolvedValueOnce({ val: () => remote() });
  const p = FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  FirebaseSyncListener.stopAllListeners();
  await p;
  expect(storage.saveList).not.toHaveBeenCalled();
  expect(storage.saveListsBatch ?? jest.fn()).not.toHaveBeenCalled();
  FirebaseSyncListener.startListeningToLists('fam-1');
});

it('F4 a remote list without familyGroupId keeps the asked group', async () => {
  mockGet.mockResolvedValueOnce({ val: () => remote({ familyGroupId: undefined }) });
  const l = await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  expect(l?.familyGroupId).toBe('fam-1');
});

it('F5 a deleted local copy is never replaced by an active remote copy', async () => {
  mockStore.set('list-1', { id: 'list-1', status: 'deleted' });
  mockGet.mockResolvedValueOnce({ val: () => remote({ status: 'active' }) });
  await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  expect(mockStore.get('list-1').status).toBe('deleted');
});

it('F2-control without the History save, the same child_changed backfills items', async () => {
  mockGet.mockResolvedValue(emptyItems);
  await mockHandlers.changed({ key: 'list-1', val: () => remote({ totalAmount: 25 }) });
  await new Promise(r => setImmediate(r));
  expect(mockGet).toHaveBeenCalled();
});

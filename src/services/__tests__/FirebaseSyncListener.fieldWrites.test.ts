/**
 * Rank 20 (audit 137, task 142/143), receiving side. With field-level writes the server can hold a
 * merge of two phones' edits under the OLDER phone's updatedAt (A's tick landed after B's rename).
 * A phone whose copy is synced must take that merge, or it keeps the stale field for good; only a
 * local change still on its way is protected by the newer-updatedAt rule. And every snapshot the
 * listener sees becomes the server copy SyncEngine diffs the next update against.
 */
type Handler = (snap: { key: string; val: () => any }) => Promise<void>;
const mockHandlers: Record<string, Handler> = {};
const mockStore = new Map<string, any>();
let mockInitial: Record<string, any> = {};

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(async () => ({
    forEach: (cb: any) => { Object.entries(mockInitial).forEach(([key, v]) => cb({ key, val: () => v })); return false; },
    val: () => null, exists: () => false,
  })),
  onChildAdded: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.added = cb; return jest.fn(); }),
  onChildChanged: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.changed = cb; return jest.fn(); }),
  onChildRemoved: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.removed = cb; return jest.fn(); }),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (id: string) => mockStore.get(id) ?? null),
    saveItem: jest.fn(async (i: any) => { mockStore.set(i.id, i); return i; }),
    getItemsForList: jest.fn(async () => [...mockStore.values()]),
    saveItemsBatchUpsert: jest.fn(async (is: any[]) => { is.forEach(i => mockStore.set(i.id, i)); }),
    deleteItemsBatch: jest.fn(async () => undefined),
    deleteItem: jest.fn(async () => undefined),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import FirebaseSyncListener from '../FirebaseSyncListener';
import { ServerCopies } from '../storage/serverCopies';

const server = (extra: object = {}) => ({
  listId: 'l1', name: 'Bread', quantity: null, price: null, checked: true, createdBy: 'u', createdAt: 1, updatedAt: 10, ...extra,
});
const local = (extra: object = {}) => ({
  id: 'i1', listId: 'l1', name: 'Milk', quantity: null, price: null, checked: false, createdBy: 'u', createdAt: 1, updatedAt: 30,
  syncStatus: 'synced', category: null, sortOrder: null, unitQty: null, measurementUnit: null, measurementValue: null, isUrgent: false, ...extra,
});
const flush = () => new Promise(r => setImmediate(r));

beforeEach(() => {
  FirebaseSyncListener.stopAllListeners();
  mockStore.clear();
  mockInitial = {};
  ServerCopies.clear();
});

it('a synced local copy takes a merged server copy even when its updatedAt is older', async () => {
  mockStore.set('i1', local());
  FirebaseSyncListener.startListeningToItems('fam', 'l1');
  await flush();
  await mockHandlers.changed({ key: 'i1', val: () => server() });
  expect(mockStore.get('i1')).toMatchObject({ name: 'Bread', checked: true });
});

it('a local change still pending and newer is kept (the old rule, now only for pending changes)', async () => {
  mockStore.set('i1', local({ syncStatus: 'pending', name: 'Oat milk' }));
  FirebaseSyncListener.startListeningToItems('fam', 'l1');
  await flush();
  await mockHandlers.changed({ key: 'i1', val: () => server() });
  expect(mockStore.get('i1').name).toBe('Oat milk');
});

it('the initial load applies the same rule: synced takes the server, pending newer is kept', async () => {
  mockStore.set('i1', local());
  mockStore.set('i2', local({ id: 'i2', syncStatus: 'pending', name: 'Eggs' }));
  mockInitial = { i1: server(), i2: server({ name: 'Old eggs' }) };
  FirebaseSyncListener.startListeningToItems('fam', 'l1');
  await flush(); await flush();
  expect(mockStore.get('i1').name).toBe('Bread');
  expect(mockStore.get('i2').name).toBe('Eggs');
});

it('every snapshot seen becomes the server copy (also when the local copy is kept), and a removal forgets it', async () => {
  mockStore.set('i1', local({ syncStatus: 'pending' }));
  mockInitial = { i9: server({ name: 'Jam' }) };
  FirebaseSyncListener.startListeningToItems('fam', 'l1');
  await flush(); await flush();
  expect(ServerCopies.get('item/i9')).toMatchObject({ name: 'Jam', checked: true });
  await mockHandlers.changed({ key: 'i1', val: () => server() });
  expect(ServerCopies.get('item/i1')).toMatchObject({ name: 'Bread' });
  expect(ServerCopies.get('item/i1')).not.toHaveProperty('syncStatus');
  await mockHandlers.removed({ key: 'i1', val: () => null });
  await flush();
  expect(ServerCopies.get('item/i1')).toBeUndefined();
});

it('a snapshot from before sign-out (old generation) is not kept as a server copy', async () => {
  FirebaseSyncListener.startListeningToItems('fam', 'l1');
  await flush();
  const stale = mockHandlers.changed;
  FirebaseSyncListener.stopAllListeners();
  ServerCopies.clear();
  await stale({ key: 'i1', val: () => server() });
  expect(ServerCopies.get('item/i1')).toBeUndefined();
});

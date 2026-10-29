const mockServerItems: Record<string, object | null> = {};

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(() => Promise.resolve({
    forEach: (cb: (s: { key: string; val: () => object | null }) => void) => {
      Object.entries(mockServerItems).forEach(([key, v]) => cb({ key, val: () => v }));
      return false;
    },
  })),
  onChildAdded: jest.fn(() => () => {}),
  onChildChanged: jest.fn(() => () => {}),
  onChildRemoved: jest.fn(() => () => {}),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    saveItemsBatchUpsert: jest.fn(() => Promise.resolve()),
    getItemsForList: jest.fn(),
    deleteItemsBatch: jest.fn(() => Promise.resolve()),
    saveItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import FirebaseSyncListener from '../FirebaseSyncListener';

const db = jest.requireMock('@react-native-firebase/database');
const LSM = jest.requireMock('../LocalStorageManager').default;
const CR = jest.requireMock('../CrashReporting').default;

const local = (id: string, syncStatus: string, extra: object = {}) => ({
  id, listId: 'list-a', name: id, checked: false, price: null, unitQty: null, updatedAt: 1, syncStatus, ...extra,
});
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

beforeEach(() => {
  jest.clearAllMocks();
  FirebaseSyncListener.stopAllListeners();
  for (const k of Object.keys(mockServerItems)) delete mockServerItems[k];
});

it('B1 keeps an item ticked offline (pending in both reads) that the server lacks', async () => {
  LSM.getItemsForList.mockResolvedValue([local('eggs', 'pending', { checked: true })]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
});

it('B2 keeps an item created locally after the first read and synced before the second', async () => {
  LSM.getItemsForList.mockResolvedValueOnce([]).mockResolvedValueOnce([local('new', 'synced')]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
});

it('B3 server get() fails: nothing deleted, nothing upserted, error recorded', async () => {
  db.get.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('x'), { code: 'database/permission-denied' })));
  LSM.getItemsForList.mockResolvedValue([local('eggs', 'synced')]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
  expect(LSM.saveItemsBatchUpsert).not.toHaveBeenCalled();
  expect(CR.recordError).toHaveBeenCalled();
});

it('B4 first local read fails: nothing deleted, error recorded, no unhandled rejection', async () => {
  LSM.getItemsForList.mockRejectedValueOnce(new Error('db locked'));
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
  expect(CR.recordError).toHaveBeenCalled();
});

it('B5 listener stopped while the server read is in flight: nothing deleted', async () => {
  let resolveGet!: (v: unknown) => void;
  db.get.mockImplementationOnce(() => new Promise(r => { resolveGet = r; }));
  LSM.getItemsForList.mockResolvedValue([local('eggs', 'synced')]);
  const unsub = FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  unsub();
  resolveGet({ forEach: () => false });
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
});

it('B6 list emptied on the other phone: every synced item goes, pending stays', async () => {
  LSM.getItemsForList.mockResolvedValue([local('a', 'synced'), local('b', 'synced'), local('c', 'pending')]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).toHaveBeenCalledWith(['a', 'b']);
});

it('B7 an item deleted locally between the two reads is not passed to delete', async () => {
  LSM.getItemsForList.mockResolvedValueOnce([local('eggs', 'synced')]).mockResolvedValueOnce([]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
});

it('B8 server item present: it is upserted and not deleted (unitQty carried)', async () => {
  mockServerItems.milk = { listId: 'list-a', name: 'milk', checked: true, unitQty: 3, updatedAt: 9 };
  LSM.getItemsForList.mockResolvedValue([local('milk', 'synced')]);
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
  expect(LSM.saveItemsBatchUpsert).toHaveBeenCalledWith([expect.objectContaining({ id: 'milk', unitQty: 3 })]);
});

it('B9 (race) item ticked while the upsert runs, after the second read, is still deleted', async () => {
  mockServerItems.milk = { listId: 'list-a', name: 'milk', checked: true, updatedAt: 9 };
  const state = [local('milk', 'synced'), local('eggs', 'synced')];
  LSM.getItemsForList.mockImplementation(async () => state.map(i => ({ ...i })));
  LSM.saveItemsBatchUpsert.mockImplementationOnce(async () => { state[1] = { ...state[1], syncStatus: 'pending', checked: true }; });
  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();
  // eggs is pending now; a correct implementation would re-check before deleting
  expect(LSM.deleteItemsBatch).not.toHaveBeenCalled();
});

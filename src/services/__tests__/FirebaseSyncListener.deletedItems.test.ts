/**
 * Items deleted on another phone while this one's app was closed (task 100,
 * review #7): the first load of a list drops local items that were synced
 * before the server read and are missing from it. Items never sent, or
 * changed locally since, stay.
 */
const mockServerItems: Record<string, object> = {};
const mockOrder: string[] = [];

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(() => {
    mockOrder.push('server read');
    return Promise.resolve({
      forEach: (cb: (s: { key: string; val: () => object }) => void) => {
        Object.entries(mockServerItems).forEach(([key, v]) => cb({ key, val: () => v }));
        return false;
      },
    });
  }),
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
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import FirebaseSyncListener from '../FirebaseSyncListener';

const LocalStorageManager = jest.requireMock('../LocalStorageManager').default;

const local = (id: string, syncStatus: string) => ({
  id, listId: 'list-a', name: id, checked: false, price: null, unitQty: null, updatedAt: 1, syncStatus,
});

const settle = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  FirebaseSyncListener.stopAllListeners();
  for (const k of Object.keys(mockServerItems)) delete mockServerItems[k];
  mockOrder.length = 0;
});

it('drops a synced item the server no longer has, keeps unsent and server items', async () => {
  mockServerItems.milk = { listId: 'list-a', name: 'milk', checked: false, updatedAt: 1 };
  const items = [local('milk', 'synced'), local('eggs', 'synced'), local('bread', 'pending'), local('jam', 'failed')];
  LocalStorageManager.getItemsForList.mockResolvedValue(items);

  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();

  expect(LocalStorageManager.deleteItemsBatch).toHaveBeenCalledTimes(1);
  expect(LocalStorageManager.deleteItemsBatch).toHaveBeenCalledWith(['eggs']);
});

it('keeps an item that was synced only after the server read began', async () => {
  // eggs is still pending when the list opens, its push lands while the server is read
  LocalStorageManager.getItemsForList
    .mockResolvedValueOnce([local('eggs', 'pending')])
    .mockResolvedValueOnce([local('eggs', 'synced')]);

  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();

  expect(LocalStorageManager.deleteItemsBatch).not.toHaveBeenCalled();
});

it('keeps an item edited locally after the first local read', async () => {
  LocalStorageManager.getItemsForList
    .mockResolvedValueOnce([local('eggs', 'synced')])
    .mockResolvedValueOnce([local('eggs', 'pending')]);

  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();

  expect(LocalStorageManager.deleteItemsBatch).not.toHaveBeenCalled();
});

it('reads local items before the server', async () => {
  LocalStorageManager.getItemsForList.mockImplementation(async () => {
    mockOrder.push('local read');
    return [];
  });

  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();

  expect(mockOrder.slice(0, 2)).toEqual(['local read', 'server read']);
});

it('deletes nothing when the server read fails', async () => {
  const db = jest.requireMock('@react-native-firebase/database');
  db.get.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  LocalStorageManager.getItemsForList.mockResolvedValue([local('eggs', 'synced')]);

  FirebaseSyncListener.startListeningToItems('g', 'list-a');
  await settle();

  expect(LocalStorageManager.deleteItemsBatch).not.toHaveBeenCalled();
});

/**
 * History's fallback read of one list (task 121): a receipt push can open a
 * trip this phone has not synced yet.
 */
jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(),
  onChildAdded: jest.fn(() => jest.fn()),
  onChildChanged: jest.fn(() => jest.fn()),
  onChildRemoved: jest.fn(() => jest.fn()),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: jest.fn(), saveList: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import { get, ref } from '@react-native-firebase/database';
import FirebaseSyncListener from '../FirebaseSyncListener';
import LocalStorageManager from '../LocalStorageManager';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;
const mockGet = get as jest.Mock;

const remote = { name: 'Tesco', createdBy: 'u1', createdAt: 1000, status: 'completed', completedAt: 2000, totalAmount: 12.5 };

beforeEach(() => jest.clearAllMocks());

it('reads the one list path and saves it locally when this phone lacks it', async () => {
  mockGet.mockResolvedValue({ val: () => remote });
  storage.getList.mockResolvedValue(null);
  const list = await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  expect(ref).toHaveBeenCalledWith(expect.anything(), 'familyGroups/fam-1/lists/list-1');
  expect(list).toMatchObject({ id: 'list-1', name: 'Tesco', familyGroupId: 'fam-1', status: 'completed' });
  expect(storage.saveList).toHaveBeenCalledWith(expect.objectContaining({ id: 'list-1' }));
});

it('returns null and saves nothing when Firebase has no such list', async () => {
  mockGet.mockResolvedValue({ val: () => null });
  expect(await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1')).toBeNull();
  expect(storage.saveList).not.toHaveBeenCalled();
});

it('never overwrites a local copy (a list deleted here stays deleted)', async () => {
  mockGet.mockResolvedValue({ val: () => remote });
  storage.getList.mockResolvedValue({ id: 'list-1', status: 'deleted' } as never);
  await FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  expect(storage.saveList).not.toHaveBeenCalled();
});

it('skips the save after sign-out started (listener generation moved on)', async () => {
  let resolveGet!: (v: unknown) => void;
  mockGet.mockReturnValue(new Promise(r => { resolveGet = r; }));
  storage.getList.mockResolvedValue(null);
  const pending = FirebaseSyncListener.fetchListOnceForHistory('fam-1', 'list-1');
  FirebaseSyncListener.stopAllListeners();
  resolveGet({ val: () => remote });
  await pending;
  expect(storage.saveList).not.toHaveBeenCalled();
});

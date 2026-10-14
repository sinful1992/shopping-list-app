/**
 * A deleted list is never restored (task 49). A late echo or an older
 * snapshot from Firebase (the initial load restarts on every return to the
 * foreground, after the camera and after the rewarded ad) must not bring a
 * list deleted on this phone back as an empty active list.
 */

type Handler = (snap: { key: string; val: () => any }) => Promise<void>;
const mockHandlers: Record<string, Handler> = {};

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  child: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  startAt: jest.fn(),
  get: jest.fn(() => Promise.resolve({ forEach: () => false })),
  onChildAdded: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.added = cb; return jest.fn(); }),
  onChildChanged: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.changed = cb; return jest.fn(); }),
  onChildRemoved: jest.fn((_r: unknown, cb: Handler) => { mockHandlers.removed = cb; return jest.fn(); }),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    getList: jest.fn(),
    saveList: jest.fn(() => Promise.resolve()),
    saveListsBatch: jest.fn(() => Promise.resolve()),
    updateList: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

import FirebaseSyncListener from '../FirebaseSyncListener';
import LocalStorageManager from '../LocalStorageManager';
import { revivesDeletedList } from '../storage/mappers';

const storage = LocalStorageManager as jest.Mocked<typeof LocalStorageManager>;

const local = (status: string, extra: object = {}) => ({
  id: 'list-1', name: '15 October 2026', familyGroupId: 'group-1', createdBy: 'user-1',
  createdAt: 1000, status, syncStatus: 'pending', receiptUrl: null, ...extra,
});
const remote = (status: string, extra: object = {}) => ({
  name: '15 October 2026', familyGroupId: 'group-1', createdBy: 'user-1', createdAt: 1000, status, ...extra,
});

beforeAll(() => {
  FirebaseSyncListener.startListeningToLists('group-1');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('remote list data never revives a list deleted here', () => {
  it('ignores an active echo for a locally deleted list', async () => {
    storage.getList.mockResolvedValue(local('deleted') as any);

    await mockHandlers.changed({ key: 'list-1', val: () => remote('active', { receiptUrl: 'receipts/g/list-1/1.jpg' }) });

    expect(storage.saveList).not.toHaveBeenCalled();
  });

  it('still applies a remote delete', async () => {
    storage.getList.mockResolvedValue(local('active') as any);

    await mockHandlers.changed({ key: 'list-1', val: () => remote('deleted') });

    expect(storage.saveList).toHaveBeenCalledWith(expect.objectContaining({ id: 'list-1', status: 'deleted' }));
  });

  it('still applies other changes to a live list', async () => {
    storage.getList.mockResolvedValue(local('active') as any);

    await mockHandlers.changed({ key: 'list-1', val: () => remote('completed', { completedAt: 5 }) });

    expect(storage.saveList).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('a new list from another phone is saved', async () => {
    storage.getList.mockResolvedValue(null);

    await mockHandlers.changed({ key: 'list-2', val: () => remote('active') });

    expect(storage.saveList).toHaveBeenCalledWith(expect.objectContaining({ id: 'list-2', status: 'active' }));
  });
});

describe('revivesDeletedList', () => {
  const l = (status: any) => ({ ...local(status) } as any);
  it.each([
    ['deleted', 'active', true],
    ['deleted', 'completed', true],
    ['deleted', 'deleted', false],
    ['active', 'deleted', false],
    ['active', 'active', false],
    ['completed', 'active', false],
  ])('local %s, incoming %s → %s', (from, to, expected) => {
    expect(revivesDeletedList(l(from), l(to))).toBe(expected);
  });
  it('no local list is never a revival', () => {
    expect(revivesDeletedList(null, l('active'))).toBe(false);
  });
});

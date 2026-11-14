/**
 * Partial Shop in a shop with no signal: the trip is completed and a new list
 * is made for the items not bought. createList waited on a Firebase
 * transaction (usage counter) and a server tier read; offline the transaction
 * never completes, so the new list stayed empty and the spinner stayed on.
 * Here every Firebase call hangs, as offline, with the real UsageTracker.
 */
function never(): Promise<never> { return new Promise<never>(() => {}); }
jest.mock('react-native-get-random-values', () => ({}));
// jest.config maps every @react-native-firebase/* package to one mock file,
// so both packages get one factory (a second jest.mock would replace the first).
function mockFirebase() { return ({
  getDatabase: () => ({}),
  ref: () => ({}),
  get: () => never(),
  set: () => never(),
  runTransaction: () => never(),
  getAuth: () => ({ currentUser: { uid: 'u1' } }),
  getIdTokenResult: () => never(),
}); }
jest.mock('@react-native-firebase/database', () => mockFirebase());
jest.mock('@react-native-firebase/auth', () => mockFirebase());
const mockSaveList = jest.fn(async () => {});
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: { saveList: (...a: unknown[]) => (mockSaveList as any)(...a) } }));
const mockPush = jest.fn(async () => {});
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { pushChange: (...a: unknown[]) => (mockPush as any)(...a) } }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import ShoppingListManager from '../ShoppingListManager';

const user = {
  uid: 'u1', familyGroupId: 'fam',
  usageCounters: { listsCreated: 0, ocrProcessed: 0, urgentItemsCreated: 0, lastResetDate: Date.UTC(2020, 0, 1) },
} as any;

const within = <T,>(p: Promise<T>, ms = 1000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`still waiting after ${ms} ms`)), ms))]);

it('createList returns with every Firebase call hanging (offline), saved locally and queued for sync', async () => {
  const list = await within(ShoppingListManager.createList('Saturday', 'u1', 'fam', user));
  expect(list).toEqual(expect.objectContaining({ name: 'Saturday', familyGroupId: 'fam', status: 'active', syncStatus: 'pending' }));
  expect(mockSaveList).toHaveBeenCalledWith(list);
  expect(mockPush).toHaveBeenCalledWith('list', list.id, 'create', list);
});

it('a blank name is still refused', async () => {
  await expect(within(ShoppingListManager.createList('   ', 'u1', 'fam', user))).rejects.toThrow('List name is required');
});

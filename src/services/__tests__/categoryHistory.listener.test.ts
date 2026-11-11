/**
 * Fable 5.2 review of PR #71: the 1.54.28 filter (skip category-history
 * children that are not usage records) was on the initial load and on
 * child_changed, but not on child_added. An old app version still writes
 * "bread/rolls" two levels deep, and a new "bread" node arriving after start
 * planted a fake category "rolls".
 */
jest.mock('react-native-get-random-values', () => ({}));
const mockCallbacks: Record<string, (snap: any) => Promise<void>> = {};
let mockInitial: Array<{ key: string; val: unknown }> = [];
function mockFirebase() {
  return {
    getDatabase: () => ({}),
    ref: (_d: unknown, p: string) => p,
    onChildAdded: (_r: string, cb: any) => { mockCallbacks.added = cb; return () => {}; },
    onChildChanged: (_r: string, cb: any) => { mockCallbacks.changed = cb; return () => {}; },
    onChildRemoved: (_r: string, cb: any) => { mockCallbacks.removed = cb; return () => {}; },
    get: async () => ({ forEach: (fn: (s: any) => void) => mockInitial.forEach(e => fn({ key: e.key, val: () => e.val })) }),
  };
}
jest.mock('@react-native-firebase/database', () => mockFirebase());
const mockLSM = {
  getCategoryHistoryForItem: jest.fn(async () => []),
  saveCategoryHistory: jest.fn(async (_r: any) => {}),
  updateCategoryHistory: jest.fn(async () => {}),
  saveCategoryHistoryBatch: jest.fn(async (_f: string, _b: any[]) => {}),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import FirebaseSyncListener from '../FirebaseSyncListener';

const settle = () => new Promise(r => setTimeout(r, 0));
const snap = (key: string, val: unknown) => ({ key, val: () => val });
const good = { category: 'dairy', usageCount: 2, lastUsedAt: 5, createdAt: 1 };
const nested = { dairy: { usageCount: 1, lastUsedAt: 1, createdAt: 1 } };

beforeEach(async () => {
  jest.clearAllMocks();
  FirebaseSyncListener.stopListeningToCategoryHistory('fam');
  mockInitial = [{ key: 'milk', val: { dairy: good, rolls: nested } }];
  FirebaseSyncListener.startListeningToCategoryHistory('fam');
  await settle(); await settle();
});

it('initial load keeps the real category and skips the nested one', () => {
  const batch = mockLSM.saveCategoryHistoryBatch.mock.calls[0][1];
  expect(batch.map((b: any) => b.category)).toEqual(['dairy']);
});

it('a node added after start: the nested "category" is skipped, a real one is saved', async () => {
  await mockCallbacks.added(snap('bread', { rolls: nested, bakery: { ...good, category: 'bakery' } }));
  const saved = mockLSM.saveCategoryHistory.mock.calls.map(c => c[0].category);
  expect(saved).toEqual(['bakery']);
});

it('a changed node: the same filter applies', async () => {
  await mockCallbacks.changed(snap('bread', { rolls: nested }));
  expect(mockLSM.saveCategoryHistory).not.toHaveBeenCalled();
});

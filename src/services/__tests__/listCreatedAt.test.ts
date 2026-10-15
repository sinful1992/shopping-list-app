/**
 * Regression tests for the "Created" date bug (task 24).
 *
 * ShoppingListModel.createdAt is `@readonly @date('created_at')`, so unless
 * the create mapper copies it, WatermelonDB stamps the local insert time.
 * Every list that reached a phone through Firebase sync then showed "today",
 * and the next edit on that phone pushed the wrong value back to Firebase
 * (SyncEngine sets the whole list).
 *
 * Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('../UsageTracker', () => ({ __esModule: true, default: {} }));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

const mockPushChange = jest.fn().mockResolvedValue(undefined);
jest.mock('../SyncEngine', () => ({
  __esModule: true,
  default: { pushChange: (...args: any[]) => mockPushChange(...args) },
}));

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(),
  deleteObject: jest.fn(),
}));

import LocalStorageManager from '../LocalStorageManager';
import ShoppingListManager from '../ShoppingListManager';
import { Item, ShoppingList } from '../../models/types';

const DAY = 24 * 60 * 60 * 1000;
// Fixed past instant, far from "now" so an insert-time stamp can't match it.
const CREATED_AT = Date.UTC(2026, 0, 15, 9, 30);

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-ca-${++idCounter}`;

const makeList = (overrides: Partial<ShoppingList> = {}): ShoppingList => ({
  id: nextId('list'),
  name: 'Thursday, 15 January 2026',
  familyGroupId: 'family-ca',
  createdBy: 'user-partner',
  createdAt: CREATED_AT,
  status: 'active',
  completedAt: null,
  completedBy: null,
  receiptUrl: null,
  receiptData: null,
  syncStatus: 'synced',
  isLocked: false,
  lockedBy: null,
  lockedByName: null,
  lockedByRole: null,
  lockedAt: null,
  budget: null,
  totalAmount: null,
  merchantName: null,
  purchaseDate: null,
  currency: null,
  ...overrides,
});

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: nextId('item'),
  listId: 'list-ca-items',
  name: 'Milk',
  quantity: null,
  price: null,
  checked: false,
  createdBy: 'user-partner',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  syncStatus: 'synced',
  ...overrides,
});

beforeEach(() => {
  mockPushChange.mockReset().mockResolvedValue(undefined);
});

describe('list createdAt survives local storage', () => {
  it('saveList (single sync-in / create) keeps the given createdAt', async () => {
    const list = makeList();

    const returned = await LocalStorageManager.saveList(list);
    const stored = await LocalStorageManager.getList(list.id);

    expect(returned.createdAt).toBe(CREATED_AT);
    expect(stored?.createdAt).toBe(CREATED_AT);
  });

  it('saveListsBatch (Firebase initial load) keeps each createdAt', async () => {
    const a = makeList({ createdAt: CREATED_AT });
    const b = makeList({ createdAt: CREATED_AT - 30 * DAY });

    await LocalStorageManager.saveListsBatch([a, b]);

    expect((await LocalStorageManager.getList(a.id))?.createdAt).toBe(a.createdAt);
    expect((await LocalStorageManager.getList(b.id))?.createdAt).toBe(b.createdAt);
  });

  it('a later full update from Firebase does not change createdAt', async () => {
    const list = makeList();
    await LocalStorageManager.saveListsBatch([list]);

    await LocalStorageManager.saveListsBatch([{ ...list, name: 'Renamed', isLocked: true }]);
    await LocalStorageManager.saveList({ ...list, name: 'Renamed again' });

    const stored = await LocalStorageManager.getList(list.id);
    expect(stored?.name).toBe('Renamed again');
    expect(stored?.createdAt).toBe(CREATED_AT);
  });

  it('getAllLists returns the real createdAt (what the home card renders)', async () => {
    const familyGroupId = nextId('family');
    const list = makeList({ familyGroupId });
    await LocalStorageManager.saveListsBatch([list]);

    const lists = await LocalStorageManager.getAllLists(familyGroupId);
    expect(lists.map(l => l.createdAt)).toEqual([CREATED_AT]);
  });
});

describe('editing a synced-in list does not push a wrong createdAt to Firebase', () => {
  it.each([
    ['rename', (id: string) => ShoppingListManager.updateListName(id, 'Weekly shop')],
    ['lock', (id: string) => ShoppingListManager.updateList(id, { isLocked: true, lockedBy: 'user-me' })],
    ['budget', (id: string) => ShoppingListManager.updateList(id, { budget: 50 })],
  ])('%s keeps createdAt locally and in the pushed payload', async (_label, edit) => {
    const list = makeList();
    await LocalStorageManager.saveListsBatch([list]);

    await edit(list.id);

    expect((await LocalStorageManager.getList(list.id))?.createdAt).toBe(CREATED_AT);
    const listPushes = mockPushChange.mock.calls.filter(([type, id]) => type === 'list' && id === list.id);
    expect(listPushes.length).toBeGreaterThan(0);
    for (const [, , , payload] of listPushes) {
      expect(payload.createdAt).toBe(CREATED_AT);
    }
  });
});

describe('item createdAt survives local storage', () => {
  it('saveItemsBatchUpsert (Firebase sync-in) keeps the given createdAt', async () => {
    const listId = nextId('list');
    const item = makeItem({ listId });

    await LocalStorageManager.saveItemsBatchUpsert([item]);

    const items = await LocalStorageManager.getItemsForList(listId);
    expect(items.map(i => i.createdAt)).toEqual([CREATED_AT]);
  });
});

describe('phones that already stored a wrong createdAt heal from Firebase', () => {
  // A record created before the fix: same list, but stamped with the time it
  // landed on this phone instead of its real creation time.
  const WRONG = CREATED_AT + 200 * DAY;

  it('saveListsBatch with only createdAt different rewrites it', async () => {
    const list = makeList();
    await LocalStorageManager.saveList({ ...list, createdAt: WRONG });
    expect((await LocalStorageManager.getList(list.id))?.createdAt).toBe(WRONG);

    await LocalStorageManager.saveListsBatch([list]);

    expect((await LocalStorageManager.getList(list.id))?.createdAt).toBe(CREATED_AT);
  });

  it('saveList (single child-changed sync) rewrites it', async () => {
    const list = makeList();
    await LocalStorageManager.saveList({ ...list, createdAt: WRONG });

    await LocalStorageManager.saveList(list);

    expect((await LocalStorageManager.getList(list.id))?.createdAt).toBe(CREATED_AT);
  });

  it('an incoming createdAt of 0 (missing in Firebase) never overwrites a stored date', async () => {
    const list = makeList();
    await LocalStorageManager.saveList(list);

    await LocalStorageManager.saveListsBatch([{ ...list, createdAt: 0, name: 'Changed' }]);
    await LocalStorageManager.saveList({ ...list, createdAt: 0, name: 'Changed again' });

    const stored = await LocalStorageManager.getList(list.id);
    expect(stored?.name).toBe('Changed again');
    expect(stored?.createdAt).toBe(CREATED_AT);
  });

  it('a list with no createdAt at all still gets a real timestamp, not 0', async () => {
    const before = Date.now();
    const list = makeList({ createdAt: 0 });

    await LocalStorageManager.saveListsBatch([list]);

    const stored = await LocalStorageManager.getList(list.id);
    expect(stored?.createdAt).toBeGreaterThanOrEqual(before);
  });
});

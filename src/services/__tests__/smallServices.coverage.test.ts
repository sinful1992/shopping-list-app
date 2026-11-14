/**
 * HistoryTracker, SearchService, FamilyMembers, StoreLayoutService and
 * AnalyticsService: all were 0 % covered (Fable audit task 137).
 */
jest.mock('react-native-get-random-values', () => ({}));
const mockLSM = {
  getCompletedLists: jest.fn(),
  getList: jest.fn(),
  getItemsForLists: jest.fn(),
  getStoreLayoutByStore: jest.fn(),
  updateStoreLayout: jest.fn(),
  saveStoreLayout: jest.fn(),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
const mockGetItems = jest.fn();
jest.mock('../ItemManager', () => ({ __esModule: true, default: { getItemsForList: (...a: unknown[]) => mockGetItems(...a) } }));
const mockArchive = { getNonArchivedLists: jest.fn(), getArchivedLists: jest.fn(), autoArchiveOldLists: jest.fn() };
jest.mock('../ArchiveService', () => ({ __esModule: true, get default() { return mockArchive; } }));
const mockPush = jest.fn<Promise<void>, unknown[]>(async () => {});
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { pushChange: (...a: unknown[]) => mockPush(...a) } }));
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a) } }));
const mockGet = jest.fn();
function mockFirebase() { return { getDatabase: () => ({}), ref: (_d: unknown, p: string) => p, get: (...a: unknown[]) => mockGet(...a) }; }
jest.mock('@react-native-firebase/database', () => mockFirebase());
const mockBackfill = jest.fn();
jest.mock('../analyticsItemBackfill', () => ({ backfillMissingItems: (...a: unknown[]) => mockBackfill(...a) }));
const mockBuild = jest.fn((..._a: unknown[]) => ({ summary: true }));
jest.mock('../analyticsAggregation', () => ({ bucketFor: (d: number) => `bucket-${d}`, buildAnalyticsSummary: (...a: unknown[]) => mockBuild(...a) }));

import HistoryTracker from '../HistoryTracker';
import SearchService from '../SearchService';
import { loadFamilyMembers, memberName } from '../FamilyMembers';
import StoreLayoutService from '../StoreLayoutService';
import AnalyticsService from '../AnalyticsService';

const settle = () => new Promise(r => setTimeout(r, 0));
const NOW = 1_800_000_000_000;
const DAY = 24 * 3600 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockPush.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('HistoryTracker', () => {
  it('passes reads through and wraps their errors with context', async () => {
    mockLSM.getCompletedLists.mockResolvedValueOnce([{ id: 'a' }]);
    expect(await HistoryTracker.getCompletedLists('fam')).toEqual([{ id: 'a' }]);
    mockLSM.getCompletedLists.mockRejectedValueOnce(new Error('db'));
    await expect(HistoryTracker.getCompletedLists('fam')).rejects.toThrow('Failed to get completed lists: db');

    for (const [method, svc, msg] of [
      ['getNonArchivedLists', 'getNonArchivedLists', 'Failed to get non-archived lists: x'],
      ['getArchivedLists', 'getArchivedLists', 'Failed to get archived lists: x'],
      ['autoArchiveOldLists', 'autoArchiveOldLists', 'Failed to auto-archive lists: x'],
    ] as const) {
      (mockArchive as any)[svc].mockResolvedValueOnce('ok');
      expect(await (HistoryTracker as any)[method]('fam')).toBe('ok');
      (mockArchive as any)[svc].mockRejectedValueOnce(new Error('x'));
      await expect((HistoryTracker as any)[method]('fam')).rejects.toThrow(msg);
    }
  });

  it('searchLists goes to SearchService; errors get context', async () => {
    const spy = jest.spyOn(SearchService, 'searchCompletedLists').mockResolvedValueOnce([{ id: 's' }] as any);
    expect(await HistoryTracker.searchLists('fam', 'milk')).toEqual([{ id: 's' }]);
    spy.mockRejectedValueOnce(new Error('q'));
    await expect(HistoryTracker.searchLists('fam', 'milk')).rejects.toThrow('Failed to search lists: q');
  });

  it('getListDetails: list, its items and receipt; a missing list is an error', async () => {
    mockLSM.getList.mockResolvedValueOnce({ id: 'l1', receiptData: { r: 1 } });
    mockGetItems.mockResolvedValueOnce([{ id: 'i' }]);
    expect(await HistoryTracker.getListDetails('l1')).toEqual({ list: { id: 'l1', receiptData: { r: 1 } }, items: [{ id: 'i' }], receiptData: { r: 1 } });
    mockLSM.getList.mockResolvedValueOnce(null);
    await expect(HistoryTracker.getListDetails('gone')).rejects.toThrow('Failed to get list details: List not found');
  });
});

describe('SearchService', () => {
  const lists = [
    { id: 'a', name: 'Saturday shop', storeName: 'Tesco', completedAt: 1 },
    { id: 'b', name: 'Party', storeName: null, completedAt: 3 },
    { id: 'c', name: 'Weekly', storeName: 'Aldi', completedAt: 2 },
  ];
  beforeEach(() => {
    mockLSM.getCompletedLists.mockResolvedValue(lists);
    mockLSM.getItemsForLists.mockResolvedValue([{ listId: 'b', name: 'Tesco Finest cake' }, { listId: 'c', name: 'Milk' }]);
  });

  it('matches list name, store name or an item, case-insensitive, newest first', async () => {
    expect((await SearchService.searchCompletedLists('fam', ' TESCO ')).map(l => l.id)).toEqual(['b', 'a']);
    expect((await SearchService.searchCompletedLists('fam', 'milk')).map(l => l.id)).toEqual(['c']);
  });

  it('reads items only for lists whose name and store did not match', async () => {
    await SearchService.searchCompletedLists('fam', 'tesco');
    expect(mockLSM.getItemsForLists).toHaveBeenCalledWith(['b', 'c']);
  });

  it('a blank query gives nothing and reads nothing; an error gives nothing', async () => {
    expect(await SearchService.searchCompletedLists('fam', '  ')).toEqual([]);
    expect(mockLSM.getCompletedLists).not.toHaveBeenCalled();
    mockLSM.getCompletedLists.mockRejectedValueOnce(new Error('db'));
    expect(await SearchService.searchCompletedLists('fam', 'x')).toEqual([]);
  });
});

describe('FamilyMembers', () => {
  it('loads each member, fills a missing uid, skips missing and failed ones (reported)', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/users/u3') throw new Error('denied');
      if (path === '/users/u2') return { val: () => null };
      return { val: () => ({ displayName: 'Anna' }) };
    });
    expect(await loadFamilyMembers(['u1', 'u2', 'u3'])).toEqual([{ displayName: 'Anna', uid: 'u1' }]);
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'loadFamilyMembers');
  });

  it('no ids: no reads', async () => {
    expect(await loadFamilyMembers([])).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('memberName: display name, then role, then the email name, then blank', () => {
    expect(memberName({ displayName: 'Anna', role: 'Mum' } as any)).toBe('Anna');
    expect(memberName({ displayName: '', role: 'Mum' } as any)).toBe('Mum');
    expect(memberName({ email: 'bob@x.com' } as any)).toBe('bob');
    expect(memberName({} as any)).toBe('');
  });
});

describe('StoreLayoutService', () => {
  it('an empty order is refused (Firebase would store null)', async () => {
    await expect(StoreLayoutService.saveLayout('Tesco', 'fam', [], 'u1')).rejects.toThrow('must not be empty');
  });

  it('a new store gets a new pending layout, synced as a create', async () => {
    mockLSM.getStoreLayoutByStore.mockResolvedValue(null);
    mockLSM.saveStoreLayout.mockImplementation(async (l: object) => l);
    const l = await StoreLayoutService.saveLayout('Tesco', 'fam', ['dairy'] as any, 'u1');
    expect(l).toEqual(expect.objectContaining({ storeName: 'Tesco', familyGroupId: 'fam', categoryOrder: ['dairy'], createdBy: 'u1', createdAt: NOW, updatedAt: NOW, syncStatus: 'pending' }));
    expect(mockPush).toHaveBeenCalledWith('storeLayout', l.id, 'create');
  });

  it('a known store updates its layout, synced as an update', async () => {
    mockLSM.getStoreLayoutByStore.mockResolvedValue({ id: 'lay1' });
    mockLSM.updateStoreLayout.mockResolvedValue({ id: 'lay1', categoryOrder: ['bakery'] });
    await StoreLayoutService.saveLayout('Tesco', 'fam', ['bakery'] as any, 'u1');
    expect(mockLSM.updateStoreLayout).toHaveBeenCalledWith('lay1', { categoryOrder: ['bakery'], updatedAt: NOW, syncStatus: 'pending' });
    expect(mockPush).toHaveBeenCalledWith('storeLayout', 'lay1', 'update');
  });

  it('a failing sync is reported, the save stands', async () => {
    mockLSM.getStoreLayoutByStore.mockResolvedValue(null);
    mockLSM.saveStoreLayout.mockImplementation(async (l: object) => l);
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await StoreLayoutService.saveLayout('Aldi', 'fam', ['dairy'] as any, 'u1');
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'StoreLayoutService pushChange create');
    mockLSM.getStoreLayoutByStore.mockResolvedValue({ id: 'lay1' });
    mockLSM.updateStoreLayout.mockResolvedValue({ id: 'lay1' });
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await StoreLayoutService.saveLayout('Aldi', 'fam', ['dairy'] as any, 'u1');
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'StoreLayoutService pushChange update');
    expect(mockLSM.getStoreLayoutByStore).toHaveBeenCalledWith('Aldi', 'fam');
  });

  it('getLayoutForStore reads storage', async () => {
    mockLSM.getStoreLayoutByStore.mockResolvedValue({ id: 'x' });
    expect(await StoreLayoutService.getLayoutForStore('Tesco', 'fam')).toEqual({ id: 'x' });
  });
});

describe('AnalyticsService', () => {
  it('groups local items by list for the window and builds the summary', async () => {
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mockLSM.getItemsForLists.mockResolvedValue([{ listId: 'a', n: 1 }, { listId: 'a', n: 2 }, { listId: 'b', n: 3 }]);
    expect(await AnalyticsService.getAnalyticsSummary('fam', 7, { extra: 1 } as any)).toEqual({ summary: true });
    expect(mockLSM.getCompletedLists).toHaveBeenCalledWith('fam', NOW - 7 * DAY);
    const [lists, byList, opts] = mockBuild.mock.calls[0] as [unknown, Map<string, unknown[]>, unknown];
    expect(lists).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(byList.get('a')).toHaveLength(2);
    expect(opts).toEqual({ trendBucket: 'bucket-7', windowStart: NOW - 7 * DAY, windowEnd: NOW, extra: 1 });
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  it('lists with no local items are fetched, within the time budget', async () => {
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    mockLSM.getItemsForLists.mockResolvedValue([{ listId: 'a' }]);
    mockBackfill.mockResolvedValue([{ listId: 'b' }, { listId: 'b' }, { listId: 'c' }]);
    await AnalyticsService.getAnalyticsSummary('fam');
    expect(mockBackfill).toHaveBeenCalledWith('fam', ['b', 'c']);
    const byList = mockBuild.mock.calls[0][1] as Map<string, unknown[]>;
    expect(byList.get('b')).toHaveLength(2);
    expect(byList.get('c')).toHaveLength(1);
  });

  it('a fetch slower than 3 s is not waited for: the summary is built without it', async () => {
    jest.useFakeTimers();
    mockLSM.getCompletedLists.mockResolvedValue([{ id: 'a' }]);
    mockLSM.getItemsForLists.mockResolvedValue([]);
    mockBackfill.mockReturnValue(new Promise(() => {}));
    const p = AnalyticsService.getAnalyticsSummary('fam');
    await jest.advanceTimersByTimeAsync(3000);
    await p;
    jest.useRealTimers();
    expect((mockBuild.mock.calls[0][1] as Map<string, unknown[]>).size).toBe(0);
  });
});

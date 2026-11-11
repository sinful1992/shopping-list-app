/**
 * OPTIMISE P9 (Fable audit task 137): the Archived and History tabs took the
 * newest 200 completed lists and filtered them in JS. Archived lists are the
 * oldest, so once a family had more than 200 completed lists the Archived tab
 * silently missed them, and History missed non-archived lists past 200.
 * Real WatermelonDB on the in-memory LokiJS adapter.
 */
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: { updateList: jest.fn() } }));

import LocalStorageManager from '../LocalStorageManager';
import ArchiveService from '../ArchiveService';
import { ShoppingList } from '../../models/types';

let n = 0;
const list = (familyGroupId: string, over: Partial<ShoppingList>): ShoppingList => ({
  id: `l-p9-${++n}`, name: `L${n}`, familyGroupId, createdBy: 'u1', createdAt: n,
  status: 'completed', completedAt: n, completedBy: 'u1', receiptUrl: null, receiptData: null,
  syncStatus: 'synced', isLocked: false, lockedBy: null, lockedByName: null, lockedByRole: null,
  lockedAt: null, budget: null, storeName: null, archived: false, layoutApplied: false,
  totalAmount: null, merchantName: null, purchaseDate: null, currency: null, ...over,
} as ShoppingList);

describe('a family with 250 completed lists, the 50 oldest archived', () => {
  const fam = 'fam-p9-big';
  const archived: ShoppingList[] = [];
  const recent: ShoppingList[] = [];

  beforeAll(async () => {
    for (let i = 0; i < 50; i++) archived.push(list(fam, { completedAt: 1_000 + i, archived: true }));
    for (let i = 0; i < 200; i++) recent.push(list(fam, { completedAt: 10_000 + i, archived: i % 2 === 0 ? false : (null as any) }));
    await LocalStorageManager.saveListsBatch([
      ...archived, ...recent,
      list(fam, { status: 'active', completedAt: null, archived: true }),
      list(fam, { status: 'deleted', archived: true }),
      list('fam-p9-other', { archived: true }),
    ]);
  }, 60_000);

  it('Archived shows all 50 archived lists, newest completion first', async () => {
    const got = await ArchiveService.getArchivedLists(fam);
    expect(got).toHaveLength(50);
    expect(got[0].completedAt).toBe(1_049);
    expect(got.at(-1)!.completedAt).toBe(1_000);
    expect(got.every(l => l.archived === true && l.status === 'completed' && l.familyGroupId === fam)).toBe(true);
  });

  it('History shows all 200 non-archived lists (false and null both count), newest first', async () => {
    const got = await ArchiveService.getNonArchivedLists(fam);
    expect(got).toHaveLength(200);
    expect(got[0].completedAt).toBe(10_199);
    expect(got.every(l => !l.archived && l.status === 'completed')).toBe(true);
  });

  it('an archived list newer than 200 others is not lost either', async () => {
    const late = list(fam, { completedAt: 99_999, archived: true });
    await LocalStorageManager.saveListsBatch([late]);
    const got = await ArchiveService.getArchivedLists(fam);
    expect(got[0].id).toBe(late.id);
    expect(got).toHaveLength(51);
  });
});

it('an empty family gives empty tabs', async () => {
  expect(await ArchiveService.getArchivedLists('fam-p9-none')).toEqual([]);
  expect(await ArchiveService.getNonArchivedLists('fam-p9-none')).toEqual([]);
});

it('a storage failure gives an empty tab, not a crash', async () => {
  const spy = jest.spyOn(LocalStorageManager, 'getCompletedListsByArchived' as any).mockRejectedValue(new Error('db'));
  expect(await ArchiveService.getArchivedLists('x')).toEqual([]);
  expect(await ArchiveService.getNonArchivedLists('x')).toEqual([]);
  spy.mockRestore();
});

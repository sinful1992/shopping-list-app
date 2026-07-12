import { mergeWithPendingLists, MIN_PENDING_AGE_MS, PendingListEntry } from '../pendingListsMerge';
import { ShoppingList, SyncStatus } from '../../models/types';

const makeList = (id: string, overrides: Partial<ShoppingList> = {}): ShoppingList => ({
  id,
  name: `List ${id}`,
  familyGroupId: 'fg-1',
  createdBy: 'u1',
  createdAt: 1000,
  status: 'active',
  completedAt: null,
  completedBy: null,
  receiptUrl: null,
  receiptData: null,
  syncStatus: 'synced' as SyncStatus,
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

const pendingMap = (...entries: [string, PendingListEntry][]) => new Map(entries);

describe('mergeWithPendingLists', () => {
  it('appends pending lists the DB has not emitted yet', () => {
    const pendingList = makeList('p1', { syncStatus: 'pending', createdAt: 3000 });
    const pending = pendingMap(['p1', { list: pendingList, addedAt: 0 }]);

    const merged = mergeWithPendingLists([makeList('a')], pending, 100);

    expect(merged.map(l => l.id)).toEqual(['p1', 'a']);
    expect(pending.has('p1')).toBe(true); // not released — DB hasn't emitted it
  });

  it('does not duplicate a pending list once the DB emits it', () => {
    const pending = pendingMap(['a', { list: makeList('a'), addedAt: 0 }]);
    const merged = mergeWithPendingLists([makeList('a')], pending, 100);
    expect(merged.filter(l => l.id === 'a')).toHaveLength(1);
  });

  it('releases a pending entry only when synced AND older than the window', () => {
    const addedAt = 10_000;
    const pending = pendingMap(['a', { list: makeList('a'), addedAt }]);

    // Emitted but still inside the window → kept
    mergeWithPendingLists([makeList('a')], pending, addedAt + MIN_PENDING_AGE_MS - 1);
    expect(pending.has('a')).toBe(true);

    // Window elapsed → released
    mergeWithPendingLists([makeList('a')], pending, addedAt + MIN_PENDING_AGE_MS);
    expect(pending.has('a')).toBe(false);
  });

  it('keeps a pending entry whose emitted list is still syncStatus pending', () => {
    const pending = pendingMap(['a', { list: makeList('a'), addedAt: 0 }]);
    mergeWithPendingLists([makeList('a', { syncStatus: 'pending' })], pending, MIN_PENDING_AGE_MS * 10);
    expect(pending.has('a')).toBe(true);
  });

  it('sorts merged output by createdAt descending', () => {
    const merged = mergeWithPendingLists(
      [makeList('old', { createdAt: 1 }), makeList('new', { createdAt: 3 })],
      pendingMap(['mid', { list: makeList('mid', { createdAt: 2 }), addedAt: 0 }]),
      100
    );
    expect(merged.map(l => l.id)).toEqual(['new', 'mid', 'old']);
  });
});

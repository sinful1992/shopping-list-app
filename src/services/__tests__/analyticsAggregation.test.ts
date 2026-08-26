import { buildAnalyticsSummary } from '../analyticsAggregation';
import { Item, ShoppingList } from '../../models/types';

let idCounter = 0;

const makeList = (overrides: Partial<ShoppingList> = {}): ShoppingList => ({
  id: `list-${++idCounter}`,
  name: 'Shop',
  familyGroupId: 'group-1',
  createdBy: 'user-1',
  createdAt: Date.UTC(2026, 5, 10),
  status: 'completed',
  completedAt: Date.UTC(2026, 5, 10),
  completedBy: 'user-1',
  receiptUrl: null,
  receiptData: null,
  syncStatus: 'synced',
  isLocked: false,
  lockedBy: null,
  lockedByName: null,
  lockedByRole: null,
  lockedAt: null,
  budget: null,
  storeName: 'Tesco',
  totalAmount: null,
  merchantName: null,
  purchaseDate: null,
  currency: '£',
  ...overrides,
});

const makeItem = (listId: string, overrides: Partial<Item> = {}): Item => ({
  id: `item-${++idCounter}`,
  listId,
  name: 'Milk',
  quantity: null,
  price: 1,
  checked: true,
  createdBy: 'user-1',
  createdAt: 0,
  updatedAt: 0,
  syncStatus: 'synced',
  category: 'Dairy',
  ...overrides,
});

const index = (...entries: [ShoppingList, Item[]][]): Map<string, Item[]> =>
  new Map(entries.map(([list, items]) => [list.id, items]));

describe('buildAnalyticsSummary', () => {
  it('prefers the receipt total over the item sum for a list total', () => {
    const list = makeList({ totalAmount: 20 });
    const items = [makeItem(list.id, { price: 1 }), makeItem(list.id, { price: 2 })];

    const summary = buildAnalyticsSummary([list], index([list, items]));

    expect(summary.totalSpent).toBe(20);
  });

  it('falls back to the item sum when there is no receipt total', () => {
    const list = makeList({ totalAmount: null });
    const items = [makeItem(list.id, { price: 1.5 }), makeItem(list.id, { price: 2.5 })];

    const summary = buildAnalyticsSummary([list], index([list, items]));

    expect(summary.totalSpent).toBe(4);
  });

  it('groups spend and trips by store, busiest store first by spend', () => {
    const tesco1 = makeList({ storeName: 'Tesco', totalAmount: 30 });
    const tesco2 = makeList({ storeName: 'Tesco', totalAmount: 10 });
    const lidl = makeList({ storeName: 'Lidl', totalAmount: 25 });

    const summary = buildAnalyticsSummary(
      [tesco1, tesco2, lidl],
      index([tesco1, []], [tesco2, []], [lidl, []]),
    );

    expect(summary.spendingByStore).toEqual([
      { storeName: 'Tesco', totalSpent: 40, tripCount: 2, averagePerTrip: 20 },
      { storeName: 'Lidl', totalSpent: 25, tripCount: 1, averagePerTrip: 25 },
    ]);
    expect(summary.mostFrequentStore).toBe('Tesco');
    expect(summary.totalTrips).toBe(3);
    expect(summary.averagePerTrip).toBeCloseTo(65 / 3);
  });

  it('files a list with no store under Unknown', () => {
    const list = makeList({ storeName: null, totalAmount: 5 });

    const summary = buildAnalyticsSummary([list], index([list, []]));

    expect(summary.spendingByStore[0].storeName).toBe('Unknown');
  });

  it('caps top items at the requested limit', () => {
    const list = makeList({ totalAmount: 10 });
    const items = ['a', 'b', 'c', 'd'].map(name => makeItem(list.id, { name, price: 1 }));

    const summary = buildAnalyticsSummary([list], index([list, items]), { topItemsLimit: 2 });

    expect(summary.topItems).toHaveLength(2);
  });

  it('returns a zeroed summary when there are no trips', () => {
    const summary = buildAnalyticsSummary([], new Map());

    expect(summary.totalSpent).toBe(0);
    expect(summary.totalTrips).toBe(0);
    expect(summary.averagePerTrip).toBe(0);
    expect(summary.mostFrequentStore).toBeNull();
    expect(summary.topItems).toEqual([]);
    expect(summary.categoryBreakdown).toEqual([]);
  });
});

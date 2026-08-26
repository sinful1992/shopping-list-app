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
  describe('list totals', () => {
    it('prefers the receipt total over the item sum', () => {
      const list = makeList({ totalAmount: 20 });
      const items = [makeItem(list.id, { price: 1 }), makeItem(list.id, { price: 2 })];

      expect(buildAnalyticsSummary([list], index([list, items])).totalSpent).toBe(20);
    });

    it('falls back to the item sum when there is no receipt total', () => {
      const list = makeList({ totalAmount: null });
      const items = [makeItem(list.id, { price: 1.5 }), makeItem(list.id, { price: 2.5 })];

      expect(buildAnalyticsSummary([list], index([list, items])).totalSpent).toBe(4);
    });

    it('multiplies the fallback sum by unitQty', () => {
      const list = makeList({ totalAmount: null });
      const items = [makeItem(list.id, { price: 2.5, unitQty: 6 })];

      expect(buildAnalyticsSummary([list], index([list, items])).totalSpent).toBe(15);
    });

    it('keeps a receipt total of zero rather than falling back to items', () => {
      const list = makeList({ totalAmount: 0 });
      const items = [makeItem(list.id, { price: 4 })];

      expect(buildAnalyticsSummary([list], index([list, items])).totalSpent).toBe(0);
    });

    it('excludes items left unchecked from the fallback sum', () => {
      const list = makeList({ totalAmount: null });
      const items = [
        makeItem(list.id, { price: 3, checked: true }),
        makeItem(list.id, { price: 10, checked: false }),
      ];

      expect(buildAnalyticsSummary([list], index([list, items])).totalSpent).toBe(3);
    });
  });

  describe('itemised spend', () => {
    it('counts a multi-unit item at its line total', () => {
      const list = makeList({ totalAmount: 15 });
      const items = [makeItem(list.id, { name: 'Eggs', price: 2.5, unitQty: 6 })];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.itemisedTotal).toBe(15);
      expect(summary.topItems[0]).toMatchObject({
        name: 'Eggs',
        purchaseCount: 1,
        unitsPurchased: 6,
        totalSpent: 15,
        averagePrice: 2.5,
      });
    });

    it('ignores priced items that were never checked off', () => {
      const list = makeList({ totalAmount: 5 });
      const items = [
        makeItem(list.id, { name: 'Milk', price: 5, checked: true }),
        makeItem(list.id, { name: 'Caviar', price: 80, checked: false }),
      ];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.itemisedTotal).toBe(5);
      expect(summary.itemsPurchased).toBe(1);
      expect(summary.topItems.map(i => i.name)).toEqual(['Milk']);
      expect(summary.categoryBreakdown.map(c => c.totalSpent)).toEqual([5]);
    });

    it('ignores checked items that never got a price', () => {
      const list = makeList({ totalAmount: 5 });
      const items = [
        makeItem(list.id, { name: 'Milk', price: 5 }),
        makeItem(list.id, { name: 'Bag', price: null }),
      ];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.itemsPurchased).toBe(1);
      expect(summary.topItems.map(i => i.name)).toEqual(['Milk']);
    });
  });

  describe('category breakdown', () => {
    it('takes percentages against the itemised total, so they sum to 100', () => {
      // Receipt total is above the item sum — the shortfall must not skew the
      // percentages, which are a breakdown of the items and nothing else.
      const list = makeList({ totalAmount: 100 });
      const items = [
        makeItem(list.id, { name: 'Milk', price: 30, category: 'Dairy' }),
        makeItem(list.id, { name: 'Bread', price: 10, category: 'Bakery' }),
      ];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.categoryBreakdown).toEqual([
        { category: 'Dairy', totalSpent: 30, itemCount: 1, percentage: 75 },
        { category: 'Bakery', totalSpent: 10, itemCount: 1, percentage: 25 },
      ]);
      const sum = summary.categoryBreakdown.reduce((s, c) => s + c.percentage, 0);
      expect(sum).toBeCloseTo(100);
    });

    it('files an uncategorised item under Other', () => {
      const list = makeList({ totalAmount: 2 });
      const items = [makeItem(list.id, { price: 2, category: null })];

      expect(buildAnalyticsSummary([list], index([list, items])).categoryBreakdown[0].category)
        .toBe('Other');
    });
  });

  describe('unitemised spend', () => {
    it('reports the gap between the receipt total and the items behind it', () => {
      const list = makeList({ totalAmount: 50 });
      const items = [makeItem(list.id, { price: 20 })];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.itemisedTotal).toBe(20);
      expect(summary.unitemisedTotal).toBe(30);
    });

    it('clamps at zero when the items outrun the receipt', () => {
      // A till discount puts the receipt below the sum of what was scanned.
      const list = makeList({ totalAmount: 10 });
      const items = [makeItem(list.id, { price: 25 })];

      expect(buildAnalyticsSummary([list], index([list, items])).unitemisedTotal).toBe(0);
    });
  });

  describe('top items', () => {
    it('folds singular and plural spellings into one row', () => {
      const first = makeList({ totalAmount: 2 });
      const second = makeList({ totalAmount: 3 });
      const summary = buildAnalyticsSummary(
        [first, second],
        index(
          [first, [makeItem(first.id, { name: 'Avocado', price: 2 })]],
          [second, [makeItem(second.id, { name: 'Avocados', price: 3 })]],
        ),
      );

      expect(summary.topItems).toHaveLength(1);
      expect(summary.topItems[0].purchaseCount).toBe(2);
      expect(summary.topItems[0].totalSpent).toBe(5);
    });

    it('labels a group with a spelling the user actually typed', () => {
      // Never the group key: itemGroupKey('hummus') is 'hummu'.
      const list = makeList({ totalAmount: 6 });
      const items = [
        makeItem(list.id, { name: 'Hummus', price: 2 }),
        makeItem(list.id, { name: 'Hummus', price: 2 }),
        makeItem(list.id, { name: 'Houmous', price: 2 }),
      ];

      expect(buildAnalyticsSummary([list], index([list, items])).topItems[0].name)
        .toBe('Hummus');
    });

    it('counts lists appeared on, not units, for purchaseCount', () => {
      const list = makeList({ totalAmount: 15 });
      const items = [makeItem(list.id, { name: 'Eggs', price: 2.5, unitQty: 6 })];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.topItems[0].purchaseCount).toBe(1);
      expect(summary.topItems[0].unitsPurchased).toBe(6);
    });

    it('caps at the requested limit', () => {
      const list = makeList({ totalAmount: 10 });
      const items = ['apple', 'bread', 'cheese', 'dates'].map(name =>
        makeItem(list.id, { name, price: 1 }),
      );

      expect(buildAnalyticsSummary([list], index([list, items]), { topItemsLimit: 2 }).topItems)
        .toHaveLength(2);
    });
  });

  describe('stores', () => {
    it('groups spend and trips by store, biggest spend first', () => {
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

      expect(buildAnalyticsSummary([list], index([list, []])).spendingByStore[0].storeName)
        .toBe('Unknown');
    });
  });

  describe('degenerate input', () => {
    it('returns a zeroed summary when there are no trips', () => {
      const summary = buildAnalyticsSummary([], new Map());

      expect(summary.totalSpent).toBe(0);
      expect(summary.totalTrips).toBe(0);
      expect(summary.averagePerTrip).toBe(0);
      expect(summary.mostFrequentStore).toBeNull();
      expect(summary.topItems).toEqual([]);
      expect(summary.categoryBreakdown).toEqual([]);
      expect(summary.unitemisedTotal).toBe(0);
    });

    it('never divides by zero when trips carry no prices at all', () => {
      // Reachable: the empty state only checks the trip count, so this input
      // renders, and a NaN reaches a chart as a NaN% bar width.
      const list = makeList({ totalAmount: null });
      const items = [makeItem(list.id, { price: null })];

      const summary = buildAnalyticsSummary([list], index([list, items]));

      expect(summary.totalSpent).toBe(0);
      expect(summary.averagePerTrip).toBe(0);
      expect(summary.spendingByStore[0].averagePerTrip).toBe(0);
      expect(summary.categoryBreakdown).toEqual([]);
      for (const value of Object.values(summary)) {
        expect(Number.isNaN(value as number)).toBe(false);
      }
    });
  });
});

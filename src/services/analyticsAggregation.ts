import { Item, ShoppingList } from '../models/types';
import { itemGroupKey } from '../utils/itemGrouping';

/**
 * Pure aggregation behind AnalyticsService.
 *
 * Split out from the service so the arithmetic can be tested without a
 * database: the service does the I/O, this does the sums.
 */

export interface SpendingByStore {
  storeName: string;
  totalSpent: number;
  tripCount: number;
  averagePerTrip: number;
}

export interface SpendingTrend {
  date: number;
  amount: number;
  tripCount: number;
}

export interface TopItem {
  /** A spelling the user actually typed — this is written back into lists. */
  name: string;
  /** Lists the item appeared on. Not a unit count; see unitsPurchased. */
  purchaseCount: number;
  unitsPurchased: number;
  totalSpent: number;
  /** Spend per unit, so a 6-pack does not read as the price of one. */
  averagePrice: number;
}

export interface CategorySpending {
  category: string;
  totalSpent: number;
  itemCount: number;
  percentage: number;
}

export type TrendBucket = 'week' | 'month';

export interface AnalyticsSummary {
  totalSpent: number;
  totalTrips: number;
  averagePerTrip: number;
  itemsPurchased: number;
  mostFrequentStore: string | null;
  topItems: TopItem[];
  spendingByStore: SpendingByStore[];
  spendingTrend: SpendingTrend[];
  /** Which unit spendingTrend is bucketed into, so the UI can label it. */
  trendBucket: TrendBucket;
  categoryBreakdown: CategorySpending[];
  /** Trip counts indexed by JS weekday, Sunday first. */
  tripsByWeekday: number[];
  /** Spend that reached a priced, bought item — what categoryBreakdown sums to. */
  itemisedTotal: number;
  /** Receipt spend with no item behind it. Never negative. */
  unitemisedTotal: number;
}

export interface AggregationOptions {
  topItemsLimit?: number;
  trendBucket?: TrendBucket;
}

const DEFAULT_TOP_ITEMS = 10;

/**
 * Calendar months are too coarse for a 30-day window.
 *
 * A month-bucketed 30-day period straddles two calendar months, so the trend
 * was a two-point line comparing a few days against a full month — a cliff or
 * a spike that is an artefact of today's date, not of spending. And when every
 * trip happened to fall inside one calendar month the chart had a single point
 * and vanished behind "not enough data". Weeks give 4–5 comparable buckets.
 */
export function bucketFor(daysBack: number): TrendBucket {
  return daysBack <= 31 ? 'week' : 'month';
}

/** Midnight on the Monday of this date's week, local time. */
function startOfWeek(date: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay() is Sunday-first; shift so Monday starts the week.
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start.getTime();
}

function startOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

/** Divide without ever handing NaN or Infinity to a chart. */
export function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * What an item actually cost.
 *
 * Item.price is per-unit app-wide — ReceiptMatchScreen derives it from a
 * receipt line by dividing, and both the running total and the History totals
 * multiply it back up. Analytics summed the bare price, so six eggs at £2.50
 * counted as £2.50.
 */
function lineTotal(item: Item): number {
  return (item.price ?? 0) * (item.unitQty ?? 1);
}

/**
 * Whether an item counts as bought.
 *
 * Completing a trip leaves unchecked items on the list — completeShoppingFast
 * only records how many there were. Those items keep whatever price was
 * predicted or typed for them, so counting every priced item inflated spend
 * with things that were never bought. Same trap shoppingStats documents for
 * the running total (v1.30.2).
 */
function wasBought(item: Item): boolean {
  return item.checked && item.price !== null;
}

/** Total attributed to a completed list: receipt total when known, item sum otherwise. */
function listTotalFor(list: ShoppingList, items: Item[]): number {
  if (list.totalAmount !== null && list.totalAmount !== undefined) return list.totalAmount;
  return items.reduce((sum, item) => (wasBought(item) ? sum + lineTotal(item) : sum), 0);
}

export function buildAnalyticsSummary(
  lists: ShoppingList[],
  itemsByList: Map<string, Item[]>,
  options: AggregationOptions = {},
): AnalyticsSummary {
  const topItemsLimit = options.topItemsLimit ?? DEFAULT_TOP_ITEMS;
  const trendBucket = options.trendBucket ?? 'month';

  let totalSpent = 0;
  let itemisedTotal = 0;
  let itemsPurchased = 0;
  const storeData: { [store: string]: { total: number; count: number } } = {};
  const categoryData: { [category: string]: { total: number; count: number } } = {};
  const trendData = new Map<number, { amount: number; count: number }>();
  const tripsByWeekday = [0, 0, 0, 0, 0, 0, 0];

  // Keyed on itemGroupKey so "avocado" and "avocados" are one row, matching
  // the Prices tab. The key is a lookup value and must never be rendered
  // ("hummus" keys as "hummu"), so each group carries the spellings the user
  // typed and the most-used one becomes the label.
  const itemData = new Map<string, {
    purchaseCount: number;
    unitsPurchased: number;
    totalSpent: number;
    spellings: Map<string, number>;
  }>();

  for (const list of lists) {
    const items = itemsByList.get(list.id) ?? [];
    const listTotal = listTotalFor(list, items);

    totalSpent += listTotal;

    const store = list.storeName || 'Unknown';
    if (!storeData[store]) storeData[store] = { total: 0, count: 0 };
    storeData[store].total += listTotal;
    storeData[store].count += 1;

    const date = new Date(list.completedAt || list.createdAt);
    tripsByWeekday[date.getDay()] += 1;

    const bucketStart = trendBucket === 'week' ? startOfWeek(date) : startOfMonth(date);
    const bucket = trendData.get(bucketStart);
    if (bucket) {
      bucket.amount += listTotal;
      bucket.count += 1;
    } else {
      trendData.set(bucketStart, { amount: listTotal, count: 1 });
    }

    for (const item of items) {
      if (!wasBought(item)) continue;

      const spent = lineTotal(item);
      const units = item.unitQty ?? 1;
      itemisedTotal += spent;
      itemsPurchased += 1;

      const key = itemGroupKey(item.name) || item.name.toLowerCase();
      let group = itemData.get(key);
      if (!group) {
        group = { purchaseCount: 0, unitsPurchased: 0, totalSpent: 0, spellings: new Map() };
        itemData.set(key, group);
      }
      group.purchaseCount += 1;
      group.unitsPurchased += units;
      group.totalSpent += spent;
      group.spellings.set(item.name, (group.spellings.get(item.name) ?? 0) + 1);

      const category = item.category || 'Other';
      if (!categoryData[category]) categoryData[category] = { total: 0, count: 0 };
      categoryData[category].total += spent;
      categoryData[category].count += 1;
    }
  }

  const spendingByStore: SpendingByStore[] = Object.entries(storeData)
    .map(([storeName, data]) => ({
      storeName,
      totalSpent: data.total,
      tripCount: data.count,
      averagePerTrip: safeDiv(data.total, data.count),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const mostFrequentStore = spendingByStore.length > 0
    ? spendingByStore.reduce((max, store) => (store.tripCount > max.tripCount ? store : max)).storeName
    : null;

  const topItems: TopItem[] = Array.from(itemData.values())
    .map(data => ({
      name: mostUsedSpelling(data.spellings),
      purchaseCount: data.purchaseCount,
      unitsPurchased: data.unitsPurchased,
      totalSpent: data.totalSpent,
      averagePrice: safeDiv(data.totalSpent, data.unitsPurchased),
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount)
    .slice(0, topItemsLimit);

  const spendingTrend: SpendingTrend[] = Array.from(trendData.entries())
    .map(([date, data]) => ({ date, amount: data.amount, tripCount: data.count }))
    .sort((a, b) => a.date - b.date);

  // Against the itemised total, not the receipt total: the two are different
  // numbers (receipts carry unitemised spend), and dividing by the wrong one
  // gave a breakdown that did not add up to 100%.
  const categoryBreakdown: CategorySpending[] = Object.entries(categoryData)
    .map(([category, data]) => ({
      category,
      totalSpent: data.total,
      itemCount: data.count,
      percentage: safeDiv(data.total, itemisedTotal) * 100,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return {
    totalSpent,
    totalTrips: lists.length,
    averagePerTrip: safeDiv(totalSpent, lists.length),
    itemsPurchased,
    mostFrequentStore,
    topItems,
    spendingByStore,
    spendingTrend,
    trendBucket,
    categoryBreakdown,
    tripsByWeekday,
    itemisedTotal,
    // Clamped: till discounts and overshooting predicted prices both put the
    // itemised sum above the receipt, and a negative slice renders as garbage.
    unitemisedTotal: Math.max(0, totalSpent - itemisedTotal),
  };
}

function mostUsedSpelling(spellings: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [spelling, count] of spellings) {
    if (count > bestCount) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

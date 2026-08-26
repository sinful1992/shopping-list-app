import { Item, ShoppingList } from '../models/types';

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
  name: string;
  purchaseCount: number;
  totalSpent: number;
  averagePrice: number;
}

export interface CategorySpending {
  category: string;
  totalSpent: number;
  itemCount: number;
  percentage: number;
}

export interface AnalyticsSummary {
  totalSpent: number;
  totalTrips: number;
  averagePerTrip: number;
  itemsPurchased: number;
  mostFrequentStore: string | null;
  topItems: TopItem[];
  spendingByStore: SpendingByStore[];
  monthlyTrend: SpendingTrend[];
  categoryBreakdown: CategorySpending[];
}

export interface AggregationOptions {
  topItemsLimit?: number;
}

const DEFAULT_TOP_ITEMS = 10;

/** Total attributed to a completed list: receipt total when known, item sum otherwise. */
function listTotalFor(list: ShoppingList, items: Item[]): number {
  const itemPriceSum = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  return list.totalAmount ?? itemPriceSum;
}

export function buildAnalyticsSummary(
  lists: ShoppingList[],
  itemsByList: Map<string, Item[]>,
  options: AggregationOptions = {},
): AnalyticsSummary {
  const topItemsLimit = options.topItemsLimit ?? DEFAULT_TOP_ITEMS;

  let totalSpent = 0;
  let itemsPurchased = 0;
  const storeData: { [store: string]: { total: number; count: number } } = {};
  const itemData: { [itemName: string]: { count: number; totalSpent: number } } = {};
  const categoryData: { [category: string]: { total: number; count: number } } = {};
  const trendData: { [bucket: string]: { amount: number; count: number } } = {};

  for (const list of lists) {
    const items = itemsByList.get(list.id) ?? [];
    const listTotal = listTotalFor(list, items);

    totalSpent += listTotal;
    itemsPurchased += items.filter(item => item.price !== null).length;

    const store = list.storeName || 'Unknown';
    if (!storeData[store]) storeData[store] = { total: 0, count: 0 };
    storeData[store].total += listTotal;
    storeData[store].count += 1;

    const date = new Date(list.completedAt || list.createdAt);
    const bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!trendData[bucketKey]) trendData[bucketKey] = { amount: 0, count: 0 };
    trendData[bucketKey].amount += listTotal;
    trendData[bucketKey].count += 1;

    for (const item of items) {
      if (item.price === null) continue;

      const itemName = item.name.toLowerCase();
      if (!itemData[itemName]) itemData[itemName] = { count: 0, totalSpent: 0 };
      itemData[itemName].count += 1;
      itemData[itemName].totalSpent += item.price;

      const category = item.category || 'Other';
      if (!categoryData[category]) categoryData[category] = { total: 0, count: 0 };
      categoryData[category].total += item.price;
      categoryData[category].count += 1;
    }
  }

  const spendingByStore: SpendingByStore[] = Object.entries(storeData)
    .map(([storeName, data]) => ({
      storeName,
      totalSpent: data.total,
      tripCount: data.count,
      averagePerTrip: data.total / data.count,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const mostFrequentStore = spendingByStore.length > 0
    ? spendingByStore.reduce((max, store) => (store.tripCount > max.tripCount ? store : max)).storeName
    : null;

  const topItems: TopItem[] = Object.entries(itemData)
    .map(([name, data]) => ({
      name,
      purchaseCount: data.count,
      totalSpent: data.totalSpent,
      averagePrice: data.totalSpent / data.count,
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount)
    .slice(0, topItemsLimit);

  const monthlyTrend: SpendingTrend[] = Object.entries(trendData)
    .map(([bucket, data]) => {
      const [year, monthNum] = bucket.split('-');
      return {
        date: new Date(parseInt(year, 10), parseInt(monthNum, 10) - 1, 1).getTime(),
        amount: data.amount,
        tripCount: data.count,
      };
    })
    .sort((a, b) => a.date - b.date);

  const categoryBreakdown: CategorySpending[] = Object.entries(categoryData)
    .map(([category, data]) => ({
      category,
      totalSpent: data.total,
      itemCount: data.count,
      percentage: (data.total / totalSpent) * 100,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return {
    totalSpent,
    totalTrips: lists.length,
    averagePerTrip: lists.length > 0 ? totalSpent / lists.length : 0,
    itemsPurchased,
    mostFrequentStore,
    topItems,
    spendingByStore,
    monthlyTrend,
    categoryBreakdown,
  };
}

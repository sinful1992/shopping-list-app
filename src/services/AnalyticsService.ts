import LocalStorageManager from './LocalStorageManager';
import ItemManager from './ItemManager';
import { ShoppingList } from '../models/types';

/**
 * AnalyticsService
 * Provides insights and analytics on shopping behavior
 * Implements Sprint 7: Analytics dashboard
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

class AnalyticsService {
  private static instance: AnalyticsService;

  private constructor() {}

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Get comprehensive analytics summary
   * Default: last 30 days
   */
  async getAnalyticsSummary(
    familyGroupId: string,
    daysBack: number = 30
  ): Promise<AnalyticsSummary> {
    try {
      const cutoffDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      // Filter lists from specified time period
      const recentLists = completedLists.filter(
        list => (list.completedAt || list.createdAt) >= cutoffDate
      );

      // Calculate total spending and trips
      let totalSpent = 0;
      let itemsPurchased = 0;
      const storeData: { [store: string]: { total: number; count: number } } = {};
      const itemData: { [itemName: string]: { count: number; totalSpent: number; prices: number[] } } = {};
      const categoryData: { [category: string]: { total: number; count: number } } = {};

      for (const list of recentLists) {
        const items = await ItemManager.getItemsForList(list.id);

        // Calculate list total
        const listTotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
        totalSpent += listTotal;
        itemsPurchased += items.filter(item => item.price !== null).length;

        // Track by store
        const store = list.storeName || 'Unknown';
        if (!storeData[store]) {
          storeData[store] = { total: 0, count: 0 };
        }
        storeData[store].total += listTotal;
        storeData[store].count += 1;

        // Track items
        items.forEach(item => {
          if (item.price !== null) {
            const itemName = item.name.toLowerCase();
            if (!itemData[itemName]) {
              itemData[itemName] = { count: 0, totalSpent: 0, prices: [] };
            }
            itemData[itemName].count += 1;
            itemData[itemName].totalSpent += item.price;
            itemData[itemName].prices.push(item.price);

            // Track by category
            const category = item.category || 'Other';
            if (!categoryData[category]) {
              categoryData[category] = { total: 0, count: 0 };
            }
            categoryData[category].total += item.price;
            categoryData[category].count += 1;
          }
        });
      }

      // Calculate spending by store
      const spendingByStore: SpendingByStore[] = Object.entries(storeData)
        .map(([storeName, data]) => ({
          storeName,
          totalSpent: data.total,
          tripCount: data.count,
          averagePerTrip: data.total / data.count,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);

      // Find most frequent store
      const mostFrequentStore = spendingByStore.length > 0
        ? spendingByStore.reduce((max, store) =>
            store.tripCount > max.tripCount ? store : max
          ).storeName
        : null;

      // Top items
      const topItems: TopItem[] = Object.entries(itemData)
        .map(([name, data]) => ({
          name,
          purchaseCount: data.count,
          totalSpent: data.totalSpent,
          averagePrice: data.totalSpent / data.count,
        }))
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, 10);

      // Monthly trend (group by month)
      const monthlyTrend = this.calculateMonthlyTrend(recentLists);

      // Category breakdown
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
        totalTrips: recentLists.length,
        averagePerTrip: recentLists.length > 0 ? totalSpent / recentLists.length : 0,
        itemsPurchased,
        mostFrequentStore,
        topItems,
        spendingByStore,
        monthlyTrend,
        categoryBreakdown,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate monthly spending trend
   */
  private async calculateMonthlyTrend(lists: ShoppingList[]): Promise<SpendingTrend[]> {
    const monthlyData: { [month: string]: { amount: number; count: number } } = {};

    for (const list of lists) {
      const items = await ItemManager.getItemsForList(list.id);
      const listTotal = items.reduce((sum, item) => sum + (item.price || 0), 0);

      const date = new Date(list.completedAt || list.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { amount: 0, count: 0 };
      }
      monthlyData[monthKey].amount += listTotal;
      monthlyData[monthKey].count += 1;
    }

    // Convert to array and sort by date
    return Object.entries(monthlyData)
      .map(([month, data]) => {
        const [year, monthNum] = month.split('-');
        const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1).getTime();
        return {
          date,
          amount: data.amount,
          tripCount: data.count,
        };
      })
      .sort((a, b) => a.date - b.date);
  }

  /**
   * Get budget performance
   * Compares actual spending vs budgets
   */
  async getBudgetPerformance(
    familyGroupId: string,
    daysBack: number = 30
  ): Promise<{ withinBudget: number; overBudget: number; noBudget: number }> {
    try {
      const cutoffDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      const recentLists = completedLists.filter(
        list => (list.completedAt || list.createdAt) >= cutoffDate
      );

      let withinBudget = 0;
      let overBudget = 0;
      let noBudget = 0;

      for (const list of recentLists) {
        if (list.budget) {
          const items = await ItemManager.getItemsForList(list.id);
          const total = items.reduce((sum, item) => sum + (item.price || 0), 0);

          if (total <= list.budget) {
            withinBudget++;
          } else {
            overBudget++;
          }
        } else {
          noBudget++;
        }
      }

      return { withinBudget, overBudget, noBudget };
    } catch {
      return { withinBudget: 0, overBudget: 0, noBudget: 0 };
    }
  }

  /**
   * Get shopping patterns (day of week, time of day)
   */
  async getShoppingPatterns(
    familyGroupId: string,
    daysBack: number = 90
  ): Promise<{ dayOfWeek: { [day: string]: number }; timeOfDay: { [hour: string]: number } }> {
    try {
      const cutoffDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      const recentLists = completedLists.filter(
        list => (list.completedAt || list.createdAt) >= cutoffDate
      );

      const dayOfWeek: { [day: string]: number } = {
        Sunday: 0,
        Monday: 0,
        Tuesday: 0,
        Wednesday: 0,
        Thursday: 0,
        Friday: 0,
        Saturday: 0,
      };

      const timeOfDay: { [hour: string]: number } = {};

      recentLists.forEach(list => {
        const date = new Date(list.completedAt || list.createdAt);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const hour = date.getHours();

        dayOfWeek[dayName] = (dayOfWeek[dayName] || 0) + 1;
        timeOfDay[hour] = (timeOfDay[hour] || 0) + 1;
      });

      return { dayOfWeek, timeOfDay };
    } catch {
      return { dayOfWeek: {}, timeOfDay: {} };
    }
  }
}

export default AnalyticsService.getInstance();

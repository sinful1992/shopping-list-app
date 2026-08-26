import LocalStorageManager from './LocalStorageManager';
import { Item } from '../models/types';
import {
  buildAnalyticsSummary,
  type AggregationOptions,
  type AnalyticsSummary,
} from './analyticsAggregation';

export type {
  AnalyticsSummary,
  CategorySpending,
  SpendingByStore,
  SpendingTrend,
  TopItem,
} from './analyticsAggregation';

/**
 * AnalyticsService
 * Loads the completed lists behind the Analytics tab and hands them to the
 * pure aggregation in ./analyticsAggregation.
 */
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
    daysBack: number = 30,
    options: AggregationOptions = {},
  ): Promise<AnalyticsSummary> {
    const cutoffDate = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const recentLists = await LocalStorageManager.getCompletedLists(familyGroupId, cutoffDate);

    // One query for every list's items. Per-list fetches ran a query per list,
    // twice over (once here, once for the trend), which is hundreds of
    // round-trips on a year of history.
    const items = await LocalStorageManager.getItemsForLists(recentLists.map(l => l.id));
    const itemsByList = new Map<string, Item[]>();
    for (const item of items) {
      const bucket = itemsByList.get(item.listId);
      if (bucket) bucket.push(item);
      else itemsByList.set(item.listId, [item]);
    }

    return buildAnalyticsSummary(recentLists, itemsByList, options);
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
      const recentLists = await LocalStorageManager.getCompletedLists(familyGroupId, cutoffDate);

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

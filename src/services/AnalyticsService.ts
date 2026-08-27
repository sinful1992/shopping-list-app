import LocalStorageManager from './LocalStorageManager';
import { backfillMissingItems } from './analyticsItemBackfill';
import { Item } from '../models/types';
import {
  bucketFor,
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
  TrendBucket,
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

    // A list with no local items is not a list with nothing on it — it is
    // usually a trip completed on another device. Pull those from Firebase
    // once, or the item half of this screen stays blank forever while the
    // spend half renders. See analyticsItemBackfill for the fencing.
    const missing = recentLists.filter(l => !itemsByList.has(l.id)).map(l => l.id);
    if (missing.length > 0) {
      const fetched = await backfillMissingItems(familyGroupId, missing);
      for (const item of fetched) {
        const bucket = itemsByList.get(item.listId);
        if (bucket) bucket.push(item);
        else itemsByList.set(item.listId, [item]);
      }
    }

    return buildAnalyticsSummary(recentLists, itemsByList, {
      trendBucket: bucketFor(daysBack),
      ...options,
    });
  }
}

export default AnalyticsService.getInstance();

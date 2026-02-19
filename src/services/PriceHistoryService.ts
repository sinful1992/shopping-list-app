import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import LocalStorageManager from './LocalStorageManager';
import CrashReporting from './CrashReporting';
import { Item, ShoppingList, PriceHistoryRecord } from '../models/types';

/**
 * PriceHistoryService
 * Tracks and analyzes price history for items
 * Implements Sprint 7: Price tracking and history
 */

export interface PricePoint {
  price: number;
  date: number;
  storeName: string | null;
  listId: string;
}

export interface PriceStats {
  itemName: string;
  currentPrice: number | null;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  priceHistory: PricePoint[];
  totalPurchases: number;
  trend: 'up' | 'down' | 'stable';
  percentageChange: number; // Last vs average
}

// Module-level cache — avoids repeated AsyncStorage reads on every getPriceHistory() call.
// Map key is familyGroupId so multi-user scenarios on one device are handled correctly.
const _backfillDoneCache = new Map<string, boolean>();

async function isBackfillDone(familyGroupId: string): Promise<boolean> {
  if (!_backfillDoneCache.has(familyGroupId)) {
    const done = await AsyncStorage.getItem(`priceHistoryBackfillDone_v1_${familyGroupId}`) === 'true';
    _backfillDoneCache.set(familyGroupId, done);
  }
  return _backfillDoneCache.get(familyGroupId)!;
}

class PriceHistoryService {
  private static instance: PriceHistoryService;
  private suggestionsCache: Map<string, { data: Map<string, { bestStore: string; bestPrice: number; savings: number }>; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): PriceHistoryService {
    if (!PriceHistoryService.instance) {
      PriceHistoryService.instance = new PriceHistoryService();
    }
    return PriceHistoryService.instance;
  }

  /**
   * Clear suggestions cache for a family group
   */
  clearSuggestionsCache(familyGroupId?: string): void {
    if (familyGroupId) {
      this.suggestionsCache.delete(familyGroupId);
    } else {
      this.suggestionsCache.clear();
    }
  }

  /**
   * Record a price event when an item is checked off.
   * All errors are handled internally — caller fires and forgets safely.
   */
  async recordPrice(
    familyGroupId: string,
    itemName: string,
    price: number,
    storeName: string | null,
    listId: string,
  ): Promise<void> {
    const record: PriceHistoryRecord = {
      id: uuidv4(),
      itemName,
      itemNameNormalized: itemName.toLowerCase().trim(),
      price,
      storeName,
      listId,
      recordedAt: Date.now(),
      familyGroupId,
    };

    try {
      await LocalStorageManager.savePriceHistoryRecord(record);
    } catch (err) {
      CrashReporting.recordError(err as Error, 'PriceHistoryService.recordPrice local');
      return;
    }

    database()
      .ref(`familyGroups/${familyGroupId}/priceHistory/${record.id}`)
      .set(record)
      .catch(err => CrashReporting.recordError(err as Error, 'PriceHistoryService.recordPrice firebase'));
  }

  /**
   * One-time backfill: scan all completed local lists and write deterministic price records.
   * Guarded by a familyGroupId-scoped AsyncStorage flag — safe to call on every mount.
   */
  async backfillPriceHistory(familyGroupId: string): Promise<void> {
    if (await isBackfillDone(familyGroupId)) return;

    const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);
    const allRecords: PriceHistoryRecord[] = [];

    for (const list of completedLists) {
      const items = await LocalStorageManager.getItemsForList(list.id);
      for (const item of items) {
        if (item.checked && item.price !== null) {
          allRecords.push({
            id: `backfill_${list.id}_${item.id}`,
            itemName: item.name,
            itemNameNormalized: item.name.toLowerCase().trim(),
            price: item.price,
            storeName: list.storeName ?? null,
            listId: list.id,
            recordedAt: item.updatedAt,
            familyGroupId,
          });
        }
      }
    }

    await LocalStorageManager.savePriceHistoryBatch(allRecords);

    const CHUNK = 500;
    for (let i = 0; i < allRecords.length; i += CHUNK) {
      const chunk = allRecords.slice(i, i + CHUNK);
      const updateMap: Record<string, PriceHistoryRecord> = {};
      chunk.forEach(r => {
        updateMap[`familyGroups/${familyGroupId}/priceHistory/${r.id}`] = r;
      });
      await database().ref().update(updateMap);
    }

    await AsyncStorage.setItem(`priceHistoryBackfillDone_v1_${familyGroupId}`, 'true');
    _backfillDoneCache.set(familyGroupId, true);
  }

  /**
   * Get price history for a specific item name.
   * Uses the dedicated price_history table if available; falls back to
   * legacy completed-list reconstruction until backfill flag is set.
   */
  async getPriceHistory(
    familyGroupId: string,
    itemName: string
  ): Promise<PricePoint[]> {
    const normalized = itemName.toLowerCase().trim();

    const records = await LocalStorageManager.getPriceHistoryForItem(familyGroupId, normalized);
    if (records.length > 0) {
      return records.map(r => ({
        price: r.price,
        date: r.recordedAt,
        storeName: r.storeName,
        listId: r.listId ?? '',
      }));
    }

    if (await isBackfillDone(familyGroupId)) {
      return [];
    }

    // TODO: remove getFromCompletedListsLegacy() once priceHistoryBackfillDone_v1 has
    // been set across all active devices (tracked as a follow-up cleanup task).
    return this.getFromCompletedListsLegacy(familyGroupId, itemName);
  }

  /**
   * Legacy price history reconstruction from completed lists.
   * Used only during the upgrade window before backfill completes.
   */
  private async getFromCompletedListsLegacy(
    familyGroupId: string,
    itemName: string
  ): Promise<PricePoint[]> {
    try {
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);
      const pricePoints: PricePoint[] = [];

      for (const list of completedLists) {
        const items = await LocalStorageManager.getItemsForList(list.id);

        const matchingItems = items.filter(
          item => item.name.toLowerCase() === itemName.toLowerCase() && item.price !== null
        );

        matchingItems.forEach(item => {
          if (item.price) {
            pricePoints.push({
              price: item.price,
              date: list.completedAt || list.createdAt,
              storeName: list.storeName || null,
              listId: list.id,
            });
          }
        });
      }

      return pricePoints.sort((a, b) => a.date - b.date);
    } catch {
      return [];
    }
  }

  /**
   * Get comprehensive price statistics for an item
   */
  async getPriceStats(
    familyGroupId: string,
    itemName: string
  ): Promise<PriceStats | null> {
    try {
      const priceHistory = await this.getPriceHistory(familyGroupId, itemName);

      if (priceHistory.length === 0) {
        return null;
      }

      const prices = priceHistory.map(p => p.price);
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);
      const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const currentPrice = priceHistory[priceHistory.length - 1]?.price || null;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      let percentageChange = 0;

      if (currentPrice !== null) {
        percentageChange = ((currentPrice - averagePrice) / averagePrice) * 100;

        if (percentageChange > 5) {
          trend = 'up';
        } else if (percentageChange < -5) {
          trend = 'down';
        }
      }

      return {
        itemName,
        currentPrice,
        averagePrice,
        lowestPrice,
        highestPrice,
        priceHistory,
        totalPurchases: priceHistory.length,
        trend,
        percentageChange,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get price comparison for an item across different stores
   */
  async getPriceByStore(
    familyGroupId: string,
    itemName: string
  ): Promise<{ [storeName: string]: { average: number; lowest: number; highest: number; count: number } }> {
    try {
      const priceHistory = await this.getPriceHistory(familyGroupId, itemName);

      const storeData: { [storeName: string]: number[] } = {};

      priceHistory.forEach(point => {
        const store = point.storeName || 'Unknown';
        if (!storeData[store]) {
          storeData[store] = [];
        }
        storeData[store].push(point.price);
      });

      const result: { [storeName: string]: { average: number; lowest: number; highest: number; count: number } } = {};

      Object.keys(storeData).forEach(store => {
        const prices = storeData[store];
        result[store] = {
          average: prices.reduce((sum, p) => sum + p, 0) / prices.length,
          lowest: Math.min(...prices),
          highest: Math.max(...prices),
          count: prices.length,
        };
      });

      return result;
    } catch {
      return {};
    }
  }

  /**
   * Get items with most volatile prices (biggest price swings)
   */
  async getMostVolatileItems(
    familyGroupId: string,
    limit: number = 10
  ): Promise<Array<{ itemName: string; volatility: number; priceRange: number }>> {
    try {
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      const itemNamesSet = new Set<string>();

      for (const list of completedLists) {
        const items = await LocalStorageManager.getItemsForList(list.id);
        items.forEach(item => {
          if (item.price !== null) {
            itemNamesSet.add(item.name.toLowerCase());
          }
        });
      }

      const volatilityData: Array<{ itemName: string; volatility: number; priceRange: number }> = [];

      for (const itemName of Array.from(itemNamesSet)) {
        const priceHistory = await this.getPriceHistory(familyGroupId, itemName);

        if (priceHistory.length >= 2) {
          const prices = priceHistory.map(p => p.price);
          const lowest = Math.min(...prices);
          const highest = Math.max(...prices);
          const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

          const volatility = ((highest - lowest) / average) * 100;
          const priceRange = highest - lowest;

          volatilityData.push({
            itemName,
            volatility,
            priceRange,
          });
        }
      }

      return volatilityData
        .sort((a, b) => b.volatility - a.volatility)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /**
   * Get cheapest and most expensive items recently purchased
   */
  async getRecentPriceExtremes(
    familyGroupId: string,
    daysBack: number = 30
  ): Promise<{ cheapest: PricePoint[]; mostExpensive: PricePoint[] }> {
    try {
      const cutoffDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      const recentLists = completedLists.filter(
        list => (list.completedAt || list.createdAt) >= cutoffDate
      );

      const allPricePoints: (PricePoint & { itemName: string })[] = [];

      for (const list of recentLists) {
        const items = await LocalStorageManager.getItemsForList(list.id);

        items.forEach(item => {
          if (item.price !== null) {
            allPricePoints.push({
              price: item.price,
              date: list.completedAt || list.createdAt,
              storeName: list.storeName || null,
              listId: list.id,
              itemName: item.name,
            });
          }
        });
      }

      const sortedByPrice = [...allPricePoints].sort((a, b) => a.price - b.price);

      return {
        cheapest: sortedByPrice.slice(0, 5),
        mostExpensive: sortedByPrice.slice(-5).reverse(),
      };
    } catch {
      return { cheapest: [], mostExpensive: [] };
    }
  }

  /**
   * Get smart shopping suggestions for a list of items
   * Returns the cheapest store for each item based on historical prices
   * Results are cached for 5 minutes
   */
  async getSmartSuggestions(
    familyGroupId: string,
    itemNames: string[]
  ): Promise<Map<string, { bestStore: string; bestPrice: number; savings: number }>> {
    try {
      const cached = this.suggestionsCache.get(familyGroupId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      const suggestions = new Map<string, { bestStore: string; bestPrice: number; savings: number }>();

      const validItemNames = itemNames.filter(name => name && typeof name === 'string' && name.trim().length > 0);

      if (validItemNames.length === 0) {
        return suggestions;
      }

      for (const itemName of validItemNames) {
        const storeData = await this.getPriceByStore(familyGroupId, itemName);
        const stores = Object.entries(storeData);

        if (stores.length > 1) {
          let cheapestStore = '';
          let cheapestPrice = Infinity;
          let averagePrice = 0;

          stores.forEach(([store, data]) => {
            if (data.average < cheapestPrice) {
              cheapestPrice = data.average;
              cheapestStore = store;
            }
            averagePrice += data.average;
          });

          averagePrice = averagePrice / stores.length;
          const savings = averagePrice - cheapestPrice;

          if (savings > 0.01) {
            suggestions.set(itemName.toLowerCase(), {
              bestStore: cheapestStore,
              bestPrice: cheapestPrice,
              savings: savings,
            });
          }
        }
      }

      this.suggestionsCache.set(familyGroupId, {
        data: suggestions,
        timestamp: Date.now(),
      });

      return suggestions;
    } catch {
      return new Map();
    }
  }
}

export default PriceHistoryService.getInstance();

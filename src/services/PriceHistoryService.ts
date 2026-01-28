import LocalStorageManager from './LocalStorageManager';
import ItemManager from './ItemManager';
import { Item, ShoppingList } from '../models/types';

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
   * Get price history for a specific item name
   * Searches through all completed lists and collects price data
   */
  async getPriceHistory(
    familyGroupId: string,
    itemName: string
  ): Promise<PricePoint[]> {
    try {
      // Get all completed lists
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      const pricePoints: PricePoint[] = [];

      // Search through each completed list for this item
      for (const list of completedLists) {
        const items = await ItemManager.getItemsForList(list.id);

        // Find items with matching name (case-insensitive)
        const matchingItems = items.filter(
          item => item.name.toLowerCase() === itemName.toLowerCase() && item.price !== null
        );

        // Add price points for each matching item
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

      // Sort by date (oldest first)
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

      // Calculate trend (comparing last price to average)
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
      // Get all completed lists
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      // Collect all unique item names
      const itemNamesSet = new Set<string>();

      for (const list of completedLists) {
        const items = await ItemManager.getItemsForList(list.id);
        items.forEach(item => {
          if (item.price !== null) {
            itemNamesSet.add(item.name.toLowerCase());
          }
        });
      }

      const volatilityData: Array<{ itemName: string; volatility: number; priceRange: number }> = [];

      // Calculate volatility for each item
      for (const itemName of Array.from(itemNamesSet)) {
        const priceHistory = await this.getPriceHistory(familyGroupId, itemName);

        if (priceHistory.length >= 2) {
          const prices = priceHistory.map(p => p.price);
          const lowest = Math.min(...prices);
          const highest = Math.max(...prices);
          const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

          // Volatility = (highest - lowest) / average * 100
          const volatility = ((highest - lowest) / average) * 100;
          const priceRange = highest - lowest;

          volatilityData.push({
            itemName,
            volatility,
            priceRange,
          });
        }
      }

      // Sort by volatility (highest first) and limit
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

      // Filter lists from last N days
      const recentLists = completedLists.filter(
        list => (list.completedAt || list.createdAt) >= cutoffDate
      );

      const allPricePoints: (PricePoint & { itemName: string })[] = [];

      for (const list of recentLists) {
        const items = await ItemManager.getItemsForList(list.id);

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

      // Sort by price
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
      // Check cache first
      const cached = this.suggestionsCache.get(familyGroupId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      const suggestions = new Map<string, { bestStore: string; bestPrice: number; savings: number }>();

      // Validate item names before processing
      const validItemNames = itemNames.filter(name => name && typeof name === 'string' && name.trim().length > 0);

      if (validItemNames.length === 0) {
        return suggestions; // Return empty map if no valid names
      }

      for (const itemName of validItemNames) {
        const storeData = await this.getPriceByStore(familyGroupId, itemName);
        const stores = Object.entries(storeData);

        if (stores.length > 1) {
          // Find the cheapest store
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

          if (savings > 0.01) { // Only suggest if there's actual savings
            suggestions.set(itemName.toLowerCase(), {
              bestStore: cheapestStore,
              bestPrice: cheapestPrice,
              savings: savings,
            });
          }
        }
      }

      // Cache the results
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

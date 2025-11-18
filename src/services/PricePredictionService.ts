import AsyncStorage from '@react-native-async-storage/async-storage';
import { Item } from '../models/types';
import ShoppingListManager from './ShoppingListManager';
import ItemManager from './ItemManager';

/**
 * PricePredictionService
 * Efficiently predicts item prices based on historical purchase data
 * Uses caching to avoid expensive recalculations on every item add
 */
class PricePredictionService {
  private static instance: PricePredictionService;
  private predictionCache: Map<string, { [itemName: string]: number }> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  private readonly STORAGE_KEY_PREFIX = '@price_predictions_';

  private constructor() {}

  static getInstance(): PricePredictionService {
    if (!PricePredictionService.instance) {
      PricePredictionService.instance = new PricePredictionService();
    }
    return PricePredictionService.instance;
  }

  /**
   * Get predicted prices for items in a family group
   * Uses cached data if available and fresh, otherwise calculates and caches
   */
  async getPredictionsForFamilyGroup(familyGroupId: string): Promise<{ [itemName: string]: number }> {
    // Check memory cache first
    const cached = this.predictionCache.get(familyGroupId);
    const cacheTime = this.cacheTimestamps.get(familyGroupId);

    if (cached && cacheTime && Date.now() - cacheTime < this.CACHE_TTL) {
      return cached;
    }

    // Check persistent storage cache
    try {
      const storedData = await AsyncStorage.getItem(this.STORAGE_KEY_PREFIX + familyGroupId);
      if (storedData) {
        const { predictions, timestamp } = JSON.parse(storedData);
        if (Date.now() - timestamp < this.CACHE_TTL) {
          // Update memory cache
          this.predictionCache.set(familyGroupId, predictions);
          this.cacheTimestamps.set(familyGroupId, timestamp);
          return predictions;
        }
      }
    } catch (error) {
      console.error('Error reading price prediction cache:', error);
    }

    // Calculate fresh predictions
    const predictions = await this.calculatePredictions(familyGroupId);

    // Update both caches
    this.predictionCache.set(familyGroupId, predictions);
    const timestamp = Date.now();
    this.cacheTimestamps.set(familyGroupId, timestamp);

    // Persist to storage (non-blocking)
    this.persistToStorage(familyGroupId, predictions, timestamp);

    return predictions;
  }

  /**
   * Calculate price predictions from historical data
   * Optimized to minimize database queries
   */
  private async calculatePredictions(familyGroupId: string): Promise<{ [itemName: string]: number }> {
    try {
      // Get all completed lists for this family group (single query)
      const allLists = await ShoppingListManager.getAllLists(familyGroupId);
      const completedLists = allLists.filter(l => l.status === 'completed');

      if (completedLists.length === 0) {
        return {};
      }

      // Collect all items from completed lists
      // Note: This could be further optimized with a bulk query if WatermelonDB supports it
      const historicalItems: Item[] = [];

      for (const completedList of completedLists) {
        try {
          const items = await ItemManager.getItemsForList(completedList.id);
          if (items && Array.isArray(items)) {
            historicalItems.push(...items);
          }
        } catch (error) {
          console.error(`Error fetching items for list ${completedList.id}:`, error);
          // Continue with other lists
        }
      }

      // Calculate average prices for each item name
      const priceMap: { [key: string]: number[] } = {};

      for (const item of historicalItems) {
        if (!item || !item.name || !item.price || item.price <= 0) {
          continue;
        }

        const itemName = item.name.toLowerCase().trim();
        if (!priceMap[itemName]) {
          priceMap[itemName] = [];
        }
        priceMap[itemName].push(item.price);
      }

      // Calculate weighted averages (recent prices weighted more heavily)
      const predictions: { [key: string]: number } = {};

      for (const itemName in priceMap) {
        const prices = priceMap[itemName];
        if (!prices || prices.length === 0) {
          continue;
        }

        // Simple average for now - could be enhanced with weighted average
        const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        predictions[itemName] = Math.round(average * 100) / 100; // Round to 2 decimals
      }

      return predictions;
    } catch (error) {
      console.error('Error calculating price predictions:', error);
      return {}; // Return empty predictions on error
    }
  }

  /**
   * Persist predictions to AsyncStorage (non-blocking)
   */
  private async persistToStorage(
    familyGroupId: string,
    predictions: { [itemName: string]: number },
    timestamp: number
  ): Promise<void> {
    try {
      const data = JSON.stringify({ predictions, timestamp });
      await AsyncStorage.setItem(this.STORAGE_KEY_PREFIX + familyGroupId, data);
    } catch (error) {
      console.error('Error persisting price predictions:', error);
      // Non-critical error - predictions still work from memory
    }
  }

  /**
   * Invalidate cache for a family group
   * Call this when a new list is completed to trigger recalculation
   */
  invalidateCache(familyGroupId: string): void {
    this.predictionCache.delete(familyGroupId);
    this.cacheTimestamps.delete(familyGroupId);

    // Remove from AsyncStorage (non-blocking)
    AsyncStorage.removeItem(this.STORAGE_KEY_PREFIX + familyGroupId).catch(error => {
      console.error('Error removing price prediction cache:', error);
    });
  }

  /**
   * Clear all caches (useful for testing or memory management)
   */
  clearAllCaches(): void {
    this.predictionCache.clear();
    this.cacheTimestamps.clear();

    // Note: AsyncStorage keys are not cleared here to avoid excessive operations
    // They will expire naturally based on TTL
  }

  /**
   * Get predicted price for a single item
   */
  async getPredictedPrice(familyGroupId: string, itemName: string): Promise<number | null> {
    const predictions = await this.getPredictionsForFamilyGroup(familyGroupId);
    const key = itemName.toLowerCase().trim();
    return predictions[key] || null;
  }

  /**
   * Prefetch predictions for a family group (call on app startup or background)
   */
  async prefetchPredictions(familyGroupId: string): Promise<void> {
    // This triggers calculation and caching without blocking
    this.getPredictionsForFamilyGroup(familyGroupId).catch(error => {
      console.error('Error prefetching predictions:', error);
    });
  }
}

export default PricePredictionService.getInstance();

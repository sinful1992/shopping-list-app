import AsyncStorage from '@react-native-async-storage/async-storage';

import ShoppingListManager from './ShoppingListManager';
import LocalStorageManager from './LocalStorageManager';
import { safeJsonParse } from '../utils/safeJsonParse';

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
    const storedData = await AsyncStorage.getItem(this.STORAGE_KEY_PREFIX + familyGroupId);
    const cachedStorage = safeJsonParse<{ predictions: any; timestamp: number } | null>(storedData, null);
    if (cachedStorage && Date.now() - cachedStorage.timestamp < this.CACHE_TTL) {
      this.predictionCache.set(familyGroupId, cachedStorage.predictions);
      this.cacheTimestamps.set(familyGroupId, cachedStorage.timestamp);
      return cachedStorage.predictions;
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

      // Collect all items from completed lists in a single query
      const listIds = completedLists.map(l => l.id);
      const historicalItems = await LocalStorageManager.getItemsForLists(listIds);

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
    } catch {
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
    } catch {
      // Non-critical error - predictions still work from memory
    }
  }
}

export default PricePredictionService.getInstance();

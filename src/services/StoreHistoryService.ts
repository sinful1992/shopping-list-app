import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse } from '../utils/safeJsonParse';

/**
 * StoreHistoryService
 * Tracks frequently visited stores and provides autocomplete suggestions
 * Implements Sprint 6: Store tracking feature
 */
class StoreHistoryService {
  private static instance: StoreHistoryService;
  private readonly STORAGE_KEY = '@store_history';
  private readonly MAX_HISTORY_SIZE = 20; // Keep last 20 stores

  private constructor() {}

  static getInstance(): StoreHistoryService {
    if (!StoreHistoryService.instance) {
      StoreHistoryService.instance = new StoreHistoryService();
    }
    return StoreHistoryService.instance;
  }

  /**
   * Get store history for autocomplete
   * Returns stores sorted by frequency and recency
   */
  async getStoreHistory(): Promise<string[]> {
    // Never throws: a receipt scan reads this while saving its result, and
    // a storage error or a damaged entry must not fail the scan.
    try {
      return (await this.readHistory())
        .sort((a, b) => a.frequency !== b.frequency ? b.frequency - a.frequency : b.lastUsed - a.lastUsed)
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /** The stored entries; anything that is not a well-formed entry is skipped. */
  private async readHistory(): Promise<StoreEntry[]> {
    const parsed = safeJsonParse<unknown>(await AsyncStorage.getItem(this.STORAGE_KEY), []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is StoreEntry =>
      !!e && typeof e.name === 'string' && e.name.trim() !== ''
      && typeof e.frequency === 'number' && Number.isFinite(e.frequency)
      && typeof e.lastUsed === 'number' && Number.isFinite(e.lastUsed));
  }

  /**
   * Add a store to history or increment frequency if already exists
   */
  async addStore(storeName: string): Promise<void> {
    if (!storeName || !storeName.trim()) {
      return;
    }

    try {
      const normalized = storeName.trim();
      let history = await this.readHistory();

      // Find existing entry (case-insensitive)
      const existingIndex = history.findIndex(
        entry => entry.name.toLowerCase() === normalized.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Update existing entry
        history[existingIndex].frequency++;
        history[existingIndex].lastUsed = Date.now();
      } else {
        // Add new entry
        history.push({
          name: normalized,
          frequency: 1,
          lastUsed: Date.now(),
        });
      }

      // Limit history size
      if (history.length > this.MAX_HISTORY_SIZE) {
        // Sort and keep top entries
        history = history
          .sort((a, b) => {
            if (a.frequency !== b.frequency) {
              return b.frequency - a.frequency;
            }
            return b.lastUsed - a.lastUsed;
          })
          .slice(0, this.MAX_HISTORY_SIZE);
      }

      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Silently handle store history update error
    }
  }

  /**
   * Search stores matching the query
   * Used for autocomplete filtering
   */
  async searchStores(query: string): Promise<string[]> {
    if (!query || !query.trim()) {
      return this.getStoreHistory();
    }

    try {
      const allStores = await this.getStoreHistory();
      const lowerQuery = query.toLowerCase().trim();

      return allStores.filter(store =>
        store.toLowerCase().includes(lowerQuery)
      );
    } catch {
      return [];
    }
  }
}

interface StoreEntry {
  name: string;
  frequency: number;
  lastUsed: number;
}

export default StoreHistoryService.getInstance();

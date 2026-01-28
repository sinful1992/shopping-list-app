import LocalStorageManager from './LocalStorageManager';
import { v4 as uuidv4 } from 'uuid';
import database from '@react-native-firebase/database';

/**
 * CategoryHistoryService
 * Tracks category usage history for items to enable smart suggestions
 * and conflict resolution when items are categorized differently
 */
class CategoryHistoryService {
  /**
   * Record a category usage when an item is checked/purchased
   * Uses upsert pattern: increment count if exists, create if new
   */
  async recordCategoryUsage(
    familyGroupId: string,
    itemName: string,
    category: string | null
  ): Promise<void> {
    if (!category) return; // Don't track items without categories

    const normalized = itemName.toLowerCase().trim();

    try {
      // Find existing record
      const existingRecords = await LocalStorageManager.getCategoryHistoryForItem(
        familyGroupId,
        normalized
      );

      const existing = existingRecords.find((record) => record.category === category);

      if (existing) {
        // Increment usage count
        await LocalStorageManager.updateCategoryHistory(existing.id, {
          usageCount: existing.usageCount + 1,
          lastUsedAt: Date.now(),
        });
      } else {
        // Create new record
        await LocalStorageManager.saveCategoryHistory({
          id: uuidv4(),
          familyGroupId,
          itemNameNormalized: normalized,
          category,
          usageCount: 1,
          lastUsedAt: Date.now(),
          createdAt: Date.now(),
        });
      }

      // Sync to Firebase
      await this.syncCategoryToFirebase(familyGroupId, normalized, category);
    } catch {
      // Don't throw - this is a background operation that shouldn't break the main flow
    }
  }

  /**
   * Sync category usage to Firebase
   * Uses atomic transaction to increment usage count across devices
   */
  private async syncCategoryToFirebase(
    familyGroupId: string,
    itemNameNormalized: string,
    category: string
  ): Promise<void> {
    try {
      const itemHash = this.hashItemName(itemNameNormalized);
      const ref = database().ref(
        `/familyGroups/${familyGroupId}/categoryHistory/${itemHash}/${category}`
      );

      // Atomic increment transaction
      await ref.transaction((current) => {
        if (current === null) {
          return {
            category,
            usageCount: 1,
            lastUsedAt: Date.now(),
            createdAt: Date.now(),
          };
        }
        return {
          ...current,
          usageCount: (current.usageCount || 0) + 1,
          lastUsedAt: Date.now(),
        };
      });
    } catch {
      // Don't throw - offline changes will be synced when connection is restored
    }
  }

  /**
   * Hash item name for Firebase key safety
   * Replaces characters that are invalid in Firebase keys
   */
  private hashItemName(name: string): string {
    return name.replace(/[.#$[\]]/g, '_');
  }

  /**
   * Get all known categories for an item name
   * Returns sorted by usage frequency (most used first)
   */
  async getCategoriesForItem(
    familyGroupId: string,
    itemName: string
  ): Promise<Array<{ category: string; usageCount: number; lastUsedAt: number }>> {
    const normalized = itemName.toLowerCase().trim();

    try {
      const records = await LocalStorageManager.getCategoryHistoryForItem(
        familyGroupId,
        normalized
      );

      // Deduplicate by category, keeping highest usageCount for each
      const uniqueCategories = new Map<string, { category: string; usageCount: number; lastUsedAt: number }>();
      records.forEach((r) => {
        const existing = uniqueCategories.get(r.category);
        if (!existing || r.usageCount > existing.usageCount) {
          uniqueCategories.set(r.category, {
            category: r.category,
            usageCount: r.usageCount,
            lastUsedAt: r.lastUsedAt,
          });
        }
      });

      // Sort by usage count (descending), then by recency
      return Array.from(uniqueCategories.values())
        .sort((a, b) => {
          if (a.usageCount !== b.usageCount) {
            return b.usageCount - a.usageCount;
          }
          return b.lastUsedAt - a.lastUsedAt;
        });
    } catch {
      return [];
    }
  }

  /**
   * Check if an item has conflicting categories (2+ different categories used)
   */
  async hasConflict(familyGroupId: string, itemName: string): Promise<boolean> {
    const categories = await this.getCategoriesForItem(familyGroupId, itemName);
    return categories.length >= 2;
  }

  /**
   * Get most commonly used category for an item
   */
  async getSuggestedCategory(
    familyGroupId: string,
    itemName: string
  ): Promise<string | null> {
    const categories = await this.getCategoriesForItem(familyGroupId, itemName);
    return categories.length > 0 ? categories[0].category : null;
  }

  /**
   * Clear history for a specific item
   */
  async clearHistoryForItem(familyGroupId: string, itemName: string): Promise<void> {
    const normalized = itemName.toLowerCase().trim();

    try {
      const records = await LocalStorageManager.getCategoryHistoryForItem(
        familyGroupId,
        normalized
      );

      for (const record of records) {
        await LocalStorageManager.deleteCategoryHistory(record.id);
      }
    } catch (error: any) {
      throw error;
    }
  }
}

export default new CategoryHistoryService();

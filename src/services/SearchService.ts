import LocalStorageManager from './LocalStorageManager';
import ItemManager from './ItemManager';
import { ShoppingList } from '../models/types';

/**
 * SearchService
 * Centralized search logic for lists, items, and stores
 * Implements Sprint 7: Enhanced search functionality
 */
class SearchService {
  private static instance: SearchService;

  private constructor() {}

  static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService();
    }
    return SearchService.instance;
  }

  /**
   * Search completed lists by list name, item names, or store name
   * Returns lists that match the query in any of these fields
   */
  async searchCompletedLists(
    familyGroupId: string,
    query: string
  ): Promise<ShoppingList[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();

    try {
      // Get all completed lists
      const allLists = await LocalStorageManager.getListsByStatus(
        familyGroupId,
        'completed'
      );

      // Filter lists that match the query
      const matchingLists: ShoppingList[] = [];

      for (const list of allLists) {
        let matches = false;

        // 1. Check list name
        if (list.name.toLowerCase().includes(normalizedQuery)) {
          matches = true;
        }

        // 2. Check store name
        if (!matches && list.storeName) {
          if (list.storeName.toLowerCase().includes(normalizedQuery)) {
            matches = true;
          }
        }

        // 3. Check item names
        if (!matches) {
          const items = await ItemManager.getItemsForList(list.id);
          const hasMatchingItem = items.some(item =>
            item.name.toLowerCase().includes(normalizedQuery)
          );
          if (hasMatchingItem) {
            matches = true;
          }
        }

        if (matches) {
          matchingLists.push(list);
        }
      }

      // Sort by completed date (most recent first)
      return matchingLists.sort((a, b) => {
        const dateA = a.completedAt || 0;
        const dateB = b.completedAt || 0;
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Highlight matching text in a string
   * Returns array of segments with highlight flag
   */
  highlightMatch(
    text: string,
    query: string
  ): Array<{ text: string; highlight: boolean }> {
    if (!query || !query.trim()) {
      return [{ text, highlight: false }];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const normalizedText = text.toLowerCase();
    const index = normalizedText.indexOf(normalizedQuery);

    if (index === -1) {
      return [{ text, highlight: false }];
    }

    const segments: Array<{ text: string; highlight: boolean }> = [];

    // Text before match
    if (index > 0) {
      segments.push({
        text: text.substring(0, index),
        highlight: false,
      });
    }

    // Matched text
    segments.push({
      text: text.substring(index, index + query.length),
      highlight: true,
    });

    // Text after match
    if (index + query.length < text.length) {
      segments.push({
        text: text.substring(index + query.length),
        highlight: false,
      });
    }

    return segments;
  }

  /**
   * Get search result summary
   * Returns what matched (list name, store, or items)
   */
  async getMatchReason(
    list: ShoppingList,
    query: string
  ): Promise<'list_name' | 'store' | 'items' | 'none'> {
    if (!query || !query.trim()) {
      return 'none';
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Check list name
    if (list.name.toLowerCase().includes(normalizedQuery)) {
      return 'list_name';
    }

    // Check store name
    if (list.storeName && list.storeName.toLowerCase().includes(normalizedQuery)) {
      return 'store';
    }

    // Check items
    const items = await ItemManager.getItemsForList(list.id);
    const hasMatchingItem = items.some(item =>
      item.name.toLowerCase().includes(normalizedQuery)
    );
    if (hasMatchingItem) {
      return 'items';
    }

    return 'none';
  }
}

export default SearchService.getInstance();

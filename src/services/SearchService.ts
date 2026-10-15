import LocalStorageManager from './LocalStorageManager';
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
      const allLists = await LocalStorageManager.getCompletedLists(familyGroupId);
      const headerMatches = (list: ShoppingList) =>
        list.name.toLowerCase().includes(normalizedQuery) ||
        !!list.storeName?.toLowerCase().includes(normalizedQuery);

      // Items only matter for lists whose name and store did not match;
      // fetch those in one pass instead of a query per list per keystroke.
      const itemCandidates = allLists.filter(list => !headerMatches(list));
      const items = await LocalStorageManager.getItemsForLists(itemCandidates.map(l => l.id));
      const listsWithMatchingItem = new Set(
        items.filter(item => item.name.toLowerCase().includes(normalizedQuery)).map(item => item.listId),
      );

      const matchingLists = allLists.filter(list =>
        headerMatches(list) || listsWithMatchingItem.has(list.id));

      // Sort by completed date (most recent first)
      return matchingLists.sort((a, b) => {
        const dateA = a.completedAt || 0;
        const dateB = b.completedAt || 0;
        return dateB - dateA;
      });
    } catch {
      return [];
    }
  }
}

export default SearchService.getInstance();

import {
  ShoppingList,
  ListDetails,
  PaginatedHistory,
} from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import ItemManager from './ItemManager';
import ImageStorageManager from './ImageStorageManager';
import SearchService from './SearchService';

/**
 * HistoryTracker
 * Retrieves and displays historical shopping trips
 * Implements Requirements: 8.1, 8.3, 8.5, 8.6, 8.7
 */
class HistoryTracker {
  /**
   * Get all completed lists
   * Implements Req 8.1
   */
  async getCompletedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      return await LocalStorageManager.getCompletedLists(familyGroupId);
    } catch (error: any) {
      throw new Error(`Failed to get completed lists: ${error.message}`);
    }
  }

  /**
   * Get lists by date range
   * Implements Req 8.5
   */
  async getListsByDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]> {
    try {
      return await LocalStorageManager.getCompletedLists(familyGroupId, startDate, endDate);
    } catch (error: any) {
      throw new Error(`Failed to get lists by date range: ${error.message}`);
    }
  }

  /**
   * Get lists by receipt status
   * Implements Req 8.6
   */
  async getListsByReceiptStatus(
    familyGroupId: string,
    hasReceipt: boolean
  ): Promise<ShoppingList[]> {
    try {
      const allLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      if (hasReceipt) {
        return allLists.filter((list) => list.receiptUrl !== null);
      } else {
        return allLists.filter((list) => list.receiptUrl === null);
      }
    } catch (error: any) {
      throw new Error(`Failed to get lists by receipt status: ${error.message}`);
    }
  }

  /**
   * Search lists by name
   * Implements Req 8.7
   * @deprecated Use searchLists() for enhanced search
   */
  async searchListsByName(
    familyGroupId: string,
    searchQuery: string
  ): Promise<ShoppingList[]> {
    try {
      const allLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      if (!searchQuery.trim()) {
        return allLists;
      }

      const query = searchQuery.toLowerCase();
      return allLists.filter((list) =>
        list.name.toLowerCase().includes(query)
      );
    } catch (error: any) {
      throw new Error(`Failed to search lists: ${error.message}`);
    }
  }

  /**
   * Enhanced search across list names, item names, and store names
   * Implements Sprint 7: Enhanced search functionality
   */
  async searchLists(
    familyGroupId: string,
    searchQuery: string
  ): Promise<ShoppingList[]> {
    try {
      return await SearchService.searchCompletedLists(familyGroupId, searchQuery);
    } catch (error: any) {
      throw new Error(`Failed to search lists: ${error.message}`);
    }
  }

  /**
   * Get list details (list + items + receipt)
   * Implements Req 8.3
   */
  async getListDetails(listId: string): Promise<ListDetails> {
    try {
      const list = await LocalStorageManager.getList(listId);
      if (!list) {
        throw new Error('List not found');
      }

      const items = await ItemManager.getItemsForList(listId);
      const receiptData = list.receiptData;

      let receiptUrl: string | null = null;
      if (list.receiptUrl) {
        try {
          receiptUrl = await ImageStorageManager.getReceiptDownloadUrl(list.receiptUrl);
        } catch (error) {
          console.error('Failed to get receipt URL:', error);
        }
      }

      return {
        list,
        items,
        receiptUrl,
        receiptData,
      };
    } catch (error: any) {
      throw new Error(`Failed to get list details: ${error.message}`);
    }
  }

  /**
   * Get history with pagination
   * Implements pagination for performance
   */
  async getHistoryPage(
    familyGroupId: string,
    offset: number,
    limit: number = 20
  ): Promise<PaginatedHistory> {
    try {
      const allLists = await LocalStorageManager.getCompletedLists(familyGroupId);
      const total = allLists.length;

      // Slice for pagination
      const lists = allLists.slice(offset, offset + limit);

      return {
        lists,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get history page: ${error.message}`);
    }
  }
}

export default new HistoryTracker();

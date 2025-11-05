import { ExpenditureSummary, ExpenditureBreakdownItem, ShoppingList } from '../models/types';
import LocalStorageManager from './LocalStorageManager';

/**
 * BudgetTracker
 * Calculates total expenditure across shopping trips
 * Implements Requirements: 7.2, 7.3, 7.4, 7.5, 7.7
 */
class BudgetTracker {
  /**
   * Calculate expenditure for date range
   * Implements Req 7.2, 7.3
   */
  async calculateExpenditureForDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ExpenditureSummary> {
    try {
      const lists = await LocalStorageManager.getCompletedLists(
        familyGroupId,
        startDate,
        endDate
      );

      let totalAmount = 0;
      let listsWithReceipts = 0;
      let listsWithoutReceipts = 0;

      for (const list of lists) {
        if (list.receiptData && list.receiptData.totalAmount) {
          totalAmount += list.receiptData.totalAmount;
          listsWithReceipts++;
        } else {
          listsWithoutReceipts++;
        }
      }

      return {
        totalAmount,
        currency: 'USD',
        listCount: lists.length,
        listsWithReceipts,
        listsWithoutReceipts,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate expenditure: ${error.message}`);
    }
  }

  /**
   * Get expenditure breakdown by shopping trip
   * Implements Req 7.4
   */
  async getExpenditureBreakdown(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ExpenditureBreakdownItem[]> {
    try {
      const lists = await LocalStorageManager.getCompletedLists(
        familyGroupId,
        startDate,
        endDate
      );

      return lists.map((list) => ({
        listId: list.id,
        listName: list.name,
        completedAt: list.completedAt || 0,
        merchantName: list.receiptData?.merchantName || null,
        totalAmount: list.receiptData?.totalAmount || null,
        createdBy: list.createdBy,
        hasReceipt: list.receiptUrl !== null,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get expenditure breakdown: ${error.message}`);
    }
  }

  /**
   * Get expenditure by specific family member
   * Implements Req 7.7
   */
  async getExpenditureByMember(
    familyGroupId: string,
    startDate: number,
    endDate: number,
    userId: string
  ): Promise<ExpenditureSummary> {
    try {
      const lists = await LocalStorageManager.getCompletedLists(
        familyGroupId,
        startDate,
        endDate
      );

      // Filter by user
      const userLists = lists.filter((list) => list.createdBy === userId);

      let totalAmount = 0;
      let listsWithReceipts = 0;
      let listsWithoutReceipts = 0;

      for (const list of userLists) {
        if (list.receiptData && list.receiptData.totalAmount) {
          totalAmount += list.receiptData.totalAmount;
          listsWithReceipts++;
        } else {
          listsWithoutReceipts++;
        }
      }

      return {
        totalAmount,
        currency: 'USD',
        listCount: userLists.length,
        listsWithReceipts,
        listsWithoutReceipts,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to calculate member expenditure: ${error.message}`);
    }
  }

  /**
   * Get lists without receipts
   * Implements Req 7.5
   */
  async getListsWithoutReceipts(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]> {
    try {
      const lists = await LocalStorageManager.getCompletedLists(
        familyGroupId,
        startDate,
        endDate
      );

      return lists.filter((list) => list.receiptUrl === null);
    } catch (error: any) {
      throw new Error(`Failed to get lists without receipts: ${error.message}`);
    }
  }
}

export default new BudgetTracker();

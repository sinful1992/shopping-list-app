import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { ShoppingList, Unsubscribe, User, ReceiptData } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
import UsageTracker from './UsageTracker';

/**
 * ShoppingListManager
 * Creates, reads, updates, and deletes shopping lists
 * Implements Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
class ShoppingListManager {
  /**
   * Create new shopping list
   * Implements Req 2.1, 2.2
   * Sprint 2: Enforces list creation limits based on subscription tier
   */
  async createList(name: string, userId: string, familyGroupId: string, user: User): Promise<ShoppingList> {
    // Check if user can create a list based on their subscription tier
    const permission = await UsageTracker.canCreateList(user);
    if (!permission.allowed) {
      throw new Error(permission.reason || 'Cannot create list');
    }

    const list: ShoppingList = {
      id: uuidv4(),
      name,
      familyGroupId,
      createdBy: userId,
      createdAt: Date.now(),
      status: 'active',
      completedAt: null,
      completedBy: null,
      receiptUrl: null,
      receiptData: null,
      syncStatus: 'pending',
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedByRole: null,
      lockedAt: null,
      budget: null, // No budget by default
    };

    // Save locally first (offline-first)
    await LocalStorageManager.saveList(list);

    // Increment usage counter
    await UsageTracker.incrementListCounter(userId);

    // Trigger sync
    await SyncEngine.pushChange('list', list.id, 'create');

    return list;
  }

  /**
   * Create list with optimistic local-first approach
   * Saves to local DB immediately for instant UI, runs Firebase in background
   * @param id - Optional pre-generated ID (for optimistic UI consistency)
   */
  async createListOptimistic(
    name: string,
    userId: string,
    familyGroupId: string,
    user: User,
    id?: string
  ): Promise<ShoppingList> {
    const list: ShoppingList = {
      id: id || uuidv4(),
      name,
      familyGroupId,
      createdBy: userId,
      createdAt: Date.now(),
      status: 'active',
      completedAt: null,
      completedBy: null,
      receiptUrl: null,
      receiptData: null,
      syncStatus: 'pending',
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedByRole: null,
      lockedAt: null,
      budget: null,
    };

    // Save locally FIRST for instant UI update via WatermelonDB observer
    await LocalStorageManager.saveList(list);

    // Run Firebase operations in background (fire-and-forget)
    this.performBackgroundCreationTasks(userId, user, list.id).catch(() => {
      // Background task failed silently
    });

    return list;
  }

  /**
   * Background tasks for list creation (usage tracking and sync)
   */
  private async performBackgroundCreationTasks(
    userId: string,
    user: User,
    listId: string
  ): Promise<void> {
    try {
      // Check usage limits (informational - list already created locally)
      await UsageTracker.canCreateList(user);

      // Increment counter
      await UsageTracker.incrementListCounter(userId);

      // Sync to Firebase
      await SyncEngine.pushChange('list', listId, 'create');
    } catch {
      // Background task failed silently
    }
  }

  /**
   * Get all lists for family group (active and completed, sorted by creation date)
   * Implements Req 2.3
   */
  async getAllLists(familyGroupId: string): Promise<ShoppingList[]> {
    const lists = await LocalStorageManager.getAllLists(familyGroupId);
    // Sort by creation date, newest first
    return lists.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get all active lists for family group
   * Implements Req 2.3
   */
  async getAllActiveLists(familyGroupId: string): Promise<ShoppingList[]> {
    return await LocalStorageManager.getActiveLists(familyGroupId);
  }

  /**
   * Get list by ID
   * Implements Req 2.4
   */
  async getListById(listId: string): Promise<ShoppingList | null> {
    return await LocalStorageManager.getList(listId);
  }

  /**
   * Update list properties
   * Implements Req 2.5, 2.2
   */
  async updateList(listId: string, updates: Partial<ShoppingList>): Promise<ShoppingList> {
    const list = await LocalStorageManager.updateList(listId, {
      ...updates,
      syncStatus: 'pending',
    });

    // Trigger sync in background (fire-and-forget for instant local updates)
    SyncEngine.pushChange('list', listId, 'update').catch(() => {
      // Background sync failed, will retry later
    });

    return list;
  }

  /**
   * Update list name
   * Implements Req 2.5, 2.2
   */
  async updateListName(listId: string, newName: string): Promise<ShoppingList> {
    return this.updateList(listId, { name: newName });
  }

  /**
   * Update list store name
   * Implements Sprint 6: Store tracking
   */
  async updateListStoreName(listId: string, storeName: string): Promise<ShoppingList> {
    return this.updateList(listId, { storeName });
  }

  /**
   * Mark list as completed
   * Implements Req 2.7
   */
  async markListAsCompleted(listId: string): Promise<ShoppingList> {
    return this.updateList(listId, {
      status: 'completed',
      completedAt: Date.now(),
    });
  }

  /**
   * Delete list (soft delete)
   * Implements Req 2.6, 2.2
   */
  async deleteList(listId: string): Promise<void> {
    await this.updateList(listId, {
      status: 'deleted',
    });

    // Trigger sync for delete operation
    await SyncEngine.pushChange('list', listId, 'delete');
  }

  /**
   * Lock list for shopping (prevents others from editing)
   */
  async lockListForShopping(
    listId: string,
    userId: string,
    userName: string | null,
    userRole: string | null
  ): Promise<ShoppingList> {
    return this.updateList(listId, {
      isLocked: true,
      lockedBy: userId,
      lockedByName: userName,
      lockedByRole: userRole as any,
      lockedAt: Date.now(),
    });
  }

  /**
   * Fast completion using pre-calculated total (avoids re-fetching items)
   * Used by UI when running total is already known
   */
  async completeShoppingFast(
    listId: string,
    userId: string,
    preCalculatedTotal: number,
    storeName: string | null
  ): Promise<ShoppingList> {
    // Build receipt data with pre-calculated total (skip item fetch)
    const receiptData: ReceiptData | null =
      preCalculatedTotal > 0
        ? {
            merchantName: storeName,
            purchaseDate: null,
            subtotal: null,
            currency: '£',
            lineItems: [],
            discounts: [],
            totalDiscount: null,
            vatBreakdown: [],
            store: null,
            extractedAt: Date.now(),
            confidence: 1,
            totalAmount: preCalculatedTotal,
          }
        : null;

    const updatedList = await this.updateList(listId, {
      status: 'completed',
      completedAt: Date.now(),
      completedBy: userId,
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedByRole: null,
      lockedAt: null,
      ...(receiptData && { receiptData }),
    });

    return updatedList;
  }

  /**
   * Check if list is locked and if lock is still valid (< 2 hours)
   */
  async isListLockedForUser(listId: string, userId: string): Promise<boolean> {
    const list = await this.getListById(listId);
    if (!list || !list.isLocked) return false;

    // If locked by current user, not locked for them
    if (list.lockedBy === userId) return false;

    // Check if lock is expired (2 hours = 7200000 ms)
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (list.lockedAt && Date.now() - list.lockedAt > TWO_HOURS) {
      // Auto-unlock expired lock
      await this.updateList(listId, {
        isLocked: false,
        lockedBy: null,
        lockedByName: null,
        lockedByRole: null,
        lockedAt: null,
      });
      return false;
    }

    return true;
  }

  /**
   * Subscribe to list changes for real-time updates using WatermelonDB observers
   * Implements Req 4.4
   */
  subscribeToListChanges(
    familyGroupId: string,
    callback: (lists: ShoppingList[]) => void
  ): Unsubscribe {
    // Use WatermelonDB observers for true real-time updates (no polling!)
    return LocalStorageManager.observeAllLists(familyGroupId, (lists) => {
      // Filter out deleted and completed lists (completed shown in HistoryScreen)
      const visibleLists = lists
        .filter(list => list.status !== 'deleted' && list.status !== 'completed')
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(visibleLists);
    });
  }

  /**
   * Subscribe to a specific list for real-time updates using WatermelonDB observers
   */
  subscribeToSingleList(
    listId: string,
    callback: (list: ShoppingList | null) => void
  ): Unsubscribe {
    // Use WatermelonDB observers for true real-time updates (no polling!)
    return LocalStorageManager.observeList(listId, callback);
  }
}

export default new ShoppingListManager();

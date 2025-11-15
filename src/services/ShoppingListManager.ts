import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { ShoppingList, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';

/**
 * ShoppingListManager
 * Creates, reads, updates, and deletes shopping lists
 * Implements Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
class ShoppingListManager {
  /**
   * Create new shopping list
   * Implements Req 2.1, 2.2
   */
  async createList(name: string, userId: string, familyGroupId: string): Promise<ShoppingList> {
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
    };

    // Save locally first (offline-first)
    await LocalStorageManager.saveList(list);

    // Trigger sync
    await SyncEngine.pushChange('list', list.id, 'create');

    return list;
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

    // Trigger sync
    await SyncEngine.pushChange('list', listId, 'update');

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
   * Unlock list and mark as completed
   */
  async completeShoppingAndUnlock(listId: string, userId: string): Promise<ShoppingList> {
    return this.updateList(listId, {
      status: 'completed',
      completedAt: Date.now(),
      completedBy: userId,
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedByRole: null,
      lockedAt: null,
    });
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
   * Subscribe to list changes for real-time updates
   * Implements Req 4.4
   */
  subscribeToListChanges(
    familyGroupId: string,
    callback: (lists: ShoppingList[]) => void
  ): Unsubscribe {
    // Set up interval to check for updates
    // In production, this would use WatermelonDB observers
    const intervalId = setInterval(async () => {
      const lists = await this.getAllActiveLists(familyGroupId);
      callback(lists);
    }, 1000);

    return () => clearInterval(intervalId);
  }

  /**
   * Subscribe to a specific list for real-time updates
   */
  subscribeToSingleList(
    listId: string,
    callback: (list: ShoppingList | null) => void
  ): Unsubscribe {
    // Set up interval to check for updates
    const intervalId = setInterval(async () => {
      const list = await this.getListById(listId);
      callback(list);
    }, 500); // Check every 500ms for faster updates

    return () => clearInterval(intervalId);
  }
}

export default new ShoppingListManager();

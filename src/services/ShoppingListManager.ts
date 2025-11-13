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
      receiptUrl: null,
      receiptData: null,
      syncStatus: 'pending',
    };

    // Save locally first (offline-first)
    await LocalStorageManager.saveList(list);

    // Trigger sync
    await SyncEngine.pushChange('list', list.id, 'create');

    return list;
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
}

export default new ShoppingListManager();

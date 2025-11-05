import { v4 as uuidv4 } from 'uuid';
import { Item, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';

/**
 * ItemManager
 * Manages individual shopping list items
 * Implements Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
class ItemManager {
  /**
   * Add new item to shopping list
   * Implements Req 3.1, 3.2
   */
  async addItem(listId: string, name: string, userId: string, quantity?: string): Promise<Item> {
    const item: Item = {
      id: uuidv4(),
      listId,
      name,
      quantity: quantity || null,
      checked: false,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'pending',
    };

    // Save locally first (offline-first)
    await LocalStorageManager.saveItem(item);

    // Trigger sync
    await SyncEngine.pushChange('item', item.id, 'create');

    return item;
  }

  /**
   * Update item
   * Implements Req 3.5, 3.2
   */
  async updateItem(itemId: string, updates: Partial<Item>): Promise<Item> {
    const item = await LocalStorageManager.updateItem(itemId, {
      ...updates,
      updatedAt: Date.now(),
      syncStatus: 'pending',
    });

    // Trigger sync
    await SyncEngine.pushChange('item', itemId, 'update');

    return item;
  }

  /**
   * Toggle item checked status
   * Implements Req 3.3, 3.4, 3.2
   */
  async toggleItemChecked(itemId: string): Promise<Item> {
    const existingItem = await LocalStorageManager.getItem(itemId);
    if (!existingItem) {
      throw new Error('Item not found');
    }

    return await this.updateItem(itemId, {
      checked: !existingItem.checked,
    });
  }

  /**
   * Delete item
   * Implements Req 3.6, 3.2
   */
  async deleteItem(itemId: string): Promise<void> {
    await LocalStorageManager.deleteItem(itemId);

    // Trigger sync
    await SyncEngine.pushChange('item', itemId, 'delete');
  }

  /**
   * Get all items for a list
   */
  async getItemsForList(listId: string): Promise<Item[]> {
    return await LocalStorageManager.getItemsForList(listId);
  }

  /**
   * Subscribe to item changes for real-time updates
   * Implements Req 4.2
   */
  subscribeToItemChanges(listId: string, callback: (items: Item[]) => void): Unsubscribe {
    // Set up interval to check for updates
    // In production, this would use WatermelonDB observers
    const intervalId = setInterval(async () => {
      const items = await this.getItemsForList(listId);
      callback(items);
    }, 1000);

    return () => clearInterval(intervalId);
  }
}

export default new ItemManager();

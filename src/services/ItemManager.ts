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
  async addItem(listId: string, name: string, userId: string, quantity?: string, price?: number): Promise<Item> {
    const item: Item = {
      id: uuidv4(),
      listId,
      name,
      quantity: quantity || null,
      price: price || null,
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
   * Batch add multiple items to a shopping list
   * More efficient than calling addItem() multiple times
   * Useful for importing receipt items
   */
  async addItemsBatch(
    listId: string,
    itemsData: Array<{ name: string; quantity?: string; price?: number }>,
    userId: string
  ): Promise<Item[]> {
    const items: Item[] = itemsData.map(itemData => ({
      id: uuidv4(),
      listId,
      name: itemData.name,
      quantity: itemData.quantity || null,
      price: itemData.price || null,
      checked: false,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'pending',
    }));

    // Save all items in a single batch transaction
    await LocalStorageManager.saveItemsBatch(items);

    // Trigger sync for each item (SyncEngine handles batching internally)
    for (const item of items) {
      await SyncEngine.pushChange('item', item.id, 'create');
    }

    return items;
  }

  /**
   * Batch delete multiple items
   * More efficient than calling deleteItem() multiple times
   */
  async deleteItemsBatch(itemIds: string[]): Promise<void> {
    // Delete all items in a single batch transaction
    await LocalStorageManager.deleteItemsBatch(itemIds);

    // Trigger sync for each item
    for (const itemId of itemIds) {
      await SyncEngine.pushChange('item', itemId, 'delete');
    }
  }

  /**
   * Batch update multiple items
   * More efficient than calling updateItem() multiple times
   */
  async updateItemsBatch(updates: Array<{ id: string; updates: Partial<Item> }>): Promise<Item[]> {
    const updatedItems: Item[] = [];

    // Update all items in a single batch transaction
    for (const { id, updates: itemUpdates } of updates) {
      const item = await LocalStorageManager.updateItem(id, {
        ...itemUpdates,
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      updatedItems.push(item);
    }

    // Trigger sync for each item
    for (const { id } of updates) {
      await SyncEngine.pushChange('item', id, 'update');
    }

    return updatedItems;
  }

  /**
   * Subscribe to item changes for real-time updates using WatermelonDB observers
   * Implements Req 4.2
   */
  subscribeToItemChanges(listId: string, callback: (items: Item[]) => void): Unsubscribe {
    // Use WatermelonDB observers for true real-time updates (no polling!)
    return LocalStorageManager.observeItemsForList(listId, callback);
  }
}

export default new ItemManager();

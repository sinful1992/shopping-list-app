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
    console.log('[ItemManager.toggleItemChecked] START', {
      itemId,
      timestamp: new Date().toISOString()
    });

    const existingItem = await LocalStorageManager.getItem(itemId);

    console.log('[ItemManager.toggleItemChecked] Existing item fetched', {
      itemId,
      found: !!existingItem,
      currentChecked: existingItem?.checked,
      itemName: existingItem?.name,
      timestamp: new Date().toISOString()
    });

    if (!existingItem) {
      console.error('[ItemManager.toggleItemChecked] ERROR: Item not found', { itemId });
      throw new Error('Item not found');
    }

    const newCheckedState = !existingItem.checked;
    console.log('[ItemManager.toggleItemChecked] Toggling checked state', {
      itemId,
      from: existingItem.checked,
      to: newCheckedState,
      timestamp: new Date().toISOString()
    });

    const result = await this.updateItem(itemId, {
      checked: newCheckedState,
    });

    console.log('[ItemManager.toggleItemChecked] COMPLETE', {
      itemId,
      finalChecked: result.checked,
      timestamp: new Date().toISOString()
    });

    return result;
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
   * Subscribe to item changes for real-time updates using WatermelonDB observers
   * Implements Req 4.2
   */
  subscribeToItemChanges(listId: string, callback: (items: Item[]) => void): Unsubscribe {
    // Use WatermelonDB observers for true real-time updates (no polling!)
    return LocalStorageManager.observeItemsForList(listId, callback);
  }
}

export default new ItemManager();

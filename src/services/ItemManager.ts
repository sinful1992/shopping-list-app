import { v4 as uuidv4 } from 'uuid';
import { Item, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
import CategoryHistoryService from './CategoryHistoryService';
import CrashReporting from './CrashReporting';
import { sanitizeItemName, sanitizeQuantity, sanitizePrice, sanitizeCategory } from '../utils/sanitize';

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
    const sanitizedName = sanitizeItemName(name);
    if (!sanitizedName) {
      throw new Error('Item name is required');
    }

    // Get current items to determine next sort order
    const existingItems = await LocalStorageManager.getItemsForList(listId);
    const maxSortOrder = existingItems.reduce((max, item) => {
      return Math.max(max, item.sortOrder || 0);
    }, 0);

    const item: Item = {
      id: uuidv4(),
      listId,
      name: sanitizedName,
      quantity: sanitizeQuantity(quantity),
      price: sanitizePrice(price),
      checked: false,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'pending',
      sortOrder: maxSortOrder + 1,
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
    // Sanitize any name, quantity, price, or category updates
    const sanitizedUpdates: Partial<Item> = { ...updates };
    if (updates.name !== undefined) {
      const sanitizedName = sanitizeItemName(updates.name);
      if (!sanitizedName) {
        throw new Error('Item name is required');
      }
      sanitizedUpdates.name = sanitizedName;
    }
    if (updates.quantity !== undefined) {
      sanitizedUpdates.quantity = sanitizeQuantity(updates.quantity);
    }
    if (updates.price !== undefined) {
      sanitizedUpdates.price = sanitizePrice(updates.price);
    }
    if (updates.category !== undefined) {
      sanitizedUpdates.category = sanitizeCategory(updates.category);
    }

    const item = await LocalStorageManager.updateItem(itemId, {
      ...sanitizedUpdates,
      updatedAt: Date.now(),
      syncStatus: 'pending',
    });

    // Trigger sync in background (fire-and-forget for instant local updates)
    SyncEngine.pushChange('item', itemId, 'update').catch(error => {
      CrashReporting.recordError(error as Error, 'ItemManager.updateItem sync');
    });

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

    const newCheckedState = !existingItem.checked;

    // Update item
    const updatedItem = await this.updateItem(itemId, {
      checked: newCheckedState,
    });

    // Record category history when item is checked (purchased)
    // Fire-and-forget to avoid blocking the UI
    if (newCheckedState && existingItem.category) {
      LocalStorageManager.getList(existingItem.listId).then(list => {
        if (list?.familyGroupId) {
          CategoryHistoryService.recordCategoryUsage(
            list.familyGroupId,
            existingItem.name,
            existingItem.category
          );
        }
      }).catch(error => {
        CrashReporting.recordError(error as Error, 'ItemManager.toggleItemChecked categoryHistory');
        // Don't throw - this is a background operation
      });
    }

    return updatedItem;
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
    const items: Item[] = itemsData
      .map(itemData => {
        const sanitizedName = sanitizeItemName(itemData.name);
        if (!sanitizedName) return null; // Skip items with empty names
        return {
          id: uuidv4(),
          listId,
          name: sanitizedName,
          quantity: sanitizeQuantity(itemData.quantity),
          price: sanitizePrice(itemData.price),
          checked: false,
          createdBy: userId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'pending' as const,
        };
      })
      .filter((item): item is Item => item !== null);

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

  /**
   * Reorder items in a list
   * Updates sortOrder for all items based on new positions
   * Implements Sprint 7: Drag-and-drop reordering
   */
  async reorderItems(items: Item[]): Promise<void> {
    // Update sort order for all items based on array position
    const updates = items.map((item, index) => ({
      id: item.id,
      updates: { sortOrder: index },
    }));

    // Batch update all items
    await this.updateItemsBatch(updates);
  }
}

export default new ItemManager();

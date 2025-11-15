import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { UrgentItem, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
// @ts-ignore
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

/**
 * UrgentItemManager
 * Creates, reads, updates, and deletes urgent items
 * Manages standalone urgent item requests that notify family members
 */
class UrgentItemManager {
  /**
   * Sync urgent item to Supabase
   */
  private async syncToSupabase(urgentItem: UrgentItem): Promise<void> {
    try {
      // Check if environment variables are loaded
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase environment variables not loaded!');
        console.error('SUPABASE_URL:', SUPABASE_URL);
        console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'exists' : 'missing');
        throw new Error('Supabase configuration missing');
      }

      const url = `${SUPABASE_URL}/rest/v1/urgent_items`;
      console.log('Syncing urgent item to Supabase:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id: urgentItem.id,
          name: urgentItem.name,
          family_group_id: urgentItem.familyGroupId,
          created_by: urgentItem.createdBy,
          created_by_name: urgentItem.createdByName,
          created_at: urgentItem.createdAt,
          resolved_by: urgentItem.resolvedBy,
          resolved_by_name: urgentItem.resolvedByName,
          resolved_at: urgentItem.resolvedAt,
          price: urgentItem.price,
          status: urgentItem.status,
          sync_status: 'synced'
        })
      });

      console.log('Supabase response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to sync urgent item to Supabase:', errorText);
        throw new Error('Failed to sync urgent item');
      }

      // Update local sync status
      await LocalStorageManager.updateUrgentItem(urgentItem.id, {
        syncStatus: 'synced'
      });

      console.log('Urgent item synced to Supabase successfully');
    } catch (error) {
      console.error('Error syncing urgent item to Supabase:', error);
      // Update local sync status to failed
      await LocalStorageManager.updateUrgentItem(urgentItem.id, {
        syncStatus: 'failed'
      });
      throw error;
    }
  }

  /**
   * Create new urgent item
   */
  async createUrgentItem(
    name: string,
    userId: string,
    userName: string,
    familyGroupId: string
  ): Promise<UrgentItem> {
    const urgentItem: UrgentItem = {
      id: uuidv4(),
      name,
      familyGroupId,
      createdBy: userId,
      createdByName: userName,
      createdAt: Date.now(),
      resolvedBy: null,
      resolvedByName: null,
      resolvedAt: null,
      price: null,
      status: 'active',
      syncStatus: 'pending',
    };

    // Save locally first (offline-first)
    await LocalStorageManager.saveUrgentItem(urgentItem);

    // Sync to Supabase (will trigger Edge Function for FCM notifications)
    try {
      await this.syncToSupabase(urgentItem);
    } catch (error) {
      console.error('Failed to sync urgent item, will retry later:', error);
      // Item is still saved locally, can retry later
    }

    return urgentItem;
  }

  /**
   * Get urgent item by ID
   */
  async getUrgentItemById(itemId: string): Promise<UrgentItem | null> {
    return await LocalStorageManager.getUrgentItem(itemId);
  }

  /**
   * Get active urgent items for family group
   */
  async getActiveUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    return await LocalStorageManager.getActiveUrgentItems(familyGroupId);
  }

  /**
   * Get resolved urgent items for family group
   */
  async getResolvedUrgentItems(
    familyGroupId: string,
    startDate?: number,
    endDate?: number
  ): Promise<UrgentItem[]> {
    return await LocalStorageManager.getResolvedUrgentItems(familyGroupId, startDate, endDate);
  }

  /**
   * Get all urgent items (active and resolved)
   */
  async getAllUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    return await LocalStorageManager.getAllUrgentItems(familyGroupId);
  }

  /**
   * Resolve urgent item (mark as picked up/completed)
   */
  async resolveUrgentItem(
    itemId: string,
    userId: string,
    userName: string,
    price?: number
  ): Promise<UrgentItem> {
    const updates: Partial<UrgentItem> = {
      status: 'resolved',
      resolvedBy: userId,
      resolvedByName: userName,
      resolvedAt: Date.now(),
      syncStatus: 'pending',
    };

    if (price !== undefined) {
      updates.price = price;
    }

    const urgentItem = await LocalStorageManager.updateUrgentItem(itemId, updates);

    // Sync to Supabase
    try {
      await this.syncToSupabase(urgentItem);
    } catch (error) {
      console.error('Failed to sync resolved urgent item, will retry later:', error);
    }

    return urgentItem;
  }

  /**
   * Update urgent item properties
   */
  async updateUrgentItem(itemId: string, updates: Partial<UrgentItem>): Promise<UrgentItem> {
    const urgentItem = await LocalStorageManager.updateUrgentItem(itemId, {
      ...updates,
      syncStatus: 'pending',
    });

    // Trigger sync
    await SyncEngine.pushChange('urgentItem', itemId, 'update');

    return urgentItem;
  }

  /**
   * Delete urgent item
   */
  async deleteUrgentItem(itemId: string): Promise<void> {
    await LocalStorageManager.deleteUrgentItem(itemId);

    // Trigger sync for delete operation
    await SyncEngine.pushChange('urgentItem', itemId, 'delete');
  }

  /**
   * Subscribe to urgent item changes for real-time updates using WatermelonDB observers
   */
  subscribeToUrgentItems(
    familyGroupId: string,
    callback: (items: UrgentItem[]) => void
  ): Unsubscribe {
    // Use WatermelonDB observers for true real-time updates (no polling!)
    return LocalStorageManager.observeActiveUrgentItems(familyGroupId, callback);
  }
}

export default new UrgentItemManager();

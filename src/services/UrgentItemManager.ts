import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import database from '@react-native-firebase/database';
import { UrgentItem, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';
import { sanitizeUrgentItemName, sanitizePrice } from '../utils/sanitize';
import supabase from './SupabaseClient';

/**
 * UrgentItemManager
 * Creates, reads, updates, and deletes urgent items
 * Manages standalone urgent item requests that notify family members
 */
class UrgentItemManager {
  /**
   * Sync urgent item to Firebase Realtime Database (for real-time sync)
   */
  private async syncToFirebase(urgentItem: UrgentItem): Promise<void> {
    const urgentItemRef = database().ref(`urgentItems/${urgentItem.familyGroupId}/${urgentItem.id}`);
    await urgentItemRef.set({
      id: urgentItem.id,
      name: urgentItem.name,
      familyGroupId: urgentItem.familyGroupId,
      createdBy: urgentItem.createdBy,
      createdByName: urgentItem.createdByName,
      createdAt: urgentItem.createdAt,
      resolvedBy: urgentItem.resolvedBy,
      resolvedByName: urgentItem.resolvedByName,
      resolvedAt: urgentItem.resolvedAt,
      price: urgentItem.price,
      status: urgentItem.status,
    });
  }

  /**
   * Delete urgent item from Firebase Realtime Database
   */
  private async deleteFromFirebase(urgentItemId: string, familyGroupId: string): Promise<void> {
    try {
      const urgentItemRef = database().ref(`urgentItems/${familyGroupId}/${urgentItemId}`);
      await urgentItemRef.remove();
    } catch {
      // Silently handle removal error
    }
  }

  /**
   * Sync urgent item to Supabase (for push notifications)
   */
  private async syncToSupabase(urgentItem: UrgentItem): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('upsert-urgent-item', {
        body: {
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
        },
      });

      if (error) {
        throw error;
      }

      await LocalStorageManager.updateUrgentItem(urgentItem.id, {
        syncStatus: 'synced',
      });
    } catch (error) {
      await LocalStorageManager.updateUrgentItem(urgentItem.id, {
        syncStatus: 'failed',
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
    const sanitizedName = sanitizeUrgentItemName(name);
    if (!sanitizedName) {
      throw new Error('Urgent item name is required');
    }

    const urgentItem: UrgentItem = {
      id: uuidv4(),
      name: sanitizedName,
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

    // Dual-write to both backends:
    // 1. Sync to Firebase (for real-time sync)
    try {
      await this.syncToFirebase(urgentItem);
    } catch {
      // Firebase sync failed silently
    }

    // 2. Sync to Supabase (for push notifications via Edge Function)
    try {
      await this.syncToSupabase(urgentItem);
    } catch {
      // Item is still saved locally, can retry later
    }

    return urgentItem;
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
      updates.price = sanitizePrice(price);
    }

    const urgentItem = await LocalStorageManager.updateUrgentItem(itemId, updates);

    // Dual-write to both backends:
    // 1. Sync to Firebase (for real-time sync)
    try {
      await this.syncToFirebase(urgentItem);
    } catch {
      // Firebase sync failed silently
    }

    // 2. Sync to Supabase (for push notifications)
    try {
      await this.syncToSupabase(urgentItem);
    } catch {
      // Supabase sync failed silently
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
  async deleteUrgentItem(itemId: string, familyGroupId: string): Promise<void> {
    await LocalStorageManager.deleteUrgentItem(itemId);

    // Delete from Firebase
    try {
      await this.deleteFromFirebase(itemId, familyGroupId);
    } catch {
      // Firebase deletion failed silently
    }

    // Trigger sync for delete operation (for Supabase)
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

  /**
   * Subscribe to resolved urgent item changes for real-time updates using WatermelonDB observers
   */
  subscribeToResolvedUrgentItems(
    familyGroupId: string,
    callback: (items: UrgentItem[]) => void
  ): Unsubscribe {
    return LocalStorageManager.observeResolvedUrgentItems(familyGroupId, callback);
  }
}

export default new UrgentItemManager();

// @ts-ignore
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import { UrgentItem, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';

// Lazy load Supabase to prevent crashes if package has issues
let createClient: any = null;
let RealtimeChannel: any = null;

try {
  const supabaseModule = require('@supabase/supabase-js');
  createClient = supabaseModule.createClient;
  RealtimeChannel = supabaseModule.RealtimeChannel;
} catch (error) {
  console.warn('Supabase package not available, real-time sync disabled for urgent items');
}

/**
 * SupabaseSyncListener
 * Listens to Supabase Realtime changes and syncs them to local WatermelonDB
 * This enables true real-time sync for urgent items across devices
 * Implements Requirements: 5.1, 5.2, 5.3, 4.4
 */
class SupabaseSyncListener {
  private supabase: any;
  private activeChannels: Map<string, any> = new Map();

  constructor() {
    // Initialize Supabase client with Realtime enabled
    if (createClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          realtime: {
            params: {
              eventsPerSecond: 10, // Throttle to prevent overwhelming the client
            },
          },
        });
      } catch (error) {
        console.warn('Failed to initialize Supabase client:', error);
        this.supabase = null;
      }
    } else {
      console.warn('Supabase not available or credentials not configured, real-time sync disabled for urgent items');
    }
  }

  /**
   * Start listening to urgent items for a family group
   * When Supabase data changes, update local WatermelonDB
   */
  startListeningToUrgentItems(familyGroupId: string): Unsubscribe {
    if (!this.supabase) {
      console.warn('Supabase not initialized, cannot start listening to urgent items');
      return () => {};
    }

    const channelKey = `urgent_items_${familyGroupId}`;

    // Don't create duplicate channels
    if (this.activeChannels.has(channelKey)) {
      console.log('Already listening to urgent items for family group:', familyGroupId);
      return () => this.stopListeningToUrgentItems(familyGroupId);
    }

    // Create a channel for this family group's urgent items
    const channel = this.supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'urgent_items',
          filter: `family_group_id=eq.${familyGroupId}`,
        },
        async (payload: any) => {
          console.log('Supabase INSERT event:', payload);
          await this.syncUrgentItemToLocal(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'urgent_items',
          filter: `family_group_id=eq.${familyGroupId}`,
        },
        async (payload: any) => {
          console.log('Supabase UPDATE event:', payload);
          await this.syncUrgentItemToLocal(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'urgent_items',
          filter: `family_group_id=eq.${familyGroupId}`,
        },
        async (payload: any) => {
          console.log('Supabase DELETE event:', payload);
          const itemId = payload.old.id;
          if (itemId) {
            try {
              await LocalStorageManager.deleteUrgentItem(itemId);
            } catch (error) {
              console.error('Error syncing urgent item deletion:', error);
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log('Supabase channel status:', status, 'for family group:', familyGroupId);
      });

    this.activeChannels.set(channelKey, channel);

    // Return unsubscribe function
    return () => this.stopListeningToUrgentItems(familyGroupId);
  }

  /**
   * Sync an urgent item from Supabase to local WatermelonDB
   */
  private async syncUrgentItemToLocal(supabaseData: any): Promise<void> {
    try {
      const urgentItem: UrgentItem = {
        id: supabaseData.id,
        name: supabaseData.name,
        familyGroupId: supabaseData.family_group_id,
        createdBy: supabaseData.created_by,
        createdByName: supabaseData.created_by_name,
        createdAt: supabaseData.created_at,
        resolvedBy: supabaseData.resolved_by || null,
        resolvedByName: supabaseData.resolved_by_name || null,
        resolvedAt: supabaseData.resolved_at || null,
        price: supabaseData.price || null,
        status: supabaseData.status || 'active',
        syncStatus: 'synced', // Mark as synced since it came from Supabase
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveUrgentItem(urgentItem);
      console.log('Urgent item synced to local DB:', urgentItem.id);
    } catch (error) {
      console.error('Error syncing urgent item to local:', error);
    }
  }

  /**
   * Stop listening to urgent items for a family group
   */
  stopListeningToUrgentItems(familyGroupId: string): void {
    const channelKey = `urgent_items_${familyGroupId}`;
    const channel = this.activeChannels.get(channelKey);

    if (channel && this.supabase) {
      this.supabase.removeChannel(channel);
      this.activeChannels.delete(channelKey);
      console.log('Stopped listening to urgent items for family group:', familyGroupId);
    }
  }

  /**
   * Stop all active channels
   */
  stopAllListeners(): void {
    if (!this.supabase) return;

    this.activeChannels.forEach((channel, key) => {
      this.supabase.removeChannel(channel);
      console.log('Stopped channel:', key);
    });
    this.activeChannels.clear();
  }

  /**
   * Check if Supabase is properly initialized
   */
  isInitialized(): boolean {
    return this.supabase !== null;
  }
}

export default new SupabaseSyncListener();

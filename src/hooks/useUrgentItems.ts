import { useState, useEffect, useCallback } from 'react';
import { UrgentItem, User } from '../models/types';
import AuthenticationModule from '../services/AuthenticationModule';
import UrgentItemManager from '../services/UrgentItemManager';
import FirebaseSyncListener from '../services/FirebaseSyncListener';

/**
 * useUrgentItems Hook
 *
 * Manages urgent items state including active and resolved items.
 *
 * Usage:
 *   const { activeItems, resolvedItems, loading, createItem, resolveItem } = useUrgentItems();
 */
export function useUrgentItems() {
  const [user, setUser] = useState<User | null>(null);
  const [activeItems, setActiveItems] = useState<UrgentItem[]>([]);
  const [resolvedItems, setResolvedItems] = useState<UrgentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to auth state
  useEffect(() => {
    const unsubscribeAuth = AuthenticationModule.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser?.familyGroupId) {
        loadUrgentItems(currentUser.familyGroupId);
      }
    });

    return unsubscribeAuth;
  }, []);

  // Subscribe to real-time urgent items updates
  useEffect(() => {
    if (!user?.familyGroupId) return;

    // Start listening to Firebase for remote changes
    const unsubscribeFirebase = FirebaseSyncListener.startListeningToUrgentItems(
      user.familyGroupId
    );

    // Subscribe to active items
    const unsubscribeActiveItems = UrgentItemManager.subscribeToUrgentItems(
      user.familyGroupId,
      (updatedItems) => {
        setActiveItems(updatedItems);
      }
    );

    // Subscribe to resolved items
    const unsubscribeResolvedItems = UrgentItemManager.subscribeToResolvedUrgentItems(
      user.familyGroupId,
      (updatedItems) => {
        setResolvedItems(updatedItems);
      }
    );

    return () => {
      unsubscribeFirebase();
      unsubscribeActiveItems();
      unsubscribeResolvedItems();
    };
  }, [user?.familyGroupId]);

  const loadUrgentItems = async (familyGroupId: string) => {
    try {
      setLoading(true);
      const [active, resolved] = await Promise.all([
        UrgentItemManager.getActiveUrgentItems(familyGroupId),
        UrgentItemManager.getResolvedUrgentItems(familyGroupId),
      ]);
      setActiveItems(active);
      setResolvedItems(resolved);
    } catch {
      // Failed to load urgent items
    } finally {
      setLoading(false);
    }
  };

  const createItem = useCallback(async (name: string): Promise<void> => {
    if (!user || !user.familyGroupId) {
      throw new Error('User not authenticated');
    }

    await UrgentItemManager.createUrgentItem(
      name.trim(),
      user.uid,
      user.displayName || 'Unknown',
      user.familyGroupId,
      user
    );
    // WatermelonDB observer will automatically update the UI
  }, [user]);

  const resolveItem = useCallback(async (itemId: string, price?: number): Promise<void> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    await UrgentItemManager.resolveUrgentItem(
      itemId,
      user.uid,
      user.displayName || 'Unknown',
      price
    );
    // WatermelonDB observer will automatically update the UI
  }, [user]);

  const deleteItem = useCallback(async (itemId: string): Promise<void> => {
    if (!user?.familyGroupId) {
      throw new Error('User not authenticated');
    }

    await UrgentItemManager.deleteUrgentItem(itemId, user.familyGroupId);
  }, [user]);

  const formatTimeAgo = useCallback((timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }, []);

  return {
    user,
    activeItems,
    resolvedItems,
    loading,
    createItem,
    resolveItem,
    deleteItem,
    formatTimeAgo,
  };
}

export default useUrgentItems;

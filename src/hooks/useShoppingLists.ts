import { useState, useEffect, useCallback } from 'react';
import { ShoppingList, User } from '../models/types';
import ShoppingListManager from '../services/ShoppingListManager';
import FirebaseSyncListener from '../services/FirebaseSyncListener';

/**
 * useShoppingLists Hook
 *
 * Manages shopping list state, subscriptions, and CRUD operations.
 * Uses WatermelonDB as single source of truth with syncStatus marker.
 *
 * Usage:
 *   const { lists, loading, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);
 */
export function useShoppingLists(familyGroupId: string | null, user: User | null) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Subscribe to real-time list changes
  useEffect(() => {
    if (!familyGroupId) {
      setLoading(false);
      return;
    }

    // Start listening to Firebase for remote changes
    const unsubscribeFirebase = FirebaseSyncListener.startListeningToLists(familyGroupId);
    const unsubscribeCategoryHistory = FirebaseSyncListener.startListeningToCategoryHistory(familyGroupId);

    // Subscribe to local WatermelonDB changes - single source of truth
    const unsubscribeLocal = ShoppingListManager.subscribeToListChanges(
      familyGroupId,
      (updatedLists) => {
        setLists(updatedLists);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeFirebase();
      unsubscribeCategoryHistory();
      unsubscribeLocal();
    };
  }, [familyGroupId]);

  // Create list - save to DB, observer will pick it up
  const createList = useCallback(async (listName: string): Promise<ShoppingList | null> => {
    if (creating) return null;
    if (!user || !user.familyGroupId) return null;

    setCreating(true);

    try {
      const list = await ShoppingListManager.createListOptimistic(
        listName,
        user.uid,
        user.familyGroupId,
        user
      );
      // Observer will automatically show the list with syncStatus: 'pending'
      return list;
    } finally {
      setCreating(false);
    }
  }, [user, creating]);

  // Delete list
  const deleteList = useCallback(async (listId: string): Promise<void> => {
    await ShoppingListManager.deleteList(listId);
    // WatermelonDB observer will automatically update the UI
  }, []);

  // Refresh lists manually
  const refresh = useCallback(async (): Promise<void> => {
    if (!familyGroupId) return;

    setLoading(true);
    try {
      const allLists = await ShoppingListManager.getAllLists(familyGroupId);
      const activeLists = allLists.filter(list => list.status !== 'deleted' && list.status !== 'completed');
      setLists(activeLists);
    } finally {
      setLoading(false);
    }
  }, [familyGroupId]);

  return {
    lists,
    loading,
    creating,
    createList,
    deleteList,
    refresh,
  };
}

export default useShoppingLists;

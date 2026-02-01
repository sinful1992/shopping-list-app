import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Subscribe to real-time list changes
  useEffect(() => {
    if (!familyGroupId) {
      setLoading(false);
      return;
    }

    // Helper to start Firebase listeners
    const startFirebaseListeners = () => {
      FirebaseSyncListener.stopListeningToLists(familyGroupId);
      FirebaseSyncListener.stopListeningToCategoryHistory(familyGroupId);
      FirebaseSyncListener.startListeningToLists(familyGroupId);
      FirebaseSyncListener.startListeningToCategoryHistory(familyGroupId);
    };

    // Start listening to Firebase for remote changes
    startFirebaseListeners();

    // Subscribe to local WatermelonDB changes - single source of truth
    const unsubscribeLocal = ShoppingListManager.subscribeToListChanges(
      familyGroupId,
      (updatedLists) => {
        setLists(updatedLists);
        setLoading(false);
      }
    );

    // Restart Firebase listeners when app returns to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        startFirebaseListeners();
      }
      appStateRef.current = nextAppState;
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      FirebaseSyncListener.stopListeningToLists(familyGroupId);
      FirebaseSyncListener.stopListeningToCategoryHistory(familyGroupId);
      unsubscribeLocal();
      appStateSubscription.remove();
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
  // Note: Observer already provides real-time updates from WatermelonDB.
  // We don't call getAllLists here because it could return stale data
  // and overwrite the observer's up-to-date data, causing lists to disappear.
  const refresh = useCallback(async (): Promise<void> => {
    if (!familyGroupId) return;

    setLoading(true);
    // Brief delay to show loading indicator for user feedback
    await new Promise(resolve => setTimeout(resolve, 300));
    setLoading(false);
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

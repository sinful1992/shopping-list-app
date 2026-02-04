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
 * Data loading strategy:
 * - Fetches lists directly from database on mount, foreground return, and manual refresh
 * - Observer subscription handles real-time updates between fetches
 * - Direct fetches ensure lists display immediately (observer can be unreliable on remount)
 *
 * Usage:
 *   const { lists, loading, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);
 */
export function useShoppingLists(familyGroupId: string | null, user: User | null) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pendingListsRef = useRef<Map<string, ShoppingList>>(new Map());
  const lastFamilyGroupIdRef = useRef<string | null>(null);

  const mergeWithPendingLists = useCallback((updatedLists: ShoppingList[]) => {
    const mergedLists = [...updatedLists];
    const pendingCount = pendingListsRef.current.size;
    const updatedIds = updatedLists.map(l => l.id.slice(-6)).join(',');

    console.log(`[MERGE] updatedLists: ${updatedLists.length}, pending: ${pendingCount}, ids: [${updatedIds}]`);

    for (const [listId, pendingList] of pendingListsRef.current.entries()) {
      const foundList = updatedLists.find(l => l.id === listId);
      if (foundList) {
        console.log(`[MERGE] Found ${listId.slice(-6)} in updated, syncStatus: ${foundList.syncStatus}`);
        // Only remove from pending backup when confirmed synced
        if (foundList.syncStatus === 'synced') {
          console.log(`[MERGE] Removing ${listId.slice(-6)} from pending (synced)`);
          pendingListsRef.current.delete(listId);
        }
        continue;
      }
      console.log(`[MERGE] Adding ${listId.slice(-6)} from pending (not in updated)`);
      mergedLists.push(pendingList);
    }

    console.log(`[MERGE] Final count: ${mergedLists.length}`);
    return mergedLists.sort((a, b) => b.createdAt - a.createdAt);
  }, []);

  // Subscribe to real-time list changes
  useEffect(() => {
    if (!familyGroupId) {
      setLoading(false);
      return;
    }

    // Only clear pending lists when familyGroupId actually changes
    // (switching to a different family group)
    if (lastFamilyGroupIdRef.current !== familyGroupId) {
      console.log(`[EFFECT] familyGroupId changed: ${lastFamilyGroupIdRef.current} -> ${familyGroupId}, clearing pending`);
      pendingListsRef.current.clear();
      lastFamilyGroupIdRef.current = familyGroupId;
    } else {
      console.log(`[EFFECT] familyGroupId unchanged: ${familyGroupId}, keeping ${pendingListsRef.current.size} pending`);
    }

    // Immediately load lists from database (don't rely solely on observer)
    // This ensures lists show immediately when component mounts/remounts
    ShoppingListManager.getAllLists(familyGroupId).then((allLists) => {
      const visibleLists = allLists
        .filter(list => list.status !== 'deleted' && list.status !== 'completed')
        .sort((a, b) => b.createdAt - a.createdAt);
      setLists(mergeWithPendingLists(visibleLists));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

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
        console.log(`[OBSERVER] Received ${updatedLists.length} lists, pending: ${pendingListsRef.current.size}`);
        setLists(mergeWithPendingLists(updatedLists));
        setLoading(false);
      }
    );

    // Restart Firebase listeners and refresh lists when app returns to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        startFirebaseListeners();

        // Refresh lists from database to ensure UI is current
        ShoppingListManager.getAllLists(familyGroupId).then((allLists) => {
          const visibleLists = allLists
            .filter(list => list.status !== 'deleted' && list.status !== 'completed')
            .sort((a, b) => b.createdAt - a.createdAt);
          setLists(mergeWithPendingLists(visibleLists));
        }).catch(() => {});
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
  }, [familyGroupId, mergeWithPendingLists]);

  // Create list - save to DB, observer will pick it up
  const createList = useCallback(async (listName: string): Promise<ShoppingList | null> => {
    if (creating) return null;
    if (!user) return null;
    if (!familyGroupId) {
      if (user.familyGroupId) {
        console.warn('useShoppingLists.createList called without familyGroupId while user has one.', {
          userFamilyGroupId: user.familyGroupId,
        });
      } else {
        console.warn('useShoppingLists.createList called without familyGroupId.');
      }
      return null;
    }

    setCreating(true);

    try {
      console.log(`[CREATE] Starting createListOptimistic for "${listName}"`);
      const list = await ShoppingListManager.createListOptimistic(
        listName,
        user.uid,
        familyGroupId,
        user
      );
      console.log(`[CREATE] List created: ${list.id.slice(-6)}, adding to pending`);
      pendingListsRef.current.set(list.id, list);
      console.log(`[CREATE] pendingListsRef now has ${pendingListsRef.current.size} items`);
      setLists((currentLists) => mergeWithPendingLists(currentLists));
      // Observer will automatically show the list with syncStatus: 'pending'
      return list;
    } finally {
      setCreating(false);
    }
  }, [user, familyGroupId, creating, mergeWithPendingLists]);

  // Delete list
  const deleteList = useCallback(async (listId: string): Promise<void> => {
    await ShoppingListManager.deleteList(listId);
    // WatermelonDB observer will automatically update the UI
  }, []);

  // Refresh lists manually (pull-to-refresh)
  const refresh = useCallback(async (): Promise<void> => {
    if (!familyGroupId) return;

    setLoading(true);
    try {
      const allLists = await ShoppingListManager.getAllLists(familyGroupId);
      const visibleLists = allLists
        .filter(list => list.status !== 'deleted' && list.status !== 'completed')
        .sort((a, b) => b.createdAt - a.createdAt);
      setLists(mergeWithPendingLists(visibleLists));
    } finally {
      setLoading(false);
    }
  }, [familyGroupId, mergeWithPendingLists]);

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

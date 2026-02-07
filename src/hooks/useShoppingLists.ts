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
const MIN_PENDING_AGE_MS = 2000;

export function useShoppingLists(familyGroupId: string | null, user: User | null) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pendingListsRef = useRef<Map<string, { list: ShoppingList; addedAt: number }>>(new Map());
  const lastFamilyGroupIdRef = useRef<string | null>(null);

  const mergeWithPendingLists = useCallback((updatedLists: ShoppingList[]) => {
    const pendingEntries = Array.from(pendingListsRef.current.values());
    const updatedMap = new Map(updatedLists.map(l => [l.id, l]));

    const mergedLists = [...updatedLists];

    for (const entry of pendingEntries) {
      if (!updatedMap.has(entry.list.id)) {
        mergedLists.push(entry.list);
      }
    }

    const now = Date.now();
    for (const [listId, entry] of pendingListsRef.current.entries()) {
      const foundList = updatedMap.get(listId);
      if (foundList && foundList.syncStatus === 'synced' && now - entry.addedAt >= MIN_PENDING_AGE_MS) {
        pendingListsRef.current.delete(listId);
      }
    }

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
      pendingListsRef.current.clear();
      lastFamilyGroupIdRef.current = familyGroupId;
    }

    const fetchLists = () =>
      ShoppingListManager.getAllActiveLists(familyGroupId).then((activeLists) => {
        setLists(mergeWithPendingLists(activeLists));
      });

    fetchLists()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));

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

        fetchLists().catch(() => {});
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
    if (creatingRef.current) return null;
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

    creatingRef.current = true;
    setCreating(true);

    try {
      const list = await ShoppingListManager.createListOptimistic(
        listName,
        user.uid,
        familyGroupId,
        user
      );
      pendingListsRef.current.set(list.id, { list, addedAt: Date.now() });
      setLists((currentLists) => mergeWithPendingLists(currentLists));
      return list;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [user, familyGroupId, mergeWithPendingLists]);

  // Delete list
  const deleteList = useCallback(async (listId: string): Promise<void> => {
    let deletedItem: ShoppingList | undefined;
    const deletedPending = pendingListsRef.current.get(listId);

    pendingListsRef.current.delete(listId);
    setLists((cur) => {
      deletedItem = cur.find(l => l.id === listId);
      return cur.filter(list => list.id !== listId);
    });

    try {
      await ShoppingListManager.deleteList(listId);
    } catch {
      if (deletedPending) {
        pendingListsRef.current.set(listId, deletedPending);
      }
      if (deletedItem) {
        setLists((cur) => [...cur, deletedItem!].sort((a, b) => b.createdAt - a.createdAt));
      }
    }
  }, []);

  // Refresh lists manually (pull-to-refresh)
  const refresh = useCallback(async (): Promise<void> => {
    if (!familyGroupId) return;

    setLoading(true);
    try {
      const activeLists = await ShoppingListManager.getAllActiveLists(familyGroupId);
      setLists(mergeWithPendingLists(activeLists));
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

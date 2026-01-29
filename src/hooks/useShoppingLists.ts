import { useState, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ShoppingList, User } from '../models/types';
import ShoppingListManager from '../services/ShoppingListManager';
import FirebaseSyncListener from '../services/FirebaseSyncListener';

/**
 * useShoppingLists Hook
 *
 * Manages shopping list state, subscriptions, and CRUD operations.
 * Handles optimistic updates for instant UI feedback.
 *
 * Usage:
 *   const { lists, pendingLists, loading, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);
 */
export function useShoppingLists(familyGroupId: string | null, user: User | null) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [pendingLists, setPendingLists] = useState<ShoppingList[]>([]);
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

    // Subscribe to local WatermelonDB changes
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

  // Coordinate pending list removal when list appears in observer
  useEffect(() => {
    if (pendingLists.length === 0) return;

    const listIds = new Set(lists.map((l) => l.id));
    const stillPending = pendingLists.filter((pending) => !listIds.has(pending.id));

    if (stillPending.length !== pendingLists.length) {
      setPendingLists(stillPending);
    }
  }, [lists, pendingLists]);

  // Combine pending and observer lists, avoiding duplicates
  const combinedLists = useMemo(() => {
    const realListIds = new Set(lists.map((l) => l.id));
    const uniquePending = pendingLists.filter((p) => !realListIds.has(p.id));
    return [...uniquePending, ...lists];
  }, [pendingLists, lists]);

  // Create list with optimistic update
  const createList = useCallback(async (listName: string): Promise<ShoppingList | null> => {
    if (creating) return null;
    if (!user || !user.familyGroupId) return null;

    const listId = uuidv4();
    const optimisticList: ShoppingList = {
      id: listId,
      name: listName,
      familyGroupId: user.familyGroupId,
      createdBy: user.uid,
      createdAt: Date.now(),
      status: 'active',
      completedAt: null,
      completedBy: null,
      receiptUrl: null,
      receiptData: null,
      syncStatus: 'pending',
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedByRole: null,
      lockedAt: null,
      budget: null,
    };

    setPendingLists((prev) => [optimisticList, ...prev]);
    setCreating(true);

    try {
      await ShoppingListManager.createListOptimistic(listName, user.uid, user.familyGroupId, user, listId);
      return optimisticList;
    } catch (error) {
      // Remove optimistic list on failure
      setPendingLists((prev) => prev.filter((l) => l.id !== listId));
      throw error;
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
    lists: combinedLists,
    pendingLists,
    loading,
    creating,
    createList,
    deleteList,
    refresh,
  };
}

export default useShoppingLists;

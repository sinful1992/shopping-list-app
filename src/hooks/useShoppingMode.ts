import { useState, useCallback } from 'react';
import { ShoppingList, User } from '../models/types';
import ShoppingListManager from '../services/ShoppingListManager';
import StoreHistoryService from '../services/StoreHistoryService';

/**
 * useShoppingMode Hook
 *
 * Manages shopping mode state including lock/unlock, store selection, and completion.
 *
 * Usage:
 *   const { isShoppingMode, isHeaderExpanded, startShopping, doneShopping, ... } = useShoppingMode(listId, list, user);
 */
export function useShoppingMode(
  listId: string,
  list: ShoppingList | null,
  user: User | null,
  runningTotal: number
) {
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Start shopping mode
  const startShopping = useCallback(async (storeName: string): Promise<void> => {
    if (!user?.uid) return;

    // Add store to history if provided
    if (storeName) {
      await StoreHistoryService.addStore(storeName);
      await ShoppingListManager.updateListStoreName(listId, storeName);
    }

    // Lock list for shopping
    await ShoppingListManager.lockListForShopping(
      listId,
      user.uid,
      user.displayName || null,
      user.role || null
    );

    setIsShoppingMode(true);
  }, [listId, user]);

  // Complete shopping
  const doneShopping = useCallback(async (): Promise<void> => {
    if (!user?.uid) return;

    // Immediate UI feedback
    setIsShoppingMode(false);

    // Run completion in background with pre-calculated data
    const storeName = list?.storeName || null;
    await ShoppingListManager.completeShoppingFast(listId, user.uid, runningTotal, storeName);
  }, [listId, list, user, runningTotal]);

  // Update list name
  const updateListName = useCallback(async (newName: string): Promise<void> => {
    await ShoppingListManager.updateListName(listId, newName);
  }, [listId]);

  // Toggle header expansion
  const toggleHeaderExpanded = useCallback(() => {
    setIsHeaderExpanded(prev => !prev);
  }, []);

  // Set shopping mode state (used by list observer)
  const setShoppingModeState = useCallback((isLocked: boolean, lockedBy: string | null) => {
    if (user?.uid && isLocked && lockedBy === user.uid) {
      setIsShoppingMode(true);
    } else {
      setIsShoppingMode(false);
    }
  }, [user]);

  return {
    isShoppingMode,
    isHeaderExpanded,
    startShopping,
    doneShopping,
    updateListName,
    toggleHeaderExpanded,
    setIsHeaderExpanded,
    setShoppingModeState,
  };
}

export default useShoppingMode;

import { useEffect, useRef, useState } from 'react';
import { ShoppingList } from '../../../models/types';
import ShoppingListManager from '../../../services/ShoppingListManager';
import CrashReporting from '../../../services/CrashReporting';

/**
 * useShoppingMode
 * Derives lock/shopping-mode/permission state from the current list and user.
 * Recomputes whenever the list object changes (every WatermelonDB observer
 * push produces a new identity), replacing the three duplicated lock-state
 * blocks ListDetailScreen used to maintain.
 *
 * setIsShoppingMode/setIsListLocked are exposed for the optimistic UI paths
 * (start/cancel/complete shopping) — the next observer push reconciles them.
 */
export function useShoppingMode(list: ShoppingList | null, currentUserId: string | null) {
  const [isListLocked, setIsListLocked] = useState(false);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  // Ref mirror for callbacks that must not close over stale lock state
  const isListLockedRef = useRef(false);

  const isListCompleted = list?.status === 'completed';
  // Completed lists: only the shopper who completed it can add items.
  // Active lists: anyone can add unless the list is locked for this user.
  const canAddItems = !list
    ? true
    : isListCompleted
      ? list.completedBy === currentUserId
      : !isListLocked;

  useEffect(() => {
    if (!list || !currentUserId) return;
    let cancelled = false;
    ShoppingListManager.isListLockedForUser(list.id, currentUserId)
      .then(locked => {
        if (cancelled) return;
        isListLockedRef.current = locked;
        setIsListLocked(locked);
        setIsShoppingMode(list.isLocked === true && list.lockedBy === currentUserId);
      })
      .catch(error => {
        CrashReporting.recordError(error as Error, 'useShoppingMode isListLockedForUser');
      });
    return () => { cancelled = true; };
  }, [list, currentUserId]);

  return {
    isListLocked,
    setIsListLocked,
    isListLockedRef,
    isShoppingMode,
    setIsShoppingMode,
    isListCompleted,
    canAddItems,
  };
}

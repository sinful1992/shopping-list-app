import { useEffect, useMemo } from 'react';
import type { ShoppingList } from '../models/types';
import FirebaseSyncListener from '../services/FirebaseSyncListener';

/**
 * Keeps the items of every active list synced while Home is shown. Items are
 * otherwise only fetched when a list is opened, so an item another family
 * member marked urgent would never reach this phone's Home card.
 */
export function useActiveListItemsSync(familyGroupId: string | null, lists: ShoppingList[]): void {
  const activeIds = useMemo(
    () => lists.filter(l => l.status === 'active').map(l => l.id).sort().join(','),
    [lists],
  );

  useEffect(() => {
    if (!familyGroupId || !activeIds) return;
    const unsubscribes = activeIds.split(',').map(listId =>
      FirebaseSyncListener.startListeningToItems(familyGroupId, listId),
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [familyGroupId, activeIds]);
}

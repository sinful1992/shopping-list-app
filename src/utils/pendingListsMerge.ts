import { ShoppingList } from '../models/types';

/**
 * A locally-created list held on screen until the database round-trip
 * confirms it (guards against the observer briefly emitting without it).
 */
export interface PendingListEntry {
  list: ShoppingList;
  addedAt: number;
}

/**
 * Minimum age before a pending entry is released once its list arrives
 * synced from the DB — absorbs the create → observer-echo window.
 */
export const MIN_PENDING_AGE_MS = 2000;

/**
 * Merge DB-emitted lists with locally-pending ones (pure; `now` injected for
 * testability). Pending entries whose list has arrived synced and is older
 * than MIN_PENDING_AGE_MS are deleted from the map (intentional mutation —
 * the caller owns the map across calls).
 */
export function mergeWithPendingLists(
  updatedLists: ShoppingList[],
  pendingLists: Map<string, PendingListEntry>,
  now: number
): ShoppingList[] {
  const updatedMap = new Map(updatedLists.map(l => [l.id, l]));

  const mergedLists = [...updatedLists];
  for (const entry of pendingLists.values()) {
    if (!updatedMap.has(entry.list.id)) {
      mergedLists.push(entry.list);
    }
  }

  for (const [listId, entry] of pendingLists.entries()) {
    const foundList = updatedMap.get(listId);
    if (foundList && foundList.syncStatus === 'synced' && now - entry.addedAt >= MIN_PENDING_AGE_MS) {
      pendingLists.delete(listId);
    }
  }

  return mergedLists.sort((a, b) => b.createdAt - a.createdAt);
}

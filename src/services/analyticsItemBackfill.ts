import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseSyncListener from './FirebaseSyncListener';
import CrashReporting from './CrashReporting';
import { Item } from '../models/types';

/**
 * Pulls items for completed lists that have none stored locally.
 *
 * Analytics reads the local items table only. On a fresh install — or any
 * device that joined the group after a trip was completed — the lists sync
 * but their items never do, so spend, stores and the trend render while the
 * category pie, Most Purchased and the item count silently read empty.
 * HistoryDetailScreen already solves this per list with
 * fetchItemsOnceForHistory; this is the same fetch, batched for the window
 * Analytics is showing.
 *
 * Every fetch is one RTDB query per list, which is exactly the round-trip
 * storm a8aa59c removed from the aggregation, so this is fenced in three ways:
 * only lists with zero local items are ever asked for, every list is asked at
 * most once ever (the attempt is persisted, so a reload or a period change
 * does not ask again), and a single run is capped. fetchItemsOnceForHistory
 * upserts what it finds, so a list that comes back with items is filtered out
 * by the zero-items test from then on regardless of the persisted set.
 */

const ATTEMPTED_KEY = (familyGroupId: string) => `@analytics_item_backfill_v1_${familyGroupId}`;

/** One run's ceiling on RTDB queries. A year of history converges over a few loads. */
const MAX_LISTS_PER_RUN = 40;

/** Queries in flight at once. */
const CONCURRENCY = 5;

/** Mirrors AsyncStorage so a reload inside the session costs no read. */
const attemptedCache = new Map<string, Set<string>>();

async function loadAttempted(familyGroupId: string): Promise<Set<string>> {
  const cached = attemptedCache.get(familyGroupId);
  if (cached) return cached;

  let ids: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(ATTEMPTED_KEY(familyGroupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // A corrupt or unreadable flag costs one repeat fetch, not a broken screen.
  }

  const set = new Set(ids);
  attemptedCache.set(familyGroupId, set);
  return set;
}

/** Reset between family groups in tests; the cache is module state. */
export function _resetAttemptedCache(): void {
  attemptedCache.clear();
}

/**
 * @param listIds Completed lists in the window that have no local items.
 * @returns The items that were found, already upserted locally.
 */
export async function backfillMissingItems(
  familyGroupId: string,
  listIds: string[],
): Promise<Item[]> {
  if (listIds.length === 0) return [];

  const attempted = await loadAttempted(familyGroupId);
  const pending = listIds.filter(id => !attempted.has(id)).slice(0, MAX_LISTS_PER_RUN);
  if (pending.length === 0) return [];

  const fetched: Item[] = [];
  let anyAttemptRecorded = false;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(listId => FirebaseSyncListener.fetchItemsOnceForHistory(familyGroupId, listId)),
    );

    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      // Only a resolved fetch counts as attempted. A rejection is offline or a
      // permission blip — marking it would blank the item half permanently.
      attempted.add(chunk[index]);
      anyAttemptRecorded = true;
      fetched.push(...result.value);
    });
  }

  if (anyAttemptRecorded) {
    try {
      await AsyncStorage.setItem(ATTEMPTED_KEY(familyGroupId), JSON.stringify(Array.from(attempted)));
    } catch (e) {
      CrashReporting.recordError(e as Error, 'analyticsItemBackfill persist attempted');
    }
  }

  return fetched;
}

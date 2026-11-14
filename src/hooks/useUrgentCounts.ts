import { useEffect, useState } from 'react';
import LocalStorageManager from '../services/LocalStorageManager';

/** listId → number of unchecked urgent items, kept live from the local database. */
export function useUrgentCounts(): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());

  useEffect(() => LocalStorageManager.observeUrgentCounts(setCounts), []);

  return counts;
}

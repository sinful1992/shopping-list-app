/**
 * Whether a stored row holds a local change that has not reached the server yet. Only 'pending' and
 * 'failed' count. 'synced' is the server copy, and '' is an item row stored before 1.54.3, when item
 * rows never recorded their sync state: such a row is treated as the server copy, so a server
 * snapshot replaces it (a brand-new local item has no server copy yet, so nothing older can arrive).
 */
export function isUnsentLocalChange(syncStatus: string | null | undefined): boolean {
  return syncStatus === 'pending' || syncStatus === 'failed';
}

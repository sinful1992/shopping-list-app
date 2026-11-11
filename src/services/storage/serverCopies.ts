import { ShoppingList, Item } from '../../models/types';

/**
 * Rank 20 (audit 137, task 142/143): the last copy of each list and item the server is known to
 * hold, keyed "list/<id>" / "item/<id>". FirebaseSyncListener writes it as snapshots arrive;
 * SyncEngine reads it to send an update as only the fields that changed. In memory only: after a
 * restart an entity is written whole until the listener has seen it again.
 */
export type Fields = Record<string, unknown>;

const copies = new Map<string, Fields>();

export const ServerCopies = {
  key(entityType: 'list' | 'item', entityId: string): string {
    return `${entityType}/${entityId}`;
  },
  /** What the server now holds for an entity; null = it is gone. */
  note(entityType: 'list' | 'item', entityId: string, data: ShoppingList | Item | null): void {
    const k = ServerCopies.key(entityType, entityId);
    if (data == null) { copies.delete(k); return; }
    const { syncStatus: _, ...fields } = data as unknown as Fields;
    copies.set(k, fields);
  },
  get(key: string): Fields | undefined {
    return copies.get(key);
  },
  set(key: string, fields: Fields): void {
    copies.set(key, fields);
  },
  delete(key: string): void {
    copies.delete(key);
  },
  clear(): void {
    copies.clear();
  },
};

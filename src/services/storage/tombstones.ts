import { Database, Q } from '@nozbe/watermelondb';

const CHUNK = 500;

/**
 * WatermelonDB keeps a soft-deleted row ("tombstone") under its id. Queries and
 * find() do not see it, but creating a row with the same id fails with
 * "Duplicate key for property id". Rows that come back from Firebase keep their
 * ids, so a save path that creates with an incoming id calls this first, inside
 * its own database.write.
 *
 * A tombstone whose delete is still waiting in sync_queue belongs to a row the
 * user deleted on this phone: it stays, and its id is returned so the caller
 * skips that row instead of bringing it back. Every other tombstone among `ids`
 * is destroyed, so the create can go ahead.
 */
export async function purgeStaleTombstones(
  database: Database,
  table: string,
  ids: string[],
): Promise<Set<string>> {
  const kept = new Set<string>();
  if (ids.length === 0) return kept;

  const deleted = new Set(await database.adapter.getDeletedRecords(table));
  if (deleted.size === 0) return kept;
  const tombstoned = [...new Set(ids)].filter(id => deleted.has(id));
  if (tombstoned.length === 0) return kept;

  for (let i = 0; i < tombstoned.length; i += CHUNK) {
    const chunk = tombstoned.slice(i, i + CHUNK);
    const pending = await database.get('sync_queue')
      .query(Q.where('entity_id', Q.oneOf(chunk)), Q.where('operation', 'delete'))
      .fetch();
    pending.forEach((op: any) => kept.add(op.entityId));
  }

  const stale = tombstoned.filter(id => !kept.has(id));
  if (stale.length > 0) await database.adapter.destroyDeletedRecords(table, stale);
  return kept;
}

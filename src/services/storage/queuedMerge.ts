import { canonicalJson } from './firebaseMappers';
import type { Fields } from './serverCopies';

/**
 * Left note 138 (audit 137, task 145): a change queued while this phone was offline is replayed
 * later, when another phone may have written the same item or list in between. The replay runs
 * as an RTDB transaction, so this compare happens against what the server holds at that moment.
 *
 * `current` is the server's value now (null = nothing there, or not yet known to the transaction).
 * `sent` is what this phone sends: the changed fields (`base` = the server copy the change was made
 * on) or, with no base, the whole object. Returns the value to write, or null to write nothing.
 *
 * - Nothing newer on the server (its updatedAt is before ours): ours applies, as before.
 * - The server is newer and we have a base: a field the other phone did not touch (the server still
 *   has the base value) takes ours; a field it did touch keeps its newer value. Only our fields that
 *   are left are written; with none left, nothing is.
 * - The server is newer and we have no base (a whole write after a restart): we cannot tell which
 *   fields were ours, so the newer server copy wins and nothing is written.
 *
 * The transaction turns "write nothing" into RTDB's answers with [transactionValue].
 */
export function mergeQueued(current: Fields | null, sent: Fields, base: Fields | null): Fields | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(canonicalJson(a ?? null)) === JSON.stringify(canonicalJson(b ?? null));
  if (current == null) {
    // A field change of something no longer on the server would bring back half an object
    return base ? null : { ...sent };
  }
  const theirs = typeof current.updatedAt === 'number' ? current.updatedAt : null;
  const ours = typeof sent.updatedAt === 'number' ? sent.updatedAt : null;
  // A tie counts as newer (Codex review of PR #69): two phones can stamp the same millisecond, and then
  // only the base tells whose field it is. Our own write that already landed is a tie too; it then
  // writes nothing, which is right, since the server already has it.
  const serverNewer = theirs != null && ours != null && theirs >= ours;
  if (!base) return serverNewer ? null : { ...sent };
  const kept: Fields = {};
  for (const k of Object.keys(sent)) {
    if (k === 'updatedAt') continue;
    if (!serverNewer || same(current[k], base[k])) kept[k] = sent[k];
  }
  if (Object.keys(kept).length === 0) return null;
  const next: Fields = { ...current, ...kept };
  next.updatedAt = serverNewer ? theirs : (sent.updatedAt ?? current.updatedAt);
  // a field set to null is removed in RTDB
  for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
  return next;
}

/**
 * What a transaction handler returns for [mergeQueued]'s answer. "Write nothing" over a value is
 * undefined (abort: the server keeps its copy). Over null it is null: RTDB first calls a handler with
 * its cached value, which is null for data it has not loaded, and null then makes the server answer
 * with its real value and run the compare again (undefined would end it on a guess). Returning null
 * for a real value would DELETE it, so that never happens.
 */
export function transactionValue(current: Fields | null, next: Fields | null): Fields | null | undefined {
  if (next !== null) return next;
  return current == null ? null : undefined;
}

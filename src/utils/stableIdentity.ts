/**
 * Keep object identity for data that did not change, so React.memo'd rows
 * and lists can skip re-rendering (OPTIMISE P6 step 2, Fable audit task 137).
 * Each database emission rebuilds every item object, and the open list's
 * grouping rebuilt every category array, so one tick re-rendered every
 * category.
 */

/** Same own keys, each value identical (===). */
export function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

/**
 * Returns `next` with each element replaced by the previous object of the
 * same id when nothing in it changed. `cache` is updated to the result, and
 * ids no longer present are dropped from it.
 */
export function reuseById<T extends { id: string }>(cache: Map<string, T>, next: T[]): T[] {
  const out = next.map(item => {
    const prev = cache.get(item.id);
    return prev && shallowEqual(prev, item) ? prev : item;
  });
  cache.clear();
  for (const item of out) cache.set(item.id, item);
  return out;
}

/** Keep a group's previous array when it holds the same elements in the same order. */
export function stableGroups<T>(
  prev: { [key: string]: T[] } | null,
  next: { [key: string]: T[] },
): { [key: string]: T[] } {
  if (!prev) return next;
  const out: { [key: string]: T[] } = {};
  for (const key of Object.keys(next)) {
    const a = prev[key];
    const b = next[key];
    out[key] = a && a.length === b.length && a.every((x, i) => x === b[i]) ? a : b;
  }
  return out;
}

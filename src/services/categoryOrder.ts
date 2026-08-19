import CategoryService, { CategoryType } from './CategoryService';

/**
 * Places any category the order leaves out.
 *
 * ListDetailScreen renders unchecked items by filtering a category order, and
 * its sibling branch only picks up keys that aren't known categories. A known
 * category missing from the order therefore renders nowhere at all, so orders
 * reaching the screen get topped up rather than trusted — notably layouts
 * synced from another device, where the Firebase mapper defaults an absent
 * categoryOrder to [].
 *
 * Missing categories are *inserted*, not appended. A saved StoreLayout holds
 * whatever the canonical list looked like when it was saved, and appending put
 * every category added since below `Other` — at the far end of the shop walk,
 * repairable only by tapping the up arrow once per position. Instead each
 * missing id lands just after the nearest earlier category that the stored
 * order does contain, which leaves the stored order entirely intact while
 * putting new categories beside the ones they were split from.
 */
export function completeCategoryOrder(order: CategoryType[]): CategoryType[] {
  const canonical = CategoryService.getCategories().map(c => c.id);
  const seen = new Set(order);
  const missing = canonical.filter(id => !seen.has(id));
  if (missing.length === 0) return order;

  const result = [...order];

  // Walk canonically so that a run of consecutive missing categories keeps its
  // own relative order: each one anchors on the previous, already-placed id.
  for (const id of missing) {
    let insertAt = 0;
    for (let i = canonical.indexOf(id) - 1; i >= 0; i--) {
      const anchor = result.indexOf(canonical[i]);
      if (anchor !== -1) {
        insertAt = anchor + 1;
        break;
      }
    }
    result.splice(insertAt, 0, id);
  }

  return result;
}

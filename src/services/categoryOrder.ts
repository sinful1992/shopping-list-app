import CategoryService, { CategoryType } from './CategoryService';

/**
 * Appends any category the order leaves out.
 *
 * ListDetailScreen renders unchecked items by filtering a category order, and
 * its sibling branch only picks up keys that aren't known categories. A known
 * category missing from the order therefore renders nowhere at all, so orders
 * reaching the screen get topped up rather than trusted — notably layouts
 * synced from another device, where the Firebase mapper defaults an absent
 * categoryOrder to [].
 */
export function completeCategoryOrder(order: CategoryType[]): CategoryType[] {
  const seen = new Set(order);
  const missing = CategoryService.getCategories()
    .map(c => c.id)
    .filter(id => !seen.has(id));
  return missing.length === 0 ? order : [...order, ...missing];
}

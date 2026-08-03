import CategoryService, { CategoryType } from './CategoryService';

/**
 * Seed category orders for chains whose stores follow a broadly consistent
 * layout. A preset is only a starting point: a saved StoreLayout for the same
 * store always wins, and the first time the user reorders and saves, their
 * order replaces the preset for good.
 */
export interface StoreLayoutPreset {
  /** Matched as a substring of the lowercased store name. */
  token: string;
  /** Must be a permutation of every CategoryType — see completeCategoryOrder. */
  categoryOrder: CategoryType[];
}

export const STORE_LAYOUT_PRESETS: StoreLayoutPreset[] = [
  {
    token: 'tesco',
    categoryOrder: [
      'Produce',
      'Bakery',
      'Meat',
      'Fish',
      'Dairy',
      'Pantry',
      'Beverages',
      'Household',
      'Personal Care',
      'Medicine',
      'Frozen',
      'Other',
    ],
  },
];

/**
 * Appends any category the order leaves out.
 *
 * ListDetailScreen renders unchecked items by filtering this order, and its
 * fallback branch only picks up keys that aren't known categories. A known
 * category missing from the order therefore renders nowhere at all, so orders
 * reaching the screen — presets, and layouts synced from other devices — get
 * topped up rather than trusted.
 */
export function completeCategoryOrder(order: CategoryType[]): CategoryType[] {
  const seen = new Set(order);
  const missing = CategoryService.getCategories()
    .map(c => c.id)
    .filter(id => !seen.has(id));
  return missing.length === 0 ? order : [...order, ...missing];
}

export function getPresetCategoryOrder(storeName: string | null | undefined): CategoryType[] | null {
  if (!storeName) return null;
  const normalized = storeName.toLowerCase();
  const preset = STORE_LAYOUT_PRESETS.find(p => normalized.includes(p.token));
  return preset ? [...preset.categoryOrder] : null;
}

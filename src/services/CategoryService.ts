/**
 * CategoryService
 * Manages predefined categories for shopping list items
 * Sprint 6: Category Organization
 *
 * Two rules govern this file.
 *
 * 1. An `id` is permanent. It is what lands in items.category, in
 *    category_history.category, in store_layouts.category_order, and — raw,
 *    unescaped — as a Firebase RTDB path segment in CategoryHistoryService.
 *    Renaming one orphans all four. `name` is the display label and is free to
 *    change; `id` is not.
 * 2. Because ids become RTDB keys, none may contain . # $ [ ] or /.
 *    CategoryService.test.ts asserts this.
 *
 * The four `legacy` entries are the old coarse buckets, kept so existing items
 * keep rendering and grouping exactly as before. They are excluded from the
 * picker (getPickerCategories) but stay in getCategories(), which is what
 * completeCategoryOrder reads — dropping them would hide their items entirely.
 * They sit next to the categories they were split into so a leftover item still
 * appears in roughly the right place on the shop walk, and they drain naturally
 * as items get re-edited.
 *
 * Declaration order below IS the display order. sortOrder is kept consistent
 * but nothing reads it (getCategorySortOrder has no call sites).
 */

export type CategoryType =
  // Fresh
  | 'Fruit'
  | 'Vegetables'
  | 'Salad & Herbs'
  | 'Produce'
  | 'Bakery'
  // Chilled & frozen
  | 'Dairy'
  | 'Cheese'
  | 'Deli & Chilled'
  | 'Meat'
  | 'Fish'
  | 'Frozen'
  // Cupboard
  | 'Tins & Packets'
  | 'Pasta & Rice'
  | 'Cereals'
  | 'Cooking & Condiments'
  | 'Snacks & Sweets'
  | 'Pantry'
  // Drinks
  | 'Soft Drinks'
  | 'Tea & Coffee'
  | 'Alcohol'
  | 'Beverages'
  // Household
  | 'Cleaning'
  | 'Kitchen & Paper'
  | 'Household'
  | 'Personal Care'
  | 'Medicine'
  | 'Other';

export type CategoryGroup =
  | 'Fresh'
  | 'Chilled & Frozen'
  | 'Cupboard'
  | 'Drinks'
  | 'Household';

export interface Category {
  id: CategoryType;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  /** Retired bucket: still renders and groups, but not offered in the picker. */
  legacy?: boolean;
  /** Section heading in the picker. */
  group: CategoryGroup;
}

class CategoryService {
  private static instance: CategoryService;

  private readonly categories: Category[] = [
    // Fresh — Produce split three ways; docs/store-layouts.md records that
    // fruit, veg and prepared salad sit in separate bays.
    { id: 'Fruit', name: 'Fruit', icon: '🍎', color: '#43A047', sortOrder: 1, group: 'Fresh' },
    { id: 'Vegetables', name: 'Vegetables', icon: '🥕', color: '#2E7D32', sortOrder: 2, group: 'Fresh' },
    { id: 'Salad & Herbs', name: 'Salad & Herbs', icon: '🥗', color: '#689F38', sortOrder: 3, group: 'Fresh' },
    { id: 'Produce', name: 'Produce', icon: '🥬', color: '#4CAF50', sortOrder: 4, legacy: true, group: 'Fresh' },
    { id: 'Bakery', name: 'Bakery', icon: '🍞', color: '#FF9800', sortOrder: 5, group: 'Fresh' },

    // Chilled & frozen. 'Dairy' keeps its id — only the label widened to name
    // the eggs that were always filed here.
    { id: 'Dairy', name: 'Dairy & Eggs', icon: '🥛', color: '#2196F3', sortOrder: 6, group: 'Chilled & Frozen' },
    { id: 'Cheese', name: 'Cheese', icon: '🧀', color: '#FBC02D', sortOrder: 7, group: 'Chilled & Frozen' },
    { id: 'Deli & Chilled', name: 'Deli & Chilled', icon: '🥓', color: '#AD1457', sortOrder: 8, group: 'Chilled & Frozen' },
    { id: 'Meat', name: 'Meat', icon: '🥩', color: '#F44336', sortOrder: 9, group: 'Chilled & Frozen' },
    { id: 'Fish', name: 'Fish', icon: '🐟', color: '#03A9F4', sortOrder: 10, group: 'Chilled & Frozen' },
    { id: 'Frozen', name: 'Frozen', icon: '❄️', color: '#00BCD4', sortOrder: 11, group: 'Chilled & Frozen' },

    // Cupboard — Pantry was the worst sprawler of the twelve.
    { id: 'Tins & Packets', name: 'Tins & Packets', icon: '🥫', color: '#6D4C41', sortOrder: 12, group: 'Cupboard' },
    { id: 'Pasta & Rice', name: 'Pasta & Rice', icon: '🍝', color: '#EF6C00', sortOrder: 13, group: 'Cupboard' },
    { id: 'Cereals', name: 'Cereals', icon: '🥣', color: '#D84315', sortOrder: 14, group: 'Cupboard' },
    { id: 'Cooking & Condiments', name: 'Cooking & Condiments', icon: '🧂', color: '#827717', sortOrder: 15, group: 'Cupboard' },
    { id: 'Snacks & Sweets', name: 'Snacks & Sweets', icon: '🍫', color: '#5D4037', sortOrder: 16, group: 'Cupboard' },
    { id: 'Pantry', name: 'Pantry', icon: '🫙', color: '#795548', sortOrder: 17, legacy: true, group: 'Cupboard' },

    // Drinks — tea and coffee are rarely anywhere near the soft drinks.
    { id: 'Soft Drinks', name: 'Soft Drinks', icon: '🥤', color: '#7B1FA2', sortOrder: 18, group: 'Drinks' },
    { id: 'Tea & Coffee', name: 'Tea & Coffee', icon: '☕', color: '#4E342E', sortOrder: 19, group: 'Drinks' },
    { id: 'Alcohol', name: 'Alcohol', icon: '🍷', color: '#880E4F', sortOrder: 20, group: 'Drinks' },
    { id: 'Beverages', name: 'Beverages', icon: '🧃', color: '#9C27B0', sortOrder: 21, legacy: true, group: 'Drinks' },

    // Household — cleaning and paper goods are usually distinct aisles.
    { id: 'Cleaning', name: 'Cleaning', icon: '🧹', color: '#00838F', sortOrder: 22, group: 'Household' },
    { id: 'Kitchen & Paper', name: 'Kitchen & Paper', icon: '🧻', color: '#455A64', sortOrder: 23, group: 'Household' },
    { id: 'Household', name: 'Household', icon: '🧽', color: '#607D8B', sortOrder: 24, legacy: true, group: 'Household' },
    { id: 'Personal Care', name: 'Personal Care', icon: '🧴', color: '#E91E63', sortOrder: 25, group: 'Household' },
    { id: 'Medicine', name: 'Medicine', icon: '💊', color: '#FF5722', sortOrder: 26, group: 'Household' },

    // Catch-all for uncategorised items. Has no shelf, so it stays last.
    { id: 'Other', name: 'Other', icon: '📦', color: '#9E9E9E', sortOrder: 27, group: 'Household' },
  ];

  private constructor() {}

  static getInstance(): CategoryService {
    if (!CategoryService.instance) {
      CategoryService.instance = new CategoryService();
    }
    return CategoryService.instance;
  }

  /**
   * Get all available categories, legacy ones included.
   *
   * Callers that order or render existing items want this. completeCategoryOrder
   * depends on it covering every id that can appear in items.category.
   */
  getCategories(): Category[] {
    return [...this.categories];
  }

  /**
   * Get the categories offered when picking one for an item.
   *
   * Excludes retired buckets, so nobody files anything new under 'Produce'
   * now that Fruit, Vegetables and Salad & Herbs exist.
   */
  getPickerCategories(): Category[] {
    return this.categories.filter(cat => !cat.legacy);
  }

  /**
   * Get a category by ID.
   * Accepts any string — item.category comes from Firebase and can hold
   * unknown/legacy values; those return null (call sites already handle it).
   */
  getCategory(id: string | null | undefined): Category | null {
    if (!id) return null;
    return this.categories.find(cat => cat.id === id) || null;
  }

  /**
   * Get category color
   */
  getCategoryColor(id: string | null | undefined): string {
    const category = this.getCategory(id);
    return category?.color || this.categories.find(c => c.id === 'Other')!.color;
  }

  /**
   * Get category icon
   */
  getCategoryIcon(id: string | null | undefined): string {
    const category = this.getCategory(id);
    return category?.icon || this.categories.find(c => c.id === 'Other')!.icon;
  }

  /**
   * Get category name
   */
  getCategoryName(id: string | null | undefined): string {
    const category = this.getCategory(id);
    return category?.name || 'Other';
  }

  /**
   * Get default category (Other)
   */
  getDefaultCategory(): Category {
    return this.categories.find(c => c.id === 'Other')!;
  }

  /**
   * Get sort order for category (for grouping/sorting)
   */
  getCategorySortOrder(id: string | null | undefined): number {
    const category = this.getCategory(id);
    return category?.sortOrder || 999; // Uncategorized items go last
  }

  /**
   * Validate if a string is a valid category ID
   */
  isValidCategory(id: string | null | undefined): id is CategoryType {
    if (!id) return false;
    return this.categories.some(cat => cat.id === id);
  }
}

export default CategoryService.getInstance();

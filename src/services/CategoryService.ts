/**
 * CategoryService
 * Manages predefined categories for shopping list items
 * Sprint 6: Category Organization
 */

export type CategoryType =
  | 'Produce'
  | 'Dairy'
  | 'Meat'
  | 'Bakery'
  | 'Frozen'
  | 'Pantry'
  | 'Beverages'
  | 'Household'
  | 'Personal Care'
  | 'Other';

export interface Category {
  id: CategoryType;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

class CategoryService {
  private static instance: CategoryService;

  private readonly categories: Category[] = [
    { id: 'Produce', name: 'Produce', icon: '🥬', color: '#4CAF50', sortOrder: 1 },
    { id: 'Dairy', name: 'Dairy', icon: '🥛', color: '#2196F3', sortOrder: 2 },
    { id: 'Meat', name: 'Meat', icon: '🥩', color: '#F44336', sortOrder: 3 },
    { id: 'Bakery', name: 'Bakery', icon: '🍞', color: '#FF9800', sortOrder: 4 },
    { id: 'Frozen', name: 'Frozen', icon: '❄️', color: '#00BCD4', sortOrder: 5 },
    { id: 'Pantry', name: 'Pantry', icon: '🥫', color: '#795548', sortOrder: 6 },
    { id: 'Beverages', name: 'Beverages', icon: '🧃', color: '#9C27B0', sortOrder: 7 },
    { id: 'Household', name: 'Household', icon: '🧹', color: '#607D8B', sortOrder: 8 },
    { id: 'Personal Care', name: 'Personal Care', icon: '🧴', color: '#E91E63', sortOrder: 9 },
    { id: 'Other', name: 'Other', icon: '📦', color: '#9E9E9E', sortOrder: 10 },
  ];

  private constructor() {}

  static getInstance(): CategoryService {
    if (!CategoryService.instance) {
      CategoryService.instance = new CategoryService();
    }
    return CategoryService.instance;
  }

  /**
   * Get all available categories
   */
  getCategories(): Category[] {
    return [...this.categories];
  }

  /**
   * Get a category by ID
   */
  getCategory(id: CategoryType | null | undefined): Category | null {
    if (!id) return null;
    return this.categories.find(cat => cat.id === id) || null;
  }

  /**
   * Get category color
   */
  getCategoryColor(id: CategoryType | null | undefined): string {
    const category = this.getCategory(id);
    return category?.color || this.categories.find(c => c.id === 'Other')!.color;
  }

  /**
   * Get category icon
   */
  getCategoryIcon(id: CategoryType | null | undefined): string {
    const category = this.getCategory(id);
    return category?.icon || this.categories.find(c => c.id === 'Other')!.icon;
  }

  /**
   * Get category name
   */
  getCategoryName(id: CategoryType | null | undefined): string {
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
  getCategorySortOrder(id: CategoryType | null | undefined): number {
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

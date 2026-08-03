import CategoryService, { CategoryType } from '../CategoryService';
import { completeCategoryOrder } from '../categoryOrder';

const allCategoryIds = CategoryService.getCategories().map(c => c.id).sort();

describe('completeCategoryOrder', () => {
  it('leaves a complete order untouched, by identity', () => {
    const complete = CategoryService.getCategories().map(c => c.id);
    expect(completeCategoryOrder(complete)).toBe(complete);
  });

  it('appends categories the order leaves out, keeping the given order first', () => {
    const partial: CategoryType[] = ['Frozen', 'Produce'];
    const result = completeCategoryOrder(partial);

    expect(result.slice(0, 2)).toEqual(['Frozen', 'Produce']);
    expect([...result].sort()).toEqual(allCategoryIds);
  });

  // The case that reaches this from Firebase: mapFirebaseStoreLayout defaults
  // a missing categoryOrder to [], which would otherwise empty the whole list.
  it('fills an empty order with every category', () => {
    expect([...completeCategoryOrder([])].sort()).toEqual(allCategoryIds);
  });

  it('does not drop duplicates already present in the order', () => {
    const withDupe: CategoryType[] = ['Produce', 'Produce'];
    const result = completeCategoryOrder(withDupe);
    expect(result.filter(c => c === 'Produce')).toHaveLength(2);
  });
});

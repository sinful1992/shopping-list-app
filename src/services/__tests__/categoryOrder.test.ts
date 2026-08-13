import CategoryService, { CategoryType } from '../CategoryService';
import { completeCategoryOrder } from '../categoryOrder';

const allCategoryIds = CategoryService.getCategories().map(c => c.id).sort();

describe('completeCategoryOrder', () => {
  it('leaves a complete order untouched, by identity', () => {
    const complete = CategoryService.getCategories().map(c => c.id);
    expect(completeCategoryOrder(complete)).toBe(complete);
  });

  it('adds the categories the order leaves out, keeping the given order intact', () => {
    const partial: CategoryType[] = ['Frozen', 'Produce'];
    const result = completeCategoryOrder(partial);

    expect(result.indexOf('Frozen')).toBeLessThan(result.indexOf('Produce'));
    expect([...result].sort()).toEqual(allCategoryIds);
  });

  // A layout saved before the categories were split holds only the old twelve.
  // Appending the new ones put them all below Other, at the far end of the shop
  // walk, where the only repair is one arrow tap per position.
  it('places categories missing from an older layout beside their siblings, not last', () => {
    const savedBeforeTheSplit: CategoryType[] = [
      'Produce', 'Dairy', 'Meat', 'Fish', 'Bakery', 'Frozen',
      'Pantry', 'Beverages', 'Household', 'Personal Care', 'Medicine', 'Other',
    ];
    const result = completeCategoryOrder(savedBeforeTheSplit);

    expect([...result].sort()).toEqual(allCategoryIds);
    expect(result[result.length - 1]).toBe('Other');

    // Produce's replacements sit with Produce, well clear of the Other bucket.
    expect(result.indexOf('Fruit')).toBeLessThan(result.indexOf('Produce'));
    expect(result.indexOf('Vegetables')).toBeLessThan(result.indexOf('Produce'));
    expect(result.indexOf('Tins & Packets')).toBeLessThan(result.indexOf('Pantry'));
    expect(result.indexOf('Tea & Coffee')).toBeLessThan(result.indexOf('Beverages'));
    expect(result.indexOf('Cleaning')).toBeLessThan(result.indexOf('Household'));

    // The saved order itself is untouched.
    const savedPositions = savedBeforeTheSplit.map(id => result.indexOf(id));
    expect(savedPositions).toEqual([...savedPositions].sort((a, b) => a - b));
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

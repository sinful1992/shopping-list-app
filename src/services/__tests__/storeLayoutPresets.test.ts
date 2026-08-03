import CategoryService, { CategoryType } from '../CategoryService';
import {
  STORE_LAYOUT_PRESETS,
  completeCategoryOrder,
  getPresetCategoryOrder,
} from '../storeLayoutPresets';

const allCategoryIds = CategoryService.getCategories().map(c => c.id).sort();

describe('STORE_LAYOUT_PRESETS', () => {
  // A preset that omits a category hides its items from the list entirely,
  // so every preset must name all of them exactly once.
  it.each(STORE_LAYOUT_PRESETS)('"$token" is a permutation of every category', ({ categoryOrder }) => {
    expect([...categoryOrder].sort()).toEqual(allCategoryIds);
  });

  it('has no duplicate tokens', () => {
    const tokens = STORE_LAYOUT_PRESETS.map(p => p.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('uses lowercase tokens so substring matching works', () => {
    STORE_LAYOUT_PRESETS.forEach(p => expect(p.token).toBe(p.token.toLowerCase()));
  });
});

describe('getPresetCategoryOrder', () => {
  const tescoOrder = STORE_LAYOUT_PRESETS.find(p => p.token === 'tesco')!.categoryOrder;

  it.each([
    'Tesco',
    'tesco',
    'TESCO',
    'Tesco Extra',
    'Tesco Express Watford',
    '  Tesco Metro',
  ])('matches %p', storeName => {
    expect(getPresetCategoryOrder(storeName)).toEqual(tescoOrder);
  });

  it.each(['Aldi', 'Lidl', 'Sainsburys', 'corner shop', ''])('returns null for %p', storeName => {
    expect(getPresetCategoryOrder(storeName)).toBeNull();
  });

  it.each([null, undefined])('returns null for %p', storeName => {
    expect(getPresetCategoryOrder(storeName)).toBeNull();
  });

  it('returns a copy so callers cannot mutate the table', () => {
    const first = getPresetCategoryOrder('Tesco')!;
    first.reverse();
    expect(getPresetCategoryOrder('Tesco')).toEqual(tescoOrder);
  });
});

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

  it('fills an empty order with every category', () => {
    expect([...completeCategoryOrder([])].sort()).toEqual(allCategoryIds);
  });

  it('does not drop duplicates already present in the order', () => {
    const withDupe: CategoryType[] = ['Produce', 'Produce'];
    const result = completeCategoryOrder(withDupe);
    expect(result.filter(c => c === 'Produce')).toHaveLength(2);
  });
});

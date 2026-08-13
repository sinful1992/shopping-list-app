import CategoryService from '../CategoryService';

const LEGACY_IDS = ['Produce', 'Pantry', 'Beverages', 'Household'];

describe('CategoryService', () => {
  it('has unique ids', () => {
    const ids = CategoryService.getCategories().map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // CategoryHistoryService writes /familyGroups/<g>/categoryHistory/<item>/<category>,
  // using the category id raw. Firebase rejects . # $ [ ] / in a key, so an id
  // with one in it would throw on a real write and only surface on device.
  it('only uses ids that are legal Firebase RTDB keys', () => {
    for (const { id } of CategoryService.getCategories()) {
      expect(id).not.toMatch(/[.#$[\]/]/);
    }
  });

  it('gives every category a sortOrder of at least 1', () => {
    // getCategorySortOrder falls back on `|| 999`, so a 0 would silently sort last.
    for (const { id, sortOrder } of CategoryService.getCategories()) {
      expect({ id, sortOrder }).toEqual({ id, sortOrder: expect.any(Number) });
      expect(sortOrder).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps Other last, since it is the bucket with no shelf', () => {
    const ids = CategoryService.getCategories().map(c => c.id);
    expect(ids[ids.length - 1]).toBe('Other');
  });

  describe('retired categories', () => {
    it('still resolves them, so existing items keep their icon and colour', () => {
      for (const id of LEGACY_IDS) {
        expect(CategoryService.getCategory(id)).not.toBeNull();
      }
    });

    // completeCategoryOrder derives from getCategories(). Dropping a legacy id
    // here would leave items carrying it rendering nowhere at all.
    it('keeps them in getCategories()', () => {
      const ids = CategoryService.getCategories().map(c => c.id);
      for (const id of LEGACY_IDS) {
        expect(ids).toContain(id);
      }
    });

    it('excludes exactly those from the picker', () => {
      const pickerIds = CategoryService.getPickerCategories().map(c => c.id);
      const allIds = CategoryService.getCategories().map(c => c.id);
      expect(allIds.filter(id => !pickerIds.includes(id)).sort()).toEqual([...LEGACY_IDS].sort());
    });

    it('offers the categories that replaced them', () => {
      const pickerIds = CategoryService.getPickerCategories().map(c => c.id);
      expect(pickerIds).toEqual(expect.arrayContaining([
        'Fruit', 'Vegetables', 'Salad & Herbs',
        'Tins & Packets', 'Pasta & Rice', 'Cereals',
        'Soft Drinks', 'Tea & Coffee', 'Alcohol',
        'Cleaning', 'Kitchen & Paper',
      ]));
    });
  });

  it('assigns every category to a picker group', () => {
    for (const { id, group } of CategoryService.getCategories()) {
      expect({ id, group: Boolean(group) }).toEqual({ id, group: true });
    }
  });

  it('groups categories contiguously, so the picker needs one heading each', () => {
    const groups = CategoryService.getCategories().map(c => c.group);
    const firstSeen = groups.filter((g, i) => groups.indexOf(g) === i);
    // Rebuilding the sequence from each group's first appearance must reproduce
    // it exactly — otherwise a group is split across the list.
    expect(groups).toEqual(firstSeen.flatMap(g => groups.filter(x => x === g)));
  });

  it('returns unknown categories as null rather than throwing', () => {
    expect(CategoryService.getCategory('Baking')).toBeNull();
    expect(CategoryService.getCategory(null)).toBeNull();
    expect(CategoryService.getCategory(undefined)).toBeNull();
    expect(CategoryService.getCategoryName('Baking')).toBe('Other');
  });
});

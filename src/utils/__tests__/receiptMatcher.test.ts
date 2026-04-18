import type { Item, ReceiptLineItem } from '../../models/types';
import { dice, matchReceiptToList, stem } from '../receiptMatcher';

function makeItem(overrides: Partial<Item> & { id: string; name: string }): Item {
  return {
    listId: 'list-1',
    quantity: null,
    price: null,
    checked: true,
    createdBy: 'user-1',
    createdAt: 0,
    updatedAt: 0,
    syncStatus: 'synced',
    ...overrides,
  } as Item;
}

function makeReceiptItem(overrides: Partial<ReceiptLineItem> & { description: string }): ReceiptLineItem {
  return {
    quantity: null,
    unitPrice: null,
    price: 1.0,
    vatCode: null,
    ...overrides,
  };
}

describe('stem', () => {
  test('strips ies → y for length > 4', () => {
    expect(stem('berries')).toBe('berry');
    expect(stem('cherries')).toBe('cherry');
  });

  test('preserves short -ies words', () => {
    expect(stem('ties')).toBe('ties');
  });

  test('strips es for length > 3', () => {
    expect(stem('potatoes')).toBe('potato');
    expect(stem('tomatoes')).toBe('tomato');
  });

  test('strips trailing s for length > 3, not ss', () => {
    expect(stem('beans')).toBe('bean');
    expect(stem('apples')).toBe('apple');
  });

  test('preserves short words', () => {
    expect(stem('bus')).toBe('bus');
  });

  test('preserves -ss words', () => {
    expect(stem('address')).toBe('address');
    expect(stem('bass')).toBe('bass');
  });
});

describe('dice', () => {
  test('identical strings → 1', () => {
    expect(dice('coffee', 'coffee')).toBe(1);
  });

  test('completely disjoint strings → 0', () => {
    expect(dice('abcd', 'wxyz')).toBe(0);
  });

  test('typo similarity is non-trivial', () => {
    expect(dice('cheddar', 'cheddr')).toBeGreaterThan(0.6);
  });

  test('night/nacht ≈ 0.25', () => {
    const score = dice('night', 'nacht');
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.35);
  });

  test('empty / single-char inputs', () => {
    expect(dice('', '')).toBe(0);
    expect(dice('a', 'a')).toBe(1);
    expect(dice('a', 'b')).toBe(0);
  });
});

describe('matchReceiptToList', () => {
  test('exact single-token match scores 1.0 via token', () => {
    const list = [makeItem({ id: '1', name: 'coffee' })];
    const receipt = [makeReceiptItem({ description: 'Illy Classico Coffee Beans', price: 4.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(1);
    expect(result.matches[0].method).toBe('token');
  });

  test('multi-token superset (all list tokens in receipt) scores 1.0', () => {
    const list = [makeItem({ id: '1', name: 'chicken breast' })];
    const receipt = [makeReceiptItem({ description: 'Tesco British Chicken Breast 500g', price: 3.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(1);
    expect(result.matches[0].method).toBe('token');
  });

  test('multi-token list vs single-token receipt matches via overlap (regression for original 0.6×ratio bug)', () => {
    const list = [makeItem({ id: '1', name: 'chicken breast' })];
    const receipt = [makeReceiptItem({ description: 'chicken', price: 2.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(1);
    expect(result.matches[0].method).toBe('token');
  });

  test('plural stemming: potatoes → potato', () => {
    const list = [makeItem({ id: '1', name: 'potatoes' })];
    const receipt = [makeReceiptItem({ description: 'Big Potato 2kg', price: 1.99 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].method).toBe('token');
  });

  test('Dice fallback catches OCR typo', () => {
    const list = [makeItem({ id: '1', name: 'cheddar' })];
    const receipt = [makeReceiptItem({ description: 'Cathedral City Mature Cheddr 350g', price: 2.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].method).toBe('dice');
    expect(result.matches[0].score).toBeGreaterThanOrEqual(0.55);
  });

  test('below-threshold pair is rejected', () => {
    const list = [makeItem({ id: '1', name: 'bananas' })];
    const receipt = [makeReceiptItem({ description: 'Organic Kale 200g', price: 1.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedList).toHaveLength(1);
    expect(result.unmatchedReceipt).toHaveLength(1);
  });

  test('greedy contention: two list items competing for one receipt line', () => {
    const list = [
      makeItem({ id: '1', name: 'milk' }),
      makeItem({ id: '2', name: 'whole milk' }),
    ];
    const receipt = [makeReceiptItem({ description: 'Tesco Whole Milk 2L', price: 1.85 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].listItem.id).toBe('2');
    expect(result.unmatchedList).toHaveLength(1);
    expect(result.unmatchedList[0].id).toBe('1');
  });

  test('noise-word stripping: tesco and 2kg do not produce false matches', () => {
    const list = [makeItem({ id: '1', name: 'tesco' })];
    const receipt = [makeReceiptItem({ description: 'Tesco British Chicken Breast 500g', price: 3.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(0);
  });

  test('pure-number tokens stripped from receipt', () => {
    const list = [makeItem({ id: '1', name: 'bread' })];
    const receipt = [makeReceiptItem({ description: '500 bread', price: 1.2 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBe(1);
  });

  test('receipt line with null price excluded from matching', () => {
    const list = [makeItem({ id: '1', name: 'coffee' })];
    const receipt = [
      makeReceiptItem({ description: 'Illy Coffee Beans', price: null }),
      makeReceiptItem({ description: 'Random Item', price: 2.0 }),
    ];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedReceipt).toHaveLength(1);
    expect(result.unmatchedReceipt[0].item.description).toBe('Random Item');
  });

  test('receipt line with empty description excluded', () => {
    const list = [makeItem({ id: '1', name: 'coffee' })];
    const receipt = [makeReceiptItem({ description: '   ', price: 2.0 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedReceipt).toHaveLength(0);
  });

  test('empty inputs both sides → empty result', () => {
    const result = matchReceiptToList([], []);
    expect(result.matches).toEqual([]);
    expect(result.unmatchedReceipt).toEqual([]);
    expect(result.unmatchedList).toEqual([]);
  });

  test('partial token match with near-match variant scores high ("chocolate" vs "chocolat")', () => {
    const list = [makeItem({ id: '1', name: 'pains au chocolate' })];
    const receipt = [makeReceiptItem({ description: 'Pains au Chocolat', price: 1.5 })];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].score).toBeGreaterThan(0.9);
    expect(result.matches[0].method).toBe('token');
  });

  test('receiptIndex preserved as original input index', () => {
    const list = [makeItem({ id: '1', name: 'coffee' })];
    const receipt = [
      makeReceiptItem({ description: 'milk', price: 1 }),
      makeReceiptItem({ description: 'coffee', price: 4 }),
      makeReceiptItem({ description: 'sugar', price: 2 }),
    ];
    const result = matchReceiptToList(receipt, list);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].receiptIndex).toBe(1);
  });
});

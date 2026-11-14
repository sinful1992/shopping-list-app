import type { Item, ReceiptLineItem } from '../../models/types';
import { dice, matchReceiptToList, receiptAliasKey, stem, unitPriceFromLines, unitsFromLines, withLineEdit } from '../receiptMatcher';

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

describe('unitPriceFromLines', () => {
  test('no lines → null', () => {
    expect(unitPriceFromLines([], 1)).toBeNull();
  });

  test('one line, one unit → the line price', () => {
    expect(unitPriceFromLines([makeReceiptItem({ description: 'milk', price: 1.25 })], 1)).toBe(1.25);
  });

  test('one line, one unit, no line price → unit price', () => {
    expect(unitPriceFromLines([makeReceiptItem({ description: 'milk', price: null, unitPrice: 0.9 })], 1)).toBe(0.9);
  });

  test('one line, several units → the printed unit price wins', () => {
    const line = makeReceiptItem({ description: 'yoghurt', price: 3, unitPrice: 0.75, quantity: 4 });
    expect(unitPriceFromLines([line], 4)).toBe(0.75);
  });

  test('one line, several units, no unit price → line price over the line quantity', () => {
    const line = makeReceiptItem({ description: 'yoghurt', price: 3, quantity: 4 });
    expect(unitPriceFromLines([line], 2)).toBe(0.75);
  });

  test('one line, several units, no quantity read → line price over the item units', () => {
    const line = makeReceiptItem({ description: 'yoghurt', price: 3 });
    expect(unitPriceFromLines([line], 3)).toBe(1);
  });

  test('one line counting several units → per unit, whatever the item counts', () => {
    const line = makeReceiptItem({ description: '2 x milk', price: 3.1, quantity: 2 });
    expect(unitPriceFromLines([line], 1)).toBeCloseTo(1.55);
  });

  test('one weighed line → the line price, not the price per kg', () => {
    const line = makeReceiptItem({ description: 'bananas', price: 0.5, unitPrice: 1.1, quantity: 0.456 });
    expect(unitPriceFromLines([line], 1)).toBe(0.5);
    expect(unitPriceFromLines([line], 2)).toBe(0.25);
  });

  test('several lines are spread over the units the receipt shows, not the item count', () => {
    const lines = [
      makeReceiptItem({ description: 'semi skmd mlk', price: 1.65 }),
      makeReceiptItem({ description: 'full ft milk', price: 1.45 }),
    ];
    expect(unitPriceFromLines(lines, 1)).toBeCloseTo(1.55);
    expect(unitPriceFromLines(lines, 3)).toBeCloseTo(1.55);
  });

  test('several lines, one with only a unit price and quantity', () => {
    const lines = [
      makeReceiptItem({ description: 'milk', price: 1 }),
      makeReceiptItem({ description: 'milk', price: null, unitPrice: 0.5, quantity: 2 }),
    ];
    expect(unitPriceFromLines(lines, 1)).toBeCloseTo(2 / 3);
  });

  test('several lines, one without any price → null', () => {
    const lines = [
      makeReceiptItem({ description: 'milk', price: 1 }),
      makeReceiptItem({ description: 'milk', price: null }),
    ];
    expect(unitPriceFromLines(lines, 1)).toBeNull();
  });
});

describe('unitsFromLines', () => {
  test('one line with no count printed → unknown', () => {
    expect(unitsFromLines([makeReceiptItem({ description: 'milk' })])).toBeNull();
  });

  test('one line with a count → that count; a weight → one unit', () => {
    expect(unitsFromLines([makeReceiptItem({ description: 'milk', quantity: 2 })])).toBe(2);
    expect(unitsFromLines([makeReceiptItem({ description: 'bananas', quantity: 0.456 })])).toBe(1);
  });

  test('several lines → each line count, one unit where none is printed', () => {
    expect(unitsFromLines([
      makeReceiptItem({ description: 'milk' }),
      makeReceiptItem({ description: 'milk', quantity: 2 }),
      makeReceiptItem({ description: 'bananas', quantity: 0.456 }),
    ])).toBe(4);
  });
});

describe('matchReceiptToList with remembered receipt text', () => {
  test('a remembered line goes to its item even with no token in common', () => {
    const list = [makeItem({ id: '1', name: 'Milk' }), makeItem({ id: '2', name: 'Bread' })];
    const receipt = [makeReceiptItem({ description: 'SEMI SKM  2.272L', price: 1.45 })];
    const aliases = new Map([[receiptAliasKey('semi skm 2.272l'), 'milk']]);
    const result = matchReceiptToList(receipt, list, aliases);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].listItem.id).toBe('1');
    expect(result.matches[0].method).toBe('alias');
    expect(result.matches[0].score).toBe(1);
  });

  test('a remembered name matches singular and plural spellings', () => {
    const list = [makeItem({ id: '1', name: 'Bananas' })];
    const receipt = [makeReceiptItem({ description: 'LOOSE BNN', price: 0.8 })];
    const result = matchReceiptToList(receipt, list, new Map([['loose bnn', 'banana']]));
    expect(result.matches[0]?.listItem.id).toBe('1');
  });

  test('two remembered lines can both go to one item', () => {
    const list = [makeItem({ id: '1', name: 'Milk' })];
    const receipt = [
      makeReceiptItem({ description: 'SEMI SKM', price: 1.1 }),
      makeReceiptItem({ description: 'SEMI SKM', price: 1.1 }),
    ];
    const result = matchReceiptToList(receipt, list, new Map([['semi skm', 'Milk']]));
    expect(result.matches.map(m => m.receiptIndex)).toEqual([0, 1]);
    expect(result.unmatchedReceipt).toEqual([]);
  });

  test('an alias to an item not on the list falls through to fuzzy matching', () => {
    const list = [makeItem({ id: '1', name: 'coffee' })];
    const receipt = [makeReceiptItem({ description: 'Coffee beans', price: 4 })];
    const result = matchReceiptToList(receipt, list, new Map([['coffee beans', 'Tea']]));
    expect(result.matches[0].method).toBe('token');
  });

  test('an item taken by an alias is not also given to a fuzzy line', () => {
    const list = [makeItem({ id: '1', name: 'milk' })];
    const receipt = [
      makeReceiptItem({ description: 'SEMI SKM', price: 1.1 }),
      makeReceiptItem({ description: 'Milk chocolate', price: 2 }),
    ];
    const result = matchReceiptToList(receipt, list, new Map([['semi skm', 'milk']]));
    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedReceipt.map(e => e.index)).toEqual([1]);
  });
});

describe('matchReceiptToList with coupon lines', () => {
  it('never matches a negative line, which would record a negative price', () => {
    const result = matchReceiptToList(
      [
        makeReceiptItem({ description: 'BERTOLLI 1KG', price: 3.79 }),
        makeReceiptItem({ description: 'IRC BERTOLLI 1KG', price: -1.0 }),
      ],
      [makeItem({ id: 'a', name: 'Bertolli' })],
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].receiptItem.price).toBe(3.79);
  });
});

describe('withLineEdit', () => {
  const corrected: ReceiptLineItem = {
    description: 'EGGS', price: 3.3, quantity: 1, needsReview: true, needsCheck: true, correctedFrom: 8.3,
  } as ReceiptLineItem;

  it('a typed price is no longer the one the sum check fixed', () => {
    expect(withLineEdit(corrected, { price: 3.5 })).toMatchObject({
      price: 3.5, correctedFrom: null, needsCheck: false, needsReview: false,
    });
  });

  it('a typed name keeps the note about the fixed price', () => {
    expect(withLineEdit(corrected, { description: 'Eggs x6' })).toMatchObject({
      description: 'Eggs x6', price: 3.3, correctedFrom: 8.3,
    });
  });
});

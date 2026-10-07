import type { Item, ReceiptLineItem } from '../../models/types';
import {
  discountsByLine, formatLineQty, groupLinesByItem, netLines, newItemFromLine, planItemUpdates, ReceiptLinks,
} from '../receiptLinks';

// The Tesco receipt from task 27 (USER #1706), as the OCR server reads it:
// every line carries quantity 1 except the two counted lines.
const tescoLines: ReceiptLineItem[] = [
  { description: 'Tesco Semi Skimmed Milk 2.272L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
  { description: 'Tesco Salami Slices 12 Pack 100g', quantity: 2, unitPrice: 1.1, price: 2.2, vatCode: null },
  { description: 'Tesco Diced Chorizo 130g', quantity: 2, unitPrice: 2.55, price: 5.1, vatCode: null },
  { description: 'Tesco Medium Free Range Eggs 6', quantity: 1, unitPrice: 1.89, price: 1.89, vatCode: null },
];
const SALAMI = 1;
const CHORIZO = 2;
const MILK = 0;

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    listId: 'list-1',
    name: overrides.id,
    quantity: null,
    price: null,
    checked: false,
    createdBy: 'user-1',
    createdAt: 0,
    updatedAt: 0,
    syncStatus: 'synced',
    ...overrides,
  } as Item;
}

const link = (listItemId: string, ignored = false) =>
  ({ listItemId, method: 'manual' as const, score: 1, ignored });

function apply(links: ReceiptLinks, items: Item[], lines = tescoLines) {
  const updates = planItemUpdates(groupLinesByItem(links), lines, new Map(items.map(i => [i.id, i])));
  return new Map(updates.map(u => [u.id, u.updates]));
}

describe('formatLineQty', () => {
  test.each([
    [2, '2 ×'],
    [3, '3 ×'],
    [12, '12 ×'],
  ])('a counted line of %p shows %p', (quantity, expected) => {
    expect(formatLineQty({ quantity })).toBe(expected);
  });

  test('uses the multiplication sign U+00D7 after one space', () => {
    expect(formatLineQty({ quantity: 2 })).toBe('2 ×');
    expect(formatLineQty({ quantity: 2 })).not.toMatch(/x/i);
  });

  test.each([1, null, undefined, 0, -2, 0.456, 1.5, 2.5, NaN, Infinity, -Infinity])(
    'shows nothing for quantity %p',
    quantity => {
      expect(formatLineQty({ quantity: quantity as number | null })).toBeNull();
    },
  );

  test('a float that is a whole number (2.0 from JSON) still counts', () => {
    expect(formatLineQty({ quantity: 2.0 })).toBe('2 ×');
  });

  test('on the Tesco receipt only salami and chorizo show a count', () => {
    expect(tescoLines.map(l => formatLineQty(l))).toEqual([null, '2 ×', '2 ×', null]);
  });
});

describe('Apply on the Tesco receipt: new items', () => {
  test('salami and chorizo become items with unitQty 2 at the per-unit price', () => {
    expect(newItemFromLine(tescoLines[SALAMI])).toEqual({ unitQty: 2, price: 1.1 });
    expect(newItemFromLine(tescoLines[CHORIZO])).toEqual({ unitQty: 2, price: 2.55 });
  });

  test('a line with quantity 1 leaves the new item without a count', () => {
    expect(newItemFromLine(tescoLines[MILK])).toEqual({ unitQty: null, price: 1.65 });
  });

  test('a counted line with no unit price splits the total over the count', () => {
    const noUnit = { ...tescoLines[CHORIZO], unitPrice: null };
    expect(newItemFromLine(noUnit)).toEqual({ unitQty: 2, price: 2.55 });
  });
});

describe('Apply on the Tesco receipt: linked items', () => {
  test.each([
    ['no count', undefined],
    ['null count', null],
    ['count 1', 1],
  ])('a linked item with %s takes unitQty 2 and the per-unit price', (_label, unitQty) => {
    const salami = makeItem({ id: 'salami', unitQty: unitQty as number | undefined });
    const chorizo = makeItem({ id: 'chorizo', unitQty: unitQty as number | undefined });
    const u = apply({ [SALAMI]: link('salami'), [CHORIZO]: link('chorizo') }, [salami, chorizo]);
    expect(u.get('salami')).toEqual({ price: 1.1, unitQty: 2, checked: true });
    expect(u.get('chorizo')).toEqual({ price: 2.55, unitQty: 2, checked: true });
  });

  // Current behaviour, written down (contract done item 2): a count the user
  // typed is kept, and the price is still per unit from the receipt.
  test('a linked item that already has a count above 1 keeps it', () => {
    const u = apply({ [SALAMI]: link('salami') }, [makeItem({ id: 'salami', unitQty: 3 })]);
    expect(u.get('salami')).toEqual({ price: 1.1, checked: true });
  });

  test('a linked item that already has count 2 is only priced and checked', () => {
    const u = apply({ [SALAMI]: link('salami') }, [makeItem({ id: 'salami', unitQty: 2 })]);
    expect(u.get('salami')).toEqual({ price: 1.1, checked: true });
  });

  test('an already applied item (count 2, price, checked) is not rewritten', () => {
    const done = makeItem({ id: 'salami', unitQty: 2, price: 1.1, checked: true });
    expect(apply({ [SALAMI]: link('salami') }, [done]).has('salami')).toBe(false);
  });

  test('an ignored link does not touch the item', () => {
    const u = apply({ [SALAMI]: link('salami', true) }, [makeItem({ id: 'salami' })]);
    expect(u.has('salami')).toBe(false);
  });

  test('a line with quantity 1 does not set a count', () => {
    const u = apply({ [MILK]: link('milk') }, [makeItem({ id: 'milk' })]);
    expect(u.get('milk')).toEqual({ price: 1.65, checked: true });
  });

  test('two counted lines on one item add up their counts', () => {
    const u = apply({ [SALAMI]: link('meat'), [CHORIZO]: link('meat') }, [makeItem({ id: 'meat' })]);
    expect(u.get('meat')?.unitQty).toBe(4);
    expect(u.get('meat')?.price).toBe(1.83); // 7.30 over 4 units, rounded to pennies
  });

  test('a counted line plus a single line counts 3', () => {
    const u = apply({ [MILK]: link('x'), [SALAMI]: link('x') }, [makeItem({ id: 'x' })]);
    expect(u.get('x')?.unitQty).toBe(3);
  });

  test('a saving on a counted line keeps the count and nets the per-unit price', () => {
    const net = netLines(tescoLines, discountsByLine(tescoLines, [
      { description: tescoLines[CHORIZO].description, amount: -1.1, lineIndex: CHORIZO },
    ] as never));
    const u = apply({ [CHORIZO]: link('chorizo') }, [makeItem({ id: 'chorizo' })], net);
    expect(u.get('chorizo')).toEqual({ price: 2, unitQty: 2, checked: true });
  });
});

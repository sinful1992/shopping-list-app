import { stripRetailer } from '../stripRetailer';

describe('stripRetailer', () => {
  // Own-brand lines as printed on real receipts (receipt-ocr eval corpus).
  test.each([
    ['Tesco British Whole Milk 2.272l, 4 Pints', 'British Whole Milk 2.272l, 4 Pints'],
    ['Tesco Large Free Range Eggs 12 Pack', 'Large Free Range Eggs 12 Pack'],
    ['Tesco 20 Compostable Caddy Liners Tie Top 10l', '20 Compostable Caddy Liners Tie Top 10l'],
    ['Tesco Chicken & Bacon Pasta 300g', 'Chicken & Bacon Pasta 300g'],
    ['Tesco Extra Large Whole Chicken 2.1-2.6kg', 'Extra Large Whole Chicken 2.1-2.6kg'],
    ['CP FRSH PST MILK', 'FRSH PST MILK'],
    ['CP RED ONIONS', 'RED ONIONS'],
    ['Cp F Grl Chic M', 'F Grl Chic M'],
  ])('corpus line %p → %p', (line, expected) => {
    expect(stripRetailer(line)).toBe(expected);
  });

  test.each([
    ["Sainsbury's British Whole Milk", 'British Whole Milk'],
    ['Sainsbury’s Wholemeal Bread', 'Wholemeal Bread'],
    ['SAINSBURYS SEMI SKIMMED MILK', 'SEMI SKIMMED MILK'],
    ['JS Wholemeal Bread', 'Wholemeal Bread'],
    ['Co-op Free Range Eggs', 'Free Range Eggs'],
    ['Coop Free Range Eggs', 'Free Range Eggs'],
    ['Co-operative Bread', 'Bread'],
    ['M&S Percy Pig', 'Percy Pig'],
    ['M & S Percy Pig', 'Percy Pig'],
    ['Marks & Spencer Percy Pig', 'Percy Pig'],
    ['Essential Waitrose Milk', 'Milk'],
    ['Waitrose Milk', 'Milk'],
    ["Tesco's Milk", 'Milk'],
    ['TESCO - MILK', 'MILK'],
    ['Asda Milk', 'Milk'],
    ['Aldi Milk', 'Milk'],
    ['Lidl Milk', 'Milk'],
    ['Morrisons Milk', 'Milk'],
    ['One Stop Milk', 'Milk'],
    ['Iceland lettuce', 'lettuce'],
  ])('spelling %p → %p', (line, expected) => {
    expect(stripRetailer(line)).toBe(expected);
  });

  test('a possessive goes with any store name', () => {
    expect(stripRetailer("Aldi's Milk")).toBe('Milk');
    expect(stripRetailer('Asda’s bread')).toBe('bread');
    expect(stripRetailer("Lidl's eggs")).toBe('eggs');
    expect(stripRetailer("M&S's Percy Pig")).toBe('Percy Pig');
    expect(stripRetailer("Aldi's")).toBe("Aldi's");
  });

  test('a name that is only a store is kept', () => {
    expect(stripRetailer('Tesco')).toBe('Tesco');
    expect(stripRetailer('  Iceland ')).toBe('Iceland');
    expect(stripRetailer("Sainsbury's")).toBe("Sainsbury's");
  });

  test('only a leading whole word is removed', () => {
    expect(stripRetailer('Milk Tesco')).toBe('Milk Tesco');
    expect(stripRetailer('Spartan Oats')).toBe('Spartan Oats');
    expect(stripRetailer('Cpap Filter')).toBe('Cpap Filter');
    expect(stripRetailer('Jsx Bar')).toBe('Jsx Bar');
    expect(stripRetailer('Aldington Ham')).toBe('Aldington Ham');
    expect(stripRetailer('Cooper Ale')).toBe('Cooper Ale');
  });

  test('only one store prefix is removed', () => {
    expect(stripRetailer('Tesco Tesco Milk')).toBe('Tesco Milk');
  });

  test('tier words, units and digits stay', () => {
    expect(stripRetailer('Tesco Finest Milk 2l')).toBe('Finest Milk 2l');
    expect(stripRetailer("Sainsbury's Taste the Difference Ham")).toBe('Taste the Difference Ham');
    expect(stripRetailer('Tesco 6 Eggs')).toBe('6 Eggs');
  });

  test('names without a store are only trimmed', () => {
    expect(stripRetailer('  Whole Milk ')).toBe('Whole Milk');
    expect(stripRetailer('')).toBe('');
  });
});

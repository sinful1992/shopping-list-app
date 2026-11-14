import { itemGroupKey } from '../itemGrouping';

describe('itemGroupKey', () => {
  const groups = (a: string, b: string) => itemGroupKey(a) === itemGroupKey(b);

  test('singular and plural share a key', () => {
    expect(groups('avocado', 'avocados')).toBe(true);
    expect(groups('banana', 'bananas')).toBe(true);
  });

  test('-oes and -ies plurals share a key', () => {
    expect(groups('potato', 'potatoes')).toBe(true);
    expect(groups('berry', 'berries')).toBe(true);
  });

  test('case and surrounding whitespace are ignored', () => {
    expect(groups('  Avocados ', 'avocado')).toBe(true);
  });

  test('multi-word names group per token', () => {
    expect(groups('spring onion', 'spring onions')).toBe(true);
    expect(groups('red apples', 'green apples')).toBe(false);
  });

  test('-ss words are not stemmed, so glass and glasses stay apart', () => {
    expect(itemGroupKey('glass')).toBe('glass');
    expect(groups('glass', 'glasses')).toBe(false);
  });

  test('unrelated items keep distinct keys', () => {
    expect(groups('milk', 'bread')).toBe(false);
    expect(groups('bread', 'brown bread')).toBe(false);
  });

  test('is idempotent, so a key can be re-keyed safely', () => {
    for (const name of ['avocados', 'potatoes', 'berries', 'hummus', 'milk']) {
      expect(itemGroupKey(itemGroupKey(name))).toBe(itemGroupKey(name));
    }
  });
});

describe('itemGroupKey without the store name', () => {
  const groups = (a: string, b: string) => itemGroupKey(a) === itemGroupKey(b);

  test('the same product from two shops shares a key', () => {
    expect(groups('Tesco British Whole Milk', "Sainsbury's British Whole Milk")).toBe(true);
    expect(groups('tesco british whole milk', 'british whole milk')).toBe(true);
    expect(groups('Co-op Free Range Eggs', 'free range eggs')).toBe(true);
    expect(groups('CP RED ONIONS', 'red onion')).toBe(true);
  });

  test('pack sizes still keep items apart', () => {
    expect(groups('eggs 6', 'eggs 12')).toBe(false);
    expect(groups('Tesco Eggs 6', "Sainsbury's Eggs 12")).toBe(false);
  });

  test('a store name alone keeps its own key', () => {
    expect(itemGroupKey('Tesco')).toBe('tesco');
    expect(groups('Tesco', 'Asda')).toBe(false);
  });

  test('stays idempotent with store names', () => {
    for (const name of ["Sainsbury's Milk", 'Co-op Eggs', 'M&S Percy Pig', 'Tesco']) {
      expect(itemGroupKey(itemGroupKey(name))).toBe(itemGroupKey(name));
    }
  });
});

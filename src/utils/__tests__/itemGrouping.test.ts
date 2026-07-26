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

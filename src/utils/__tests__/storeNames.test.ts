import { detectStoreSlug, resolveReceiptStoreName } from '../storeNames';

describe('detectStoreSlug', () => {
  test('finds the retailer inside a till header', () => {
    expect(detectStoreSlug('TESCO STORES 3452')).toBe('tesco');
    expect(detectStoreSlug("Sainsbury's Local")).toBe('sainsburys');
    expect(detectStoreSlug('The Co-operative Food')).toBe('coop');
  });

  test('an unknown merchant is other, none is null', () => {
    expect(detectStoreSlug('Corner Shop Ltd')).toBe('other');
    expect(detectStoreSlug(null)).toBeNull();
  });
});

describe('resolveReceiptStoreName', () => {
  test('a known retailer takes the spelling the user already uses', () => {
    expect(resolveReceiptStoreName('tesco', 'TESCO STORES 3452', ['Lidl', 'Tesco Extra'])).toBe('Tesco Extra');
  });

  test('a typed store only counts when it names the retailer as a word', () => {
    expect(resolveReceiptStoreName('spar', 'SPAR', ['Sparrows Farm Shop'])).toBe('Spar');
    expect(resolveReceiptStoreName('spar', 'SPAR', ['Sparrows Farm Shop', 'Spar Kings Rd'])).toBe('Spar Kings Rd');
    expect(resolveReceiptStoreName('sainsburys', 'SAINSBURYS', ['Sainsburys'])).toBe('Sainsburys');
    expect(resolveReceiptStoreName('tesco', 'TESCO', ["Tesco's"])).toBe("Tesco's");
    expect(resolveReceiptStoreName('coop', 'CO-OP', ['The Co-operative'])).toBe('The Co-operative');
    expect(resolveReceiptStoreName('mands', 'M&S', ['M&S Food'])).toBe('M&S Food');
  });

  test('a known retailer with no history gets its canonical name, never the raw till text', () => {
    expect(resolveReceiptStoreName('tesco', 'TESCO STORES 3452', [])).toBe('Tesco');
    expect(resolveReceiptStoreName('sainsburys', 'SAINSBURYS SUPERMARKETS LTD', [])).toBe("Sainsbury's");
  });

  test('an unknown merchant is used only when the user already entered it', () => {
    expect(resolveReceiptStoreName('other', 'Corner Shop', ['corner shop'])).toBe('corner shop');
    expect(resolveReceiptStoreName('other', 'Corner Shop', ['Lidl'])).toBeNull();
    expect(resolveReceiptStoreName(null, null, ['Lidl'])).toBeNull();
  });
});

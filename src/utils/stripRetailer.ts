// Leading retailer words tills print on own-brand lines ("Tesco British Whole
// Milk", Co-op's "CP STNBK MEAT FE"). Longer phrases come first so "Essential
// Waitrose" is removed whole, not left as "Essential".
const RETAILER_PREFIX = new RegExp(
  '^\\s*(?:' +
    [
      'essential\\s+waitrose',
      'marks\\s*(?:&|and)\\s*spencer',
      'm\\s*&\\s*s',
      'sainsbury[\'’]?s?',
      'tesco[\'’]?s?',
      'co-operative',
      'co[\\s-]?op',
      'one\\s+stop',
      'asda', 'aldi', 'lidl', 'morrisons', 'morr', 'waitrose', 'iceland',
      'spar', 'nisa', 'costco', 'booths', 'budgens', 'londis',
      'js', 'cp',
    ].join('|') +
    ')(?![a-z0-9&\\u00C0-\\u024F])[\\s\\-–:,.]*',
  'i',
);

/**
 * An item name without the store it was bought at, so the same product read
 * off two shops' receipts is one item for price comparison. Only a leading
 * whole word goes ("Milk Tesco" and "Spartan" are left alone), units and
 * digits are kept, and a name that is only a store name is returned as is.
 */
export function stripRetailer(name: string): string {
  const trimmed = name.trim();
  const rest = trimmed.replace(RETAILER_PREFIX, '');
  return rest.length > 0 ? rest : trimmed;
}

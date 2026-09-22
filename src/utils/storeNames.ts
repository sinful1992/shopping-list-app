import type { ReceiptStoreSlug } from '../models/types';

// Uppercase substring → canonical slug, mirroring the retailer set the OCR
// server recognises (_KNOWN_RETAILERS in receipt-ocr/ocr/parser.py). Ordered:
// multi-word / apostrophe variants before shorter substrings they contain.
const MERCHANT_TO_SLUG: ReadonlyArray<[string, ReceiptStoreSlug]> = [
  ['TESCO', 'tesco'],
  ['ASDA', 'asda'],
  ['ALDI', 'aldi'],
  ['SAINSBURY', 'sainsburys'],
  ['MORRISONS', 'morrisons'],
  ['WAITROSE', 'waitrose'],
  ['COSTCO', 'costco'],
  ['ICELAND', 'iceland'],
  ['ONE STOP', 'onestop'],
  ['BOOTHS', 'booths'],
  ['BUDGENS', 'budgens'],
  ['LONDIS', 'londis'],
  ['LIDL', 'lidl'],
  ['CO-OP', 'coop'],
  ['COOP', 'coop'],
  ['M&S', 'mands'],
  ['MARKS & SPENCER', 'mands'],
  ['SPAR', 'spar'],
  ['NISA', 'nisa'],
];

const STORE_DISPLAY_NAMES: Record<Exclude<ReceiptStoreSlug, 'other'>, string> = {
  tesco: 'Tesco',
  asda: 'Asda',
  aldi: 'Aldi',
  sainsburys: "Sainsbury's",
  morrisons: 'Morrisons',
  waitrose: 'Waitrose',
  costco: 'Costco',
  iceland: 'Iceland',
  spar: 'Spar',
  nisa: 'Nisa',
  booths: 'Booths',
  lidl: 'Lidl',
  coop: 'Co-op',
  mands: 'M&S',
  budgens: 'Budgens',
  londis: 'Londis',
  onestop: 'One Stop',
};

export function detectStoreSlug(merchantName: string | null | undefined): ReceiptStoreSlug | null {
  if (!merchantName) return null;
  const name = merchantName.toUpperCase();
  for (const [needle, slug] of MERCHANT_TO_SLUG) {
    if (name.includes(needle)) return slug;
  }
  return 'other';
}

/**
 * The store name to give a list from its receipt, or null to leave it unset.
 *
 * storeName is a join key — store layouts, the History store filter and the
 * per-store price comparison all group on it — so the raw OCR merchant text
 * ("TESCO STORES 3452") must never land there. A recognised retailer takes
 * the spelling the user already uses for it, else its canonical name. An
 * unrecognised merchant is only used when it matches a name the user has
 * already entered.
 *
 * @param knownStores Store names the user has entered, most used first.
 */
export function resolveReceiptStoreName(
  slug: ReceiptStoreSlug | null,
  merchantName: string | null,
  knownStores: string[],
): string | null {
  if (slug && slug !== 'other') {
    const own = knownStores.find(s => detectStoreSlug(s) === slug);
    return own ?? STORE_DISPLAY_NAMES[slug];
  }
  const merchant = merchantName?.trim().toLowerCase();
  if (!merchant) return null;
  return knownStores.find(s => s.trim().toLowerCase() === merchant) ?? null;
}

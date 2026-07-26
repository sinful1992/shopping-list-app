import { tokenize } from './receiptMatcher';

/**
 * Collapses an item name to a key shared by its singular and plural forms, so
 * price history recorded against "avocado" and "avocados" resolves to one item.
 *
 * The key is a lookup value, not a word — "hummus" keys as "hummu" — so it must
 * never be rendered. Display names always come from a stored itemName.
 */
export function itemGroupKey(name: string): string {
  return tokenize(name).join(' ');
}

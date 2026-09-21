import type { Item, ReceiptLineItem } from '../models/types';
import { sanitizePrice } from './sanitize';
import { unitPriceFromLines } from './receiptMatcher';

/** What one receipt line is linked to. Keyed by the line's printed index. */
export interface ReceiptLink {
  listItemId: string;
  method: 'token' | 'dice' | 'manual';
  score: number;
  ignored: boolean;
}

export type ReceiptLinks = Record<number, ReceiptLink>;

export const priceFromLines = (lines: ReceiptLineItem[], item: Item): number | null =>
  sanitizePrice(unitPriceFromLines(lines, item.unitQty ?? 1));

/**
 * Accepted links grouped by the item they feed, in printed order: one item can
 * be paid for on several lines (the same product rung up twice).
 */
export function groupLinesByItem(links: ReceiptLinks): Map<string, number[]> {
  const map = new Map<string, number[]>();
  Object.keys(links)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach(idx => {
      const link = links[idx];
      if (link.ignored) return;
      const arr = map.get(link.listItemId) ?? [];
      arr.push(idx);
      map.set(link.listItemId, arr);
    });
  return map;
}

/**
 * The item writes that applying these links makes: the price from every line
 * linked to the item, and checked. An item whose price and checked state would
 * not change is left out rather than rewritten with the same values.
 */
export function planItemUpdates(
  linesByItem: Map<string, number[]>,
  lineItems: ReceiptLineItem[],
  itemsById: Map<string, Item>,
): Array<{ id: string; updates: Partial<Item> }> {
  const updates: Array<{ id: string; updates: Partial<Item> }> = [];
  linesByItem.forEach((indices, itemId) => {
    const item = itemsById.get(itemId);
    if (!item) return;
    const price = priceFromLines(indices.map(i => lineItems[i]), item);
    if (price == null) return;
    const patch: Partial<Item> = {};
    if (price !== item.price) patch.price = price;
    if (!item.checked) patch.checked = true;
    if (Object.keys(patch).length > 0) updates.push({ id: itemId, updates: patch });
  });
  return updates;
}

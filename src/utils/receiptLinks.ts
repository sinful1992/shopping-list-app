import type { Item, ReceiptDiscount, ReceiptLineItem } from '../models/types';
import { sanitizePrice } from './sanitize';
import { unitPriceFromLines, unitsFromLines } from './receiptMatcher';

/** What one receipt line is linked to. Keyed by the line's printed index. */
export interface ReceiptLink {
  listItemId: string;
  method: 'token' | 'dice' | 'manual' | 'alias';
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
 * The count an item takes from its receipt lines, or null to leave it: only an
 * item with no count of its own (empty or 1) takes the units the receipt
 * shows, so a count the user typed is kept.
 */
export function unitQtyFromLines(lines: ReceiptLineItem[], item: Item): number | null {
  const units = unitsFromLines(lines);
  return units != null && units > 1 && (item.unitQty ?? 1) <= 1 ? units : null;
}

/**
 * The item writes that applying these links makes: the price from every line
 * linked to the item, its count (unitQtyFromLines), and checked. An item that
 * would not change is left out rather than rewritten with the same values.
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
    const lines = indices.map(i => lineItems[i]);
    const price = priceFromLines(lines, item);
    if (price == null) return;
    const patch: Partial<Item> = {};
    if (price !== item.price) patch.price = price;
    const unitQty = unitQtyFromLines(lines, item);
    if (unitQty != null) patch.unitQty = unitQty;
    if (!item.checked) patch.checked = true;
    if (Object.keys(patch).length > 0) updates.push({ id: itemId, updates: patch });
  });
  return updates;
}

/** A whole count above one, or null: one unit, no count, or a weight. */
const countAboveOne = (q: number | null | undefined): number | null =>
  q != null && Number.isInteger(q) && q > 1 ? q : null;

/**
 * The count printed before a receipt line's description ("2 ×"), or null when
 * the line is one unit, has no count, or is weighed (its weight is already in
 * the description).
 */
export function formatLineQty(line: Pick<ReceiptLineItem, 'quantity'>): string | null {
  const q = countAboveOne(line.quantity);
  return q != null ? `${q} ×` : null;
}

/**
 * How a receipt line becomes a new list item: the units it counted (only a
 * whole count above one — a weight such as 0.456 kg is one unit), and the
 * per-unit price, since Item.price is per unit app-wide.
 */
export function newItemFromLine(line: ReceiptLineItem): { unitQty: number | null; price: number | null } {
  const unitQty = countAboveOne(line.quantity);
  return { unitQty, price: sanitizePrice(unitPriceFromLines([line], unitQty ?? 1)) };
}

/**
 * Total saving per line index. A discount scanned before savings kept their
 * line falls back to the first line printed with the same description; one
 * that matches no line is left out, since there is nothing to net it from.
 */
export function discountsByLine(
  lineItems: ReceiptLineItem[],
  discounts: ReceiptDiscount[] | null | undefined,
): Map<number, number> {
  const byLine = new Map<number, number>();
  for (const d of discounts ?? []) {
    if (!Number.isFinite(d.amount) || d.amount === 0) continue;
    let idx = d.lineIndex ?? null;
    if (idx == null || idx < 0 || idx >= lineItems.length) {
      const found = lineItems.findIndex(l => l.description === d.description);
      idx = found >= 0 ? found : null;
    }
    if (idx == null) continue;
    byLine.set(idx, (byLine.get(idx) ?? 0) + d.amount);
  }
  return byLine;
}

/**
 * Receipt lines with their savings taken off, for pricing items at what was
 * actually paid. A discounted line drops its printed unit price so the unit
 * price is derived from the net total.
 */
export function netLines(lineItems: ReceiptLineItem[], byLine: Map<number, number>): ReceiptLineItem[] {
  return lineItems.map((line, idx) => {
    const saving = byLine.get(idx);
    if (saving == null || line.price == null) return line;
    const net = Math.max(0, Math.round((line.price + saving) * 100) / 100);
    return { ...line, price: net, unitPrice: null };
  });
}

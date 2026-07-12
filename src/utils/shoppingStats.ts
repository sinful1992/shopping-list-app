import { Item } from '../models/types';

export interface ShoppingStats {
  checked: number;
  unchecked: number;
  total: number;
}

/**
 * Compute shopping-mode stats for a list of items.
 *
 * Running total = what's in the trolley: checked items only. Unchecked
 * items must not count, or a leftover unbought item with a predicted
 * price inflates the total past the real receipt (v1.30.2 fix).
 */
export function calculateShoppingStats(
  items: Item[] | null | undefined,
  predictedPrices: { [nameLower: string]: number } | null | undefined
): ShoppingStats {
  if (!items || items.length === 0) {
    return { checked: 0, unchecked: 0, total: 0 };
  }

  // Filter out invalid items
  const validItems = items.filter(item => item && item.id);

  const checked = validItems.filter(item => item.checked).length;
  const unchecked = validItems.length - checked;

  const total = validItems.reduce((sum, item) => {
    if (!item.checked) return sum;
    const itemNameLower = item.name?.toLowerCase();
    const predictedPrice = itemNameLower && predictedPrices ? predictedPrices[itemNameLower] : 0;
    const price = item.price ?? predictedPrice ?? 0;
    const qty = item.unitQty ?? 1;
    return sum + price * qty;
  }, 0);

  return { checked, unchecked, total };
}

import type { Item } from '../models/types';

/**
 * The fields an item not bought takes to the new list on a Partial Shop
 * (list screen and receipt screen). Urgent stays urgent; adding the copy
 * sends no new urgent push.
 */
export function carryOverFields(item: Item): {
  name: string;
  quantity?: string;
  price?: number;
  unitQty: number | null;
  category?: string | null;
  isUrgent: boolean;
} {
  return {
    name: item.name,
    quantity: item.quantity ?? undefined,
    price: item.price ?? undefined,
    unitQty: item.unitQty ?? null,
    category: item.category,
    isUrgent: item.isUrgent === true,
  };
}

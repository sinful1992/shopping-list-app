import LocalStorageManager from './LocalStorageManager';
import PriceHistoryService from './PriceHistoryService';

/**
 * What the OCR server is told about the list a receipt belongs to: the items
 * the family meant to buy and what each cost last time. The server uses it
 * only to break ties between readings the photo already supports, and to
 * flag a price one misread digit away from the last one.
 */
export interface OcrHints {
  store: string | null;
  items: Array<{ name: string; lastPrice: number | null }>;
}

/** Same cap as the server's; it ignores anything past it. */
export const MAX_HINT_ITEMS = 200;

export async function buildOcrHints(listId: string): Promise<OcrHints | null> {
  const list = await LocalStorageManager.getList(listId);
  if (!list) return null;
  const items = (await LocalStorageManager.getItemsForList(listId)).slice(0, MAX_HINT_ITEMS);
  if (items.length === 0) return null;

  const store = list.storeName ?? null;
  const hinted = await Promise.all(items.map(async item => ({
    name: item.name,
    lastPrice: await lastPrice(list.familyGroupId, item.name, store),
  })));
  return { store, items: hinted };
}

/**
 * The most recent price paid for the item, at this store when there is one
 * there. Price history is oldest first.
 */
async function lastPrice(familyGroupId: string, itemName: string, store: string | null): Promise<number | null> {
  try {
    const history = await PriceHistoryService.getPriceHistory(familyGroupId, itemName);
    if (history.length === 0) return null;
    const atStore = store
      ? history.filter(p => p.storeName?.toLowerCase() === store.toLowerCase())
      : [];
    const pool = atStore.length > 0 ? atStore : history;
    return pool[pool.length - 1].price ?? null;
  } catch {
    return null;
  }
}

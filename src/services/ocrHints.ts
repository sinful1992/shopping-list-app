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
/** The server cuts a name here too; cut first so the part stays under the proxy's size cap. */
export const MAX_HINT_NAME = 100;

export async function buildOcrHints(listId: string): Promise<OcrHints | null> {
  const list = await LocalStorageManager.getList(listId);
  if (!list) return null;
  const items = (await LocalStorageManager.getItemsForList(listId)).slice(0, MAX_HINT_ITEMS);
  if (items.length === 0) return null;

  const store = list.storeName ?? null;
  const hinted = await Promise.all(items.map(async item => ({
    name: item.name.slice(0, MAX_HINT_NAME),
    lastPrice: await lastPrice(list.familyGroupId, item.name, store, listId),
  })));
  return { store, items: hinted };
}

/**
 * The most recent price paid for the item on another list, at this store
 * when there is one there. This list's own price may be a misread from an
 * earlier scan of the same receipt. Price history is oldest first.
 */
async function lastPrice(
  familyGroupId: string,
  itemName: string,
  store: string | null,
  listId: string,
): Promise<number | null> {
  try {
    const history = (await PriceHistoryService.getPriceHistory(familyGroupId, itemName))
      .filter(p => p.listId !== listId);
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

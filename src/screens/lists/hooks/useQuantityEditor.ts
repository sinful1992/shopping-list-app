import { useCallback, useRef } from 'react';
import { Item } from '../../../models/types';
import ItemManager from '../../../services/ItemManager';

const QTY_WRITE_DEBOUNCE_MS = 300;

/**
 * useQuantityEditor
 * Owns the optimistic-quantity machinery for rapid +/− taps:
 * - an optimistic map so WatermelonDB observer emissions can't overwrite
 *   quantities the user just tapped (merge via mergeOptimisticQty),
 * - per-item debounced DB writes (setQuantity),
 * - a flush for unmount so pending writes aren't lost.
 */
export function useQuantityEditor() {
  // Optimistic quantity tracking — prevents observer from overwriting rapid tap values
  const optimisticQtyRef = useRef<Map<string, number | null>>(new Map());
  // Per-item debounce timers for quantity writes
  const qtyDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Merge optimistic quantity values into observer-emitted items.
   * Once the DB echoes the optimistic value back, the entry is dropped.
   */
  const mergeOptimisticQty = useCallback((items: Item[]): Item[] => {
    if (optimisticQtyRef.current.size === 0) {
      return items;
    }
    return items.map(item => {
      const optimistic = optimisticQtyRef.current.get(item.id);
      if (optimistic !== undefined) {
        if (item.unitQty === optimistic) {
          optimisticQtyRef.current.delete(item.id);
          return item;
        }
        return { ...item, unitQty: optimistic };
      }
      return item;
    });
  }, []);

  /**
   * Record an optimistic quantity and schedule the debounced DB write.
   */
  const setQuantity = useCallback((itemId: string, targetQty: number | null) => {
    optimisticQtyRef.current.set(itemId, targetQty);
    const existingTimer = qtyDebounceRef.current.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    qtyDebounceRef.current.set(itemId, setTimeout(() => {
      qtyDebounceRef.current.delete(itemId);
      ItemManager.updateItem(itemId, { unitQty: targetQty });
    }, QTY_WRITE_DEBOUNCE_MS));
  }, []);

  /**
   * Flush pending qty writes immediately (call on unmount — don't lose data).
   */
  const flush = useCallback(() => {
    for (const [itemId, timer] of qtyDebounceRef.current.entries()) {
      clearTimeout(timer);
      const targetQty = optimisticQtyRef.current.get(itemId);
      if (targetQty !== undefined) {
        ItemManager.updateItem(itemId, { unitQty: targetQty });
      }
    }
    qtyDebounceRef.current.clear();
  }, []);

  return { mergeOptimisticQty, setQuantity, flush };
}

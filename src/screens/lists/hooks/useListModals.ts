import { useCallback, useState, MutableRefObject } from 'react';
import { Item } from '../../../models/types';
import PriceHistoryService from '../../../services/PriceHistoryService';

/** Which item-editing modal is open; null means all closed. */
export type ActiveListModal =
  | { type: 'price'; item: Item; recentPrices: number[] }
  | { type: 'size'; item: Item }
  | { type: 'details'; item: Item }
  | { type: 'priceHistory'; itemName: string }
  | null;

interface UseListModalsOptions {
  /** Taps are ignored while the list is locked for this user. */
  isListLockedRef: MutableRefObject<boolean>;
  /** Refs, not values — the tap handler must not close over stale list state. */
  listFamilyGroupIdRef: MutableRefObject<string | undefined>;
  listStoreNameRef: MutableRefObject<string | undefined>;
}

/**
 * useListModals
 * Owns the activeModal discriminated union and its open/close handlers,
 * including the price-modal path that prefetches recent prices for the
 * quick-fill chips.
 */
export function useListModals({
  isListLockedRef,
  listFamilyGroupIdRef,
  listStoreNameRef,
}: UseListModalsOptions) {
  const [activeModal, setActiveModal] = useState<ActiveListModal>(null);

  const closeModal = useCallback(() => setActiveModal(null), []);

  const openPriceHistory = useCallback((itemName: string) => {
    setActiveModal({ type: 'priceHistory', itemName });
  }, []);

  const handleItemTap = useCallback((item: Item, focusField: 'name' | 'price' | 'measurement' = 'name') => {
    if (isListLockedRef.current) return;
    if (focusField === 'price') {
      // Fetch recent prices for quick-fill chips — use refs to avoid stale closures
      const familyGroupId = listFamilyGroupIdRef.current;
      const storeName = listStoreNameRef.current;
      if (familyGroupId) {
        PriceHistoryService.getPriceHistory(familyGroupId, item.name)
          .then(history => {
            const filtered = storeName
              ? history.filter(p => p.storeName === storeName)
              : [];
            const unique = [...new Set(filtered.map(p => p.price))].slice(-4).reverse();
            setActiveModal({ type: 'price', item, recentPrices: unique });
          })
          .catch(() => {
            setActiveModal({ type: 'price', item, recentPrices: [] });
          });
      } else {
        setActiveModal({ type: 'price', item, recentPrices: [] });
      }
    } else if (focusField === 'measurement') {
      setActiveModal({ type: 'size', item });
    } else {
      setActiveModal({ type: 'details', item });
    }
  }, [isListLockedRef, listFamilyGroupIdRef, listStoreNameRef]);

  return { activeModal, closeModal, openPriceHistory, handleItemTap };
}

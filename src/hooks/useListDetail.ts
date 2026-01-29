import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Item, ShoppingList, User } from '../models/types';
import ItemManager from '../services/ItemManager';
import ShoppingListManager from '../services/ShoppingListManager';
import FirebaseSyncListener from '../services/FirebaseSyncListener';
import PricePredictionService from '../services/PricePredictionService';
import PriceHistoryService from '../services/PriceHistoryService';
import CategoryService from '../services/CategoryService';

/**
 * useListDetail Hook
 *
 * Manages list detail state including items, price predictions, and category grouping.
 *
 * Usage:
 *   const { items, list, predictedPrices, groupedItems, loading, ... } = useListDetail(listId, currentUserId);
 */
export function useListDetail(listId: string, currentUserId: string | null) {
  const [items, setItems] = useState<Item[]>([]);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isListLocked, setIsListLocked] = useState(false);
  const [isListCompleted, setIsListCompleted] = useState(false);
  const [canAddItems, setCanAddItems] = useState(true);
  const [predictedPrices, setPredictedPrices] = useState<{ [key: string]: number }>({});
  const [smartSuggestions, setSmartSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());

  // Cleanup flag to prevent setState after unmount
  const isMountedRef = useRef(true);

  // Debounce map to prevent multiple rapid toggles on same item
  const toggleInProgressRef = useRef<Set<string>>(new Set());

  // Calculate shopping stats
  const stats = useMemo(() => {
    if (!items || items.length === 0) {
      return { checkedCount: 0, uncheckedCount: 0, runningTotal: 0 };
    }

    const validItems = items.filter(item => item && item.id);
    const checked = validItems.filter(item => item.checked).length;
    const unchecked = validItems.filter(item => !item.checked).length;
    const total = validItems.reduce((sum, item) => {
      const itemNameLower = item.name?.toLowerCase();
      const predictedPrice = itemNameLower && predictedPrices ? predictedPrices[itemNameLower] : 0;
      const price = item.price || predictedPrice || 0;
      return sum + price;
    }, 0);

    return { checkedCount: checked, uncheckedCount: unchecked, runningTotal: total };
  }, [items, predictedPrices]);

  // Subscribe to list and item changes
  useEffect(() => {
    isMountedRef.current = true;

    // Subscribe to list changes
    const unsubscribeList = ShoppingListManager.subscribeToSingleList(
      listId,
      async (updatedList) => {
        if (!isMountedRef.current) return;

        if (updatedList && currentUserId) {
          setList(updatedList);
          setIsListCompleted(updatedList.status === 'completed');

          const locked = await ShoppingListManager.isListLockedForUser(listId, currentUserId);
          setIsListLocked(locked);

          if (updatedList.status === 'completed') {
            setCanAddItems(updatedList.completedBy === currentUserId);
          } else {
            setCanAddItems(!locked);
          }
        }
        setLoading(false);
      }
    );

    // Subscribe to item changes
    const unsubscribeItems = ItemManager.subscribeToItemChanges(listId, (updatedItems) => {
      if (!isMountedRef.current) return;
      if (updatedItems) {
        setItems(updatedItems);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribeList();
      unsubscribeItems();
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    };
  }, [listId, currentUserId]);

  // Start Firebase items listener once we have familyGroupId
  useEffect(() => {
    if (!list?.familyGroupId) return;

    const unsubscribeFirebaseItems = FirebaseSyncListener.startListeningToItems(
      list.familyGroupId,
      listId
    );

    // Load price predictions
    loadPricePredictions(list.familyGroupId);

    return () => {
      unsubscribeFirebaseItems();
    };
  }, [list?.familyGroupId, listId]);

  // Load price predictions
  const loadPricePredictions = useCallback(async (familyGroupId: string) => {
    if (!familyGroupId || !items) return;

    try {
      const predictions = await PricePredictionService.getPredictionsForFamilyGroup(familyGroupId);
      setPredictedPrices(predictions);

      const itemNames = items
        .filter(item => item && item.name && typeof item.name === 'string')
        .map(item => item.name);

      if (itemNames.length > 0) {
        const suggestions = await PriceHistoryService.getSmartSuggestions(familyGroupId, itemNames);
        setSmartSuggestions(suggestions);
      }
    } catch {
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    }
  }, [items]);

  // Group items by category
  const groupedItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const validItems = items.filter(item => item && item.id);
    const unchecked = validItems.filter(item => !item.checked);
    const checked = validItems.filter(item => item.checked);

    const groupByCategory = (itemsList: Item[]) => {
      const grouped: { [category: string]: Item[] } = {};

      itemsList.forEach(item => {
        const category = item.category || 'Other';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(item);
      });

      Object.keys(grouped).forEach(cat => {
        grouped[cat].sort((a, b) => {
          const orderA = a.sortOrder ?? a.createdAt;
          const orderB = b.sortOrder ?? b.createdAt;
          return orderA - orderB;
        });
      });

      return grouped;
    };

    const uncheckedGrouped = groupByCategory(unchecked);
    const checkedGrouped = groupByCategory(checked);

    const result: Array<{ type: 'header' | 'item'; category?: string; item?: Item }> = [];

    const categories = CategoryService.getCategories();
    categories.forEach(cat => {
      const catItems = uncheckedGrouped[cat.id];
      if (catItems && catItems.length > 0) {
        result.push({ type: 'header', category: cat.id });
        catItems.forEach(item => result.push({ type: 'item', item }));
      }
    });

    Object.keys(uncheckedGrouped).forEach(catKey => {
      if (!categories.some(c => c.id === catKey)) {
        const catItems = uncheckedGrouped[catKey];
        if (catItems && catItems.length > 0) {
          result.push({ type: 'header', category: 'Other' });
          catItems.forEach(item => result.push({ type: 'item', item }));
        }
      }
    });

    const hasCheckedItems = Object.keys(checkedGrouped).length > 0;
    if (hasCheckedItems) {
      result.push({ type: 'header', category: 'Completed' });
      categories.forEach(cat => {
        const catItems = checkedGrouped[cat.id];
        if (catItems && catItems.length > 0) {
          catItems.forEach(item => result.push({ type: 'item', item }));
        }
      });
      Object.keys(checkedGrouped).forEach(catKey => {
        if (!categories.some(c => c.id === catKey)) {
          const catItems = checkedGrouped[catKey];
          if (catItems && catItems.length > 0) {
            catItems.forEach(item => result.push({ type: 'item', item }));
          }
        }
      });
    }

    return result;
  }, [items]);

  // Toggle item checked status
  const toggleItem = useCallback(async (itemId: string) => {
    if (toggleInProgressRef.current.has(itemId)) return;

    try {
      toggleInProgressRef.current.add(itemId);
      await ItemManager.toggleItemChecked(itemId);
    } finally {
      toggleInProgressRef.current.delete(itemId);
    }
  }, []);

  // Add item to list
  const addItem = useCallback(async (name: string, category?: string | null) => {
    if (!currentUserId) return;

    const item = await ItemManager.addItem(listId, name, currentUserId);
    if (category) {
      await ItemManager.updateItem(item.id, { category });
    }
    return item;
  }, [listId, currentUserId]);

  // Delete item
  const deleteItem = useCallback(async (itemId: string) => {
    await ItemManager.deleteItem(itemId);
  }, []);

  // Update item
  const updateItem = useCallback(async (itemId: string, updates: { name?: string; price?: number | null; category?: string | null }) => {
    await ItemManager.updateItem(itemId, updates);
  }, []);

  // Refresh data
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fetchedList = await ShoppingListManager.getListById(listId);
      if (fetchedList) {
        setList(fetchedList);
        setIsListCompleted(fetchedList.status === 'completed');

        if (currentUserId) {
          const locked = await ShoppingListManager.isListLockedForUser(listId, currentUserId);
          setIsListLocked(locked);
          setCanAddItems(fetchedList.status === 'completed' ? fetchedList.completedBy === currentUserId : !locked);
        }

        if (fetchedList.familyGroupId) {
          await loadPricePredictions(fetchedList.familyGroupId);
        }
      }

      const listItems = await ItemManager.getItemsForList(listId);
      setItems(listItems);
    } finally {
      setRefreshing(false);
    }
  }, [listId, currentUserId, loadPricePredictions]);

  return {
    items,
    list,
    loading,
    refreshing,
    isListLocked,
    isListCompleted,
    canAddItems,
    predictedPrices,
    smartSuggestions,
    groupedItems,
    stats,
    toggleItem,
    addItem,
    deleteItem,
    updateItem,
    refresh,
  };
}

export default useListDetail;

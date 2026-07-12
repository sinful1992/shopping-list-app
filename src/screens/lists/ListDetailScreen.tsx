import React, { useState, useEffect, useCallback, useMemo, useRef, useOptimistic, startTransition } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Vibration,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import createStyles from './ListDetailScreen.styles';
import { ScrollViewContainer } from 'react-native-reorderable-list';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedItemCard from '../../components/AnimatedItemCard';
import CategoryItemList from '../../components/CategoryItemList';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { ListsStackParamList } from '../../types/navigation';
import { Item, ShoppingList, StoreLayout, User } from '../../models/types';
import ItemManager from '../../services/ItemManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import { useUser } from '../../contexts/UserContext';
import SyncEngine from '../../services/SyncEngine';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import PricePredictionService from '../../services/PricePredictionService';
import PriceHistoryService from '../../services/PriceHistoryService';
import CategoryService, { CategoryType } from '../../services/CategoryService';
import CategoryHistoryService from '../../services/CategoryHistoryService';
import StoreHistoryService from '../../services/StoreHistoryService';
import StoreLayoutService from '../../services/StoreLayoutService';
import PriceEditModal from '../../components/PriceEditModal';
import SizeEditModal from '../../components/SizeEditModal';
import DetailsEditModal from '../../components/DetailsEditModal';
import PriceHistoryModal from '../../components/PriceHistoryModal';
import StoreNamePicker from '../../components/StoreNamePicker';
import FrequentlyBoughtModal from '../../components/FrequentlyBoughtModal';
import CategoryConflictModal from '../../components/CategoryConflictModal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import SyncStatusBanner from '../../components/SyncStatusBanner';
import { useAlert } from '../../contexts/AlertContext';
import { useQuantityEditor } from './hooks/useQuantityEditor';
import { useListSubscriptions } from './hooks/useListSubscriptions';
import { useShoppingMode } from './hooks/useShoppingMode';
import { useListModals } from './hooks/useListModals';
import { calculateShoppingStats } from '../../utils/shoppingStats';
import { sanitizeError } from '../../utils/sanitize';
import { useAdMob } from '../../contexts/AdMobContext';
import NotificationManager from '../../services/NotificationManager';
import CrashReporting from '../../services/CrashReporting';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Delay between tapping a checkbox and the item moving to the Completed
// section — covers AnimatedItemCard's 300ms in-place check pop plus a beat.
const CHECK_MOVE_DELAY_MS = 400;

/**
 * ListDetailScreen
 * Displays and manages items in a shopping list
 * Implements Req 2.4, 3.1-3.6
 */
const ListDetailScreen = () => {
  const route = useRoute<RouteProp<ListsStackParamList, 'ListDetail'>>();
  const navigation = useNavigation<StackNavigationProp<ListsStackParamList>>();
  const { showAlert } = useAlert();
  const { showInterstitial, showInterstitialWithRetry } = useAdMob();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const showInterstitialWithRetryRef = useRef(showInterstitialWithRetry);
  showInterstitialWithRetryRef.current = showInterstitialWithRetry;
  const insets = useSafeAreaInsets();
  const { listId } = route.params;
  const [items, setItems] = useState<Item[]>([]);
  // Optimistic update SETS an explicit target `checked` (not a toggle/negate).
  // useOptimistic re-runs this reducer whenever the base `items` changes while
  // the transition is pending — and the WatermelonDB observer updates `items`
  // before the transition ends. A negating reducer (`!item.checked`) would then
  // flip the item back when the real state lands, causing a visible bounce.
  // Setting an explicit target is idempotent, so the re-apply is a no-op.
  const [optimisticItems, applyOptimisticToggle] = useOptimistic(
    items,
    (state, payload: { id: string; checked: boolean }) =>
      state.map(item => item.id === payload.id ? { ...item, checked: payload.checked } : item),
  );
  const [newItemName, setNewItemName] = useState('');
  const [list, setList] = useState<ShoppingList | null>(null);
  const [listName, setListName] = useState('');
  const [editedListName, setEditedListName] = useState('');
  const [isEditingListName, setIsEditingListName] = useState(false);
  // Live user from App's auth listener (UserContext)
  const currentUser: User | null = useUser();
  const currentUserId = currentUser?.uid ?? null;
  const [refreshing, setRefreshing] = useState(false);

  // Store picker modal state: null=closed, 'banner'=store warning, 'shopping'=start shopping
  const [storePickerMode, setStorePickerMode] = useState<null | 'banner' | 'shopping'>(null);

  // Frequent items modal state
  const [frequentItemsVisible, setFrequentItemsVisible] = useState(false);

  // Category conflict modal state
  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [pendingItemName, setPendingItemName] = useState('');
  const [conflictCategories, setConflictCategories] = useState<Array<{ category: string; usageCount: number; lastUsedAt: number }>>([]);

  // Shopping mode UI state
  const [runningTotal, setRunningTotal] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [uncheckedCount, setUncheckedCount] = useState(0);
  const [isCreatingPartialList, setIsCreatingPartialList] = useState(false);
  const [predictedPrices, setPredictedPrices] = useState<{ [key: string]: number }>({});
  const [smartSuggestions, setSmartSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());
  const [isShoppingHeaderExpanded, setIsShoppingHeaderExpanded] = useState(false);

  // Store layout state
  // undefined = not yet fetched; null = fetched, no layout found; StoreLayout = fetched and found
  const [storeLayout, setStoreLayout] = useState<StoreLayout | null | undefined>(undefined);

  // Lock / shopping-mode / permission state derived from list + user
  const {
    isListLocked,
    setIsListLocked,
    isListLockedRef,
    isShoppingMode,
    setIsShoppingMode,
    isListCompleted,
    canAddItems,
  } = useShoppingMode(list, currentUserId);

  // Suppresses observer re-renders during an active drag reorder to avoid intermediate state flicker
  const isReorderingRef = useRef(false);

  // Cleanup flag to prevent setState after unmount
  const isMountedRef = React.useRef(true);

  // Ref for optimistic quantity updates (always has latest state for rapid taps)
  const itemsRef = useRef<Item[]>([]);

  // Refs to avoid currentUserId/currentUser closures in main useEffect and async loaders
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<User | null>(null);

  // Optimistic quantity map + debounced writes + unmount flush
  const { mergeOptimisticQty, setQuantity, flush: flushQtyWrites } = useQuantityEditor();

  // Cache haptic setting to avoid AsyncStorage read on every toggle
  const hapticEnabledRef = useRef(false);

  // Tracks whether predictions have been loaded for the current list mount
  const predictionsLoadedRef = useRef(false);

  // Refs to avoid list closure in useCallback handlers
  const listFamilyGroupIdRef = useRef<string | undefined>(undefined);
  const listStoreNameRef = useRef<string | undefined>(undefined);
  // Keep refs in sync with state
  listFamilyGroupIdRef.current = list?.familyGroupId;
  listStoreNameRef.current = list?.storeName ?? undefined;
  currentUserIdRef.current = currentUserId;
  currentUserRef.current = currentUser;

  // Item-editing modals (price/size/details/priceHistory) + tap dispatcher
  const { activeModal, closeModal, openPriceHistory, handleItemTap } = useListModals({
    isListLockedRef,
    listFamilyGroupIdRef,
    listStoreNameRef,
  });

  // Load haptic setting on focus so the ref stays fresh if user changes it in Settings
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('hapticFeedbackEnabled').then(v => {
      hapticEnabledRef.current = v === 'true';
    });
  }, []));

  // Compute + apply shopping stats (pure math lives in utils/shoppingStats).
  // `predictions` override lets callers use freshly-loaded prices before the
  // predictedPrices state update has landed.
  const applyShoppingStats = useCallback((itemsList: Item[], predictions?: { [key: string]: number }) => {
    const stats = calculateShoppingStats(itemsList, predictions ?? predictedPrices);
    setCheckedCount(stats.checked);
    setUncheckedCount(stats.unchecked);
    setRunningTotal(stats.total);
  }, [predictedPrices]);

  const isValidListId = !!listId && UUID_REGEX.test(listId);

  useEffect(() => {
    if (!isValidListId) {
      showAlert('Error', 'Invalid list link.', [{ text: 'OK', onPress: () => navigation.goBack() }], { icon: 'error' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidListId]);

  // WatermelonDB list/item observers + NetInfo + InteractionManager deferral
  const { isOnline } = useListSubscriptions(listId, isValidListId, {
    onMount: () => {
      isMountedRef.current = true;
      // Eager: fast local DB reads needed immediately
      loadListMetadata();
    },
    onAfterInteractions: () => {
      // Deferred: expensive predictions after navigation animation completes
      loadPredictions();
    },
    onList: (updatedList) => {
      if (!currentUserIdRef.current) return;
      // Lock/shopping-mode/permission state recomputes in useShoppingMode
      // whenever the list object changes.
      setList(updatedList);
      setListName(updatedList.name);
    },
    onItems: (updatedItems) => {
      // Merge optimistic quantity values — prevents observer from overwriting rapid taps
      const mergedItems = mergeOptimisticQty(updatedItems);

      itemsRef.current = mergedItems;
      if (!isReorderingRef.current) {
        setItems(mergedItems);
      }

      applyShoppingStats(mergedItems);

      if (!predictionsLoadedRef.current && mergedItems.length > 0 && listFamilyGroupIdRef.current) {
        predictionsLoadedRef.current = true;
        predictPricesFromHistory(mergedItems, listFamilyGroupIdRef.current);
      }
    },
    onCleanup: () => {
      isMountedRef.current = false;
      predictionsLoadedRef.current = false;
      setPredictedPrices({});
      setSmartSuggestions(new Map());

      // Flush pending qty writes on unmount — don't lose data
      flushQtyWrites();
    },
  });

  // Trigger sync when coming back online. Failures stay visible via
  // SyncStatusBanner, which subscribes to SyncEngine status changes.
  useEffect(() => {
    if (!isOnline) return;
    SyncEngine.syncPendingChanges().catch(error => {
      CrashReporting.recordError(error as Error, 'ListDetailScreen reconnect sync');
    });
  }, [isOnline]);

  // Show interstitial ad on list open (retry for cold starts lives in AdMobContext)
  useEffect(() => {
    showInterstitialWithRetryRef.current();
  }, []);

  // Start Firebase items listener once we have the list's familyGroupId
  useEffect(() => {
    if (!list?.familyGroupId) return;

    const unsubscribeFirebaseItems = FirebaseSyncListener.startListeningToItems(
      list.familyGroupId,
      listId
    );

    return () => {
      unsubscribeFirebaseItems();
    };
  }, [list?.familyGroupId, listId]);

  const loadListMetadata = async (): Promise<ShoppingList | null> => {
    try {
      const fetchedList = await ShoppingListManager.getListById(listId);
      if (fetchedList) {
        // Security: verify ownership — needed because listId can come from a deep link
        const user = currentUserRef.current;
        if (user?.familyGroupId && fetchedList.familyGroupId !== user.familyGroupId) {
          showAlert(
            'Access Denied',
            'You do not have access to this list.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
            { icon: 'error' }
          );
          return null;
        }
        // Lock/shopping-mode/permission state recomputes in useShoppingMode
        setList(fetchedList);
        setListName(fetchedList.name);
        return fetchedList;
      }
      return null;
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      return null;
    }
  };

  const loadPredictions = async () => {
    const familyGroupId = listFamilyGroupIdRef.current;
    if (!familyGroupId || itemsRef.current.length === 0) return;
    await predictPricesFromHistory(itemsRef.current, familyGroupId);
  };

  const predictPricesFromHistory = useCallback(async (itemsList: Item[], familyGroupId: string) => {
    if (!familyGroupId || !itemsList) return;

    try {
      // Use cached price prediction service - much faster!
      const predictions = await PricePredictionService.getPredictionsForFamilyGroup(familyGroupId);
      setPredictedPrices(predictions);

      // Get smart suggestions for items where there's a price difference across stores
      const itemNames = itemsList
        .filter(item => item && item.name && typeof item.name === 'string')
        .map(item => item.name);

      if (itemNames.length > 0) {
        const suggestions = await PriceHistoryService.getSmartSuggestions(familyGroupId, itemNames);
        setSmartSuggestions(suggestions);
      }

      // Recalculate stats with the freshly loaded predictions (passing them
      // explicitly — the predictedPrices state update hasn't landed yet)
      applyShoppingStats(itemsList, predictions);
    } catch {
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    }
  }, [applyShoppingStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    const freshList = await loadListMetadata();
    if (freshList?.familyGroupId) {
      await predictPricesFromHistory(itemsRef.current, freshList.familyGroupId);
    }
    setRefreshing(false);
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    if (!currentUserId) return;

    if (!list) {
      showAlert('Error', 'List is still loading. Please wait a moment and try again.', undefined, { icon: 'error' });
      return;
    }

    try {
      // Check for category conflicts only if familyGroupId is available
      let suggestedCategory: string | null = null;

      if (list.familyGroupId) {
        const categories = await CategoryHistoryService.getCategoriesForItem(
          list.familyGroupId,
          newItemName.trim()
        );

        if (categories.length >= 2) {
          // Show conflict resolution modal
          setPendingItemName(newItemName.trim());
          setConflictCategories(categories);
          setConflictModalVisible(true);
          return; // Exit early - modal will handle adding the item
        } else if (categories.length === 1) {
          suggestedCategory = categories[0].category;
        }
      }

      // No conflict - add item with suggested category (if any)
      await addItemWithCategory(newItemName.trim(), suggestedCategory);
      setNewItemName('');
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const addItemWithCategory = async (name: string, category: string | null) => {
    if (!currentUserId) return;
    await ItemManager.addItem(listId, name, currentUserId, undefined, undefined, category);
  };

  const handleConflictResolved = async (selectedCategory: string) => {
    await addItemWithCategory(pendingItemName, selectedCategory);
    setConflictModalVisible(false);
    setPendingItemName('');
    setNewItemName('');
  };

  const handleAddFrequentItem = async (itemName: string) => {
    if (!currentUserId) return;

    try {
      let category: string | null = null;

      if (list?.familyGroupId) {
        category = await CategoryHistoryService.getSuggestedCategory(list.familyGroupId, itemName);
      }

      await ItemManager.addItem(listId, itemName, currentUserId, undefined, undefined, category);
      showAlert('Added', `${itemName} added to list`, undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleToggleItem = useCallback((itemId: string) => {
    if (hapticEnabledRef.current && Vibration && typeof Vibration.vibrate === 'function') {
      try { Vibration.vibrate(50); } catch {}
    }
    const targetChecked = !(itemsRef.current.find(i => i.id === itemId)?.checked === true);
    const commit = () => startTransition(async () => {
      applyOptimisticToggle({ id: itemId, checked: targetChecked });
      try {
        await ItemManager.toggleItemChecked(itemId);
      } catch (error: any) {
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      }
    });
    if (targetChecked) {
      // Let AnimatedItemCard play its in-place check pop (300ms sequence on
      // pendingCheck) before the regroup moves the card to Completed.
      // TODO: soften the remaining section move with LinearTransition on
      // siblings — needs AVD validation inside NestedReorderableList first.
      setTimeout(commit, CHECK_MOVE_DELAY_MS);
    } else {
      commit();
    }
  }, [applyOptimisticToggle, showAlert]);

  const handleDeleteItem = async (itemId: string) => {
    try {
      await ItemManager.deleteItem(itemId);
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleIncrement = useCallback((itemId: string) => {
    const currentItem = itemsRef.current.find(i => i.id === itemId);
    if (!currentItem) return;
    const currentQty = currentItem.unitQty ?? 1;
    const newQty = currentQty + 1;
    const targetQty = newQty > 1 ? newQty : null;

    const updatedItems = itemsRef.current.map(i =>
      i.id === itemId ? { ...i, unitQty: targetQty } : i
    );
    itemsRef.current = updatedItems;
    setItems(updatedItems);

    setQuantity(itemId, targetQty);
  }, [setQuantity]);

  const handleDecrement = useCallback((itemId: string) => {
    const currentItem = itemsRef.current.find(i => i.id === itemId);
    if (!currentItem) return;
    const currentQty = currentItem.unitQty ?? 1;
    const newQty = Math.max(1, currentQty - 1);
    if (newQty === currentQty) return;
    const targetQty = newQty > 1 ? newQty : null;

    const updatedItems = itemsRef.current.map(i =>
      i.id === itemId ? { ...i, unitQty: targetQty } : i
    );
    itemsRef.current = updatedItems;
    setItems(updatedItems);

    setQuantity(itemId, targetQty);
  }, [setQuantity]);

  const handlePriceSave = async (itemId: string, updates: { price?: number | null }) => {
    try {
      await ItemManager.updateItem(itemId, updates);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleSizeSave = async (
    itemId: string,
    updates: { measurementUnit?: string | null; measurementValue?: number | null },
  ) => {
    try {
      await ItemManager.updateItem(itemId, updates);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleDetailsSave = async (
    itemId: string,
    updates: { name?: string; category?: string | null }
  ) => {
    try {
      await ItemManager.updateItem(itemId, updates);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleEditListName = () => {
    setEditedListName(listName);
    setIsEditingListName(true);
  };

  const handleSaveListName = async () => {
    if (!editedListName.trim()) {
      showAlert('Error', 'List name cannot be empty', undefined, { icon: 'error' });
      return;
    }
    try {
      await ShoppingListManager.updateListName(listId, editedListName.trim());
      setListName(editedListName.trim());
      setIsEditingListName(false);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleCancelEditListName = () => {
    setIsEditingListName(false);
    setEditedListName('');
  };

  const handleTakeReceiptPhoto = () => {
    navigation.navigate('ReceiptCamera', { listId });
  };

  const handleStartShopping = () => {
    setStorePickerMode('shopping');
  };

  const handleStoreSelected = async (storeName: string) => {
    if (!currentUserId || !currentUser) return;

    try {
      // Add store to history if provided
      if (storeName) {
        await StoreHistoryService.addStore(storeName);
      }

      // Update list with store name
      if (storeName) {
        await ShoppingListManager.updateListStoreName(listId, storeName);
      }

      // Lock list for shopping
      await ShoppingListManager.lockListForShopping(
        listId,
        currentUserId,
        currentUser.displayName,
        currentUser.role || null
      );

      setIsShoppingMode(true);
      isListLockedRef.current = false;
      setIsListLocked(false); // Not locked for current user

      // Notify family members (fire-and-forget)
      if (list?.familyGroupId) {
        NotificationManager.notifyShoppingStarted(
          list.familyGroupId,
          currentUserId,
          currentUser.displayName || currentUser.email || 'A family member',
          storeName,
          listName
        ).catch(err => CrashReporting.recordError(err as Error, 'ListDetailScreen notifyShoppingStarted'));
      }

      // WatermelonDB observer will automatically update the list state
      showAlert('Shopping Mode', 'You are now shopping. Other family members can only view this list.', undefined, { icon: 'info' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleBannerStoreSelected = async (storeName: string) => {
    if (!storeName) return;
    await ShoppingListManager.updateListStoreName(listId, storeName);
    await StoreHistoryService.addStore(storeName);
  };

  const performFullCompletion = (skippedCount: number) => {
    showInterstitial();
    const finalTotal = runningTotal;
    const storeName = list?.storeName || null;
    setIsShoppingMode(false);
    showAlert(
      'Shopping Complete!',
      'Your shopping list has been saved to history.',
      [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }],
      { icon: 'success' },
    );
    ShoppingListManager.completeShoppingFast(listId, currentUserId!, finalTotal, storeName, skippedCount > 0 ? skippedCount : null).catch(err => CrashReporting.recordError(err as Error, 'ListDetailScreen completeShoppingFast/full'));
  };

  const performPartialCompletion = async (uncheckedItems: Item[]) => {
    if (isCreatingPartialList) return;
    if (!list || !currentUser) {
      showAlert('Error', 'Unable to complete. Please restart the app and try again.', undefined, { icon: 'error' });
      return;
    }

    showInterstitial();
    const finalTotal = runningTotal;
    const storeName = list.storeName || null;
    const count = uncheckedItems.length;

    setIsShoppingMode(false);
    setIsCreatingPartialList(true);

    ShoppingListManager.completeShoppingFast(listId, currentUserId!, finalTotal, storeName, count).catch(err => CrashReporting.recordError(err as Error, 'ListDetailScreen completeShoppingFast/partial'));

    let newList;
    try {
      newList = await ShoppingListManager.createList(list.name, currentUserId!, list.familyGroupId, currentUser);
    } catch {
      const itemNames = uncheckedItems.map(i => `• ${i.name}`).join('\n');
      setIsCreatingPartialList(false);
      showAlert(
        'Partial Save',
        `Your list was completed, but a new list could not be created (you may be at your list limit). Items not carried over:\n\n${itemNames}`,
        [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }],
        { icon: 'warning' },
      );
      return;
    }

    try {
      await ItemManager.addItemsBatch(
        newList.id,
        uncheckedItems.map(i => ({
          name: i.name,
          quantity: i.quantity ?? undefined,
          price: i.price ?? undefined,
          category: i.category,
        })),
        currentUserId!,
      );
    } catch {
      setIsCreatingPartialList(false);
      showAlert(
        'Partial Save',
        'Your list was completed and a new list was created, but items could not be added to it.',
        [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }],
        { icon: 'warning' },
      );
      return;
    }

    setIsCreatingPartialList(false);
    showAlert(
      'Shopping Complete!',
      `${count} item${count === 1 ? '' : 's'} carried to a new list.`,
      [{ text: 'OK', style: 'default', onPress: () => navigation.goBack() }],
      { icon: 'success' },
    );
  };

  const handleDoneShopping = () => {
    if (!currentUserId) return;
    if (items.length === 0) {
      showAlert('Cannot Complete', 'Add at least one item before completing the list.', undefined, { icon: 'warning' });
      return;
    }

    const uncheckedItems = items.filter(i => !i.checked);

    if (uncheckedItems.length === 0) {
      performFullCompletion(0);
      return;
    }

    showAlert(
      'Items Not Bought',
      `${uncheckedItems.length} item${uncheckedItems.length === 1 ? '' : 's'} weren't checked. What would you like to do?`,
      [
        {
          text: 'Full Shop',
          style: 'default',
          onPress: () => performFullCompletion(uncheckedItems.length),
        },
        {
          text: 'Partial Shop',
          style: 'default',
          onPress: () => performPartialCompletion(uncheckedItems),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { icon: 'confirm' },
    );
  };

  const handleCancelShopping = async () => {
    if (!currentUserId) return;
    setIsShoppingMode(false);
    try {
      await ShoppingListManager.updateList(listId, {
        isLocked: false,
        lockedBy: null,
        lockedByName: null,
        lockedByRole: null,
        lockedAt: null,
      });
    } catch {
      setIsShoppingMode(true);
    }
  };

  // Fetch store layout when storeName or familyGroupId changes, or when screen regains focus
  useFocusEffect(
    useCallback(() => {
      if (!list?.storeName || !list?.familyGroupId) {
        setStoreLayout(null);
        return;
      }
      let cancelled = false;
      StoreLayoutService.getLayoutForStore(list.storeName, list.familyGroupId)
        .then(layout => { if (!cancelled) setStoreLayout(layout); })
        .catch(() => { if (!cancelled) setStoreLayout(null); });
      return () => { cancelled = true; };
    }, [list?.storeName, list?.familyGroupId])
  );

  // Reload smart suggestions on re-focus (not initial mount — subscription handles that)
  useFocusEffect(useCallback(() => {
    const fgid = listFamilyGroupIdRef.current;
    const currentItems = itemsRef.current;
    if (predictionsLoadedRef.current && fgid && currentItems.length > 0) {
      predictPricesFromHistory(currentItems, fgid);
    }
  }, [predictPricesFromHistory]));

  const handleCategoryDragEnd = useCallback((reorderedItems: Item[]) => {
    const reorderedIds = new Set(reorderedItems.map(i => i.id));
    const optimistic = [
      ...itemsRef.current.filter(i => !reorderedIds.has(i.id)),
      ...reorderedItems.map((item, idx) => ({ ...item, sortOrder: idx })),
    ];
    itemsRef.current = optimistic;
    setItems(optimistic);
    // Write to DB in background, suppressing observer fires during batch writes
    isReorderingRef.current = true;
    ItemManager.reorderItems(reorderedItems).finally(() => {
      isReorderingRef.current = false;
      setItems([...itemsRef.current]);
    });
  }, []);

  // Group items by category and sort by sortOrder within each group.
  // Returns separate maps for unchecked and checked items.
  // NOTE: after per-category D&D, sortOrder is a within-category rank (not global).
  // All display code must group by category first, then sort by sortOrder within groups.
  const { uncheckedGrouped, checkedGrouped } = useMemo(() => {
    if (!optimisticItems || optimisticItems.length === 0) {
      return { uncheckedGrouped: {} as { [cat: string]: Item[] }, checkedGrouped: {} as { [cat: string]: Item[] } };
    }

    const validItems = optimisticItems.filter(item => item && item.id);
    const unchecked = validItems.filter(item => !item.checked);
    const checked = validItems.filter(item => item.checked);

    const groupByCategory = (itemsList: Item[]): { [category: string]: Item[] } => {
      const grouped: { [category: string]: Item[] } = {};
      itemsList.forEach(item => {
        const category = item.category || 'Other';
        if (!grouped[category]) grouped[category] = [];
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

    return {
      uncheckedGrouped: groupByCategory(unchecked),
      checkedGrouped: groupByCategory(checked),
    };
  }, [optimisticItems]);

  // Category display order: use layout order when layout is active, otherwise default service order
  const categoryDisplayOrder = useMemo(() => {
    if (storeLayout) {
      return storeLayout.categoryOrder;
    }
    return CategoryService.getCategories().map(c => c.id as CategoryType);
  }, [storeLayout]);

  // Local category order for arrow-tap reordering (syncs from categoryDisplayOrder, diverges while user reorders)
  const [localCategoryOrder, setLocalCategoryOrder] = useState<CategoryType[]>([]);
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);

  useEffect(() => {
    setLocalCategoryOrder(categoryDisplayOrder);
    setIsLayoutDirty(false);
  }, [categoryDisplayOrder]);

  const visibleCategories = useMemo(() =>
    localCategoryOrder.filter(cat => uncheckedGrouped[cat]?.length > 0),
    [localCategoryOrder, uncheckedGrouped]
  );

  const handleMoveCategory = useCallback((cat: CategoryType, direction: 'up' | 'down') => {
    const visibleIdx = visibleCategories.indexOf(cat);
    const swapIdx = direction === 'up' ? visibleIdx - 1 : visibleIdx + 1;
    if (swapIdx < 0 || swapIdx >= visibleCategories.length) return;

    const fullFromIdx = localCategoryOrder.indexOf(cat);
    const fullToIdx = localCategoryOrder.indexOf(visibleCategories[swapIdx]);
    setLocalCategoryOrder(prev => {
      const next = [...prev];
      [next[fullFromIdx], next[fullToIdx]] = [next[fullToIdx], next[fullFromIdx]];
      return next;
    });
    setIsLayoutDirty(true);
    Vibration.vibrate(30);
  }, [visibleCategories, localCategoryOrder]);

  const handleSaveLayout = useCallback(async () => {
    if (!list?.storeName || !list?.familyGroupId || !currentUserId || isSavingLayout) return;
    setIsSavingLayout(true);
    try {
      const saved = await StoreLayoutService.saveLayout(
        list.storeName, list.familyGroupId, localCategoryOrder, currentUserId,
      );
      setStoreLayout(saved);
      setIsLayoutDirty(false);
    } catch {
      setLocalCategoryOrder(categoryDisplayOrder);
      setIsLayoutDirty(false);
    } finally {
      setIsSavingLayout(false);
    }
  }, [list?.storeName, list?.familyGroupId, currentUserId, localCategoryOrder, categoryDisplayOrder, isSavingLayout]);

  return (
    <View style={styles.container}>
      <View style={[styles.titleContainer, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Icon name="chevron-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        {isEditingListName ? (
          <>
            <TextInput
              style={styles.titleInput}
              value={editedListName}
              onChangeText={setEditedListName}
              autoFocus
              placeholderTextColor="#6E6E73"
              editable={!isListLocked}
            />
            <TouchableOpacity style={styles.titleSaveButton} onPress={handleSaveListName} disabled={isListLocked} accessibilityRole="button" accessibilityLabel="Save list name">
              <Icon name="checkmark" size={20} color={theme.accent.green} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.titleCancelButton} onPress={handleCancelEditListName} accessibilityRole="button" accessibilityLabel="Cancel editing list name">
              <Icon name="close" size={20} color={theme.accent.red} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{listName}</Text>
            {isLayoutDirty && (
              <TouchableOpacity
                style={[styles.saveLayoutButton, isSavingLayout && styles.saveLayoutButtonDisabled]}
                onPress={handleSaveLayout}
                disabled={isSavingLayout}
                accessibilityRole="button"
                accessibilityLabel="Save store layout"
              >
                <Text style={styles.saveLayoutText}>{isSavingLayout ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            )}
            {!isListLocked && !isLayoutDirty && (
              <TouchableOpacity onPress={handleEditListName} accessibilityRole="button" accessibilityLabel="Edit list name">
                <Icon name="pencil" size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <SyncStatusBanner />

      {/* Smart Status Bar - Consolidated single banner with priority system */}
      {(isShoppingMode || isListLocked || (isListCompleted && !canAddItems)) && (
        <View style={[
          styles.smartStatusBar,
          isShoppingMode ? styles.statusShopping :
          isListLocked ? styles.statusLocked :
          styles.statusCompleted
        ]}>
          {/* Shopping Mode - Priority 1 */}
          {isShoppingMode && !isShoppingHeaderExpanded && (
            <View style={styles.statusContentCompact}>
              <View style={styles.statusLeft}>
                <Icon name="cart" size={16} color={theme.text.primary} style={styles.statusIcon} />
                <Text style={styles.statusTextCompact}>
                  £{runningTotal.toFixed(2)} • {checkedCount}/{checkedCount + uncheckedCount}
                </Text>
                {/* Show budget indicator only if over 80% or budget exceeded */}
                {list?.budget && runningTotal > list.budget * 0.8 && (
                  <View style={[
                    styles.budgetBadge,
                    runningTotal > list.budget ? styles.budgetBadgeOver : styles.budgetBadgeWarning
                  ]}>
                    <Text style={styles.budgetBadgeText}>
                      {runningTotal > list.budget ? `+£${(runningTotal - list.budget).toFixed(2)}` : `£${list.budget}`}
                    </Text>
                  </View>
                )}
                {!isOnline && <Icon name="cloud-offline-outline" size={16} color={theme.text.primary} style={styles.statusIcon} />}
              </View>
              <View style={styles.statusRight}>
                <TouchableOpacity onPress={() => setIsShoppingHeaderExpanded(true)} style={styles.expandButton} accessibilityRole="button" accessibilityLabel="Expand shopping summary">
                  <Icon name="chevron-down" size={14} color={theme.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneButtonCompact} onPress={handleDoneShopping}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Shopping Mode Expanded */}
          {isShoppingMode && isShoppingHeaderExpanded && (
            <View style={styles.statusContentExpanded}>
              <View style={styles.expandedHeader}>
                <Text style={styles.expandedTitle}>🛒 Shopping Mode</Text>
                <TouchableOpacity onPress={() => setIsShoppingHeaderExpanded(false)} style={styles.collapseButton} accessibilityRole="button" accessibilityLabel="Collapse shopping summary">
                  <Icon name="chevron-up" size={14} color={theme.text.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.expandedStats}>
                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Total:</Text>
                  <Text style={styles.expandedValue}>£{runningTotal.toFixed(2)}</Text>
                </View>
                {list?.budget && (
                  <View style={styles.expandedRow}>
                    <Text style={styles.expandedLabel}>Budget:</Text>
                    <Text style={[
                      styles.expandedValue,
                      runningTotal > list.budget ? styles.textOver :
                      runningTotal > list.budget * 0.8 ? styles.textWarning :
                      styles.textOk
                    ]}>
                      £{list.budget} {runningTotal > list.budget && `(+£${(runningTotal - list.budget).toFixed(2)})`}
                    </Text>
                  </View>
                )}
                <View style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>Items:</Text>
                  <Text style={styles.expandedValue}>{checkedCount} checked, {uncheckedCount} remaining</Text>
                </View>
                {!isOnline && (
                  <View style={styles.expandedRow}>
                    <Text style={styles.expandedLabel}>Status:</Text>
                    <Text style={styles.textWarning}>📡 Offline - Changes will sync later</Text>
                  </View>
                )}
              </View>
              <View style={styles.expandedButtons}>
                <TouchableOpacity style={styles.cancelButtonExpanded} onPress={handleCancelShopping}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneButtonExpanded} onPress={handleDoneShopping}>
                  <LinearGradient
                    colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientDoneButton}
                  >
                    <Text style={styles.doneButtonText}>Done Shopping</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Locked State - Priority 2 */}
          {!isShoppingMode && isListLocked && list && (
            <View style={styles.statusContentCompact}>
              <View style={styles.statusLeft}>
                <Icon name="lock-closed" size={16} color={theme.text.primary} style={styles.statusIcon} />
                <Text style={styles.statusTextCompact}>
                  {list.lockedByRole || list.lockedByName || 'Someone'} is shopping now
                </Text>
              </View>
            </View>
          )}

          {/* Completed State - Priority 3 */}
          {!isShoppingMode && !isListLocked && isListCompleted && !canAddItems && (
            <View style={styles.statusContentCompact}>
              <View style={styles.statusLeft}>
                <Icon name="checkmark-circle" size={16} color={theme.accent.green} style={styles.statusIcon} />
                <Text style={styles.statusTextCompact}>
                  Completed - Only shopper can add items
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {!list?.storeName && !isListLocked && !isListCompleted && (
        <View style={styles.storeWarningBanner}>
          <Text style={styles.storeWarningText}>
            No store selected — prices won't be saved to history
          </Text>
          <TouchableOpacity onPress={() => setStorePickerMode('banner')} accessibilityRole="button">
            <Text style={styles.storeWarningLink}>Select Store</Text>
          </TouchableOpacity>
        </View>
      )}

      {list?.storeName && !isListLocked && !isListCompleted && (
        <View style={styles.changeStoreRow}>
          <Text style={styles.changeStoreLabel}>{list.storeName}</Text>
          <TouchableOpacity onPress={() => setStorePickerMode('banner')} accessibilityRole="button" accessibilityLabel="Change store">
            <Text style={styles.changeStoreLink}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.addItemContainer}>
        <TextInput
          style={styles.input}
          placeholder={
            isListLocked
              ? "List is locked..."
              : !canAddItems
              ? "List is completed..."
              : "Add item..."
          }
          placeholderTextColor="#6E6E73"
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
          editable={canAddItems}
        />
        <TouchableOpacity
          style={styles.frequentItemsButton}
          onPress={() => setFrequentItemsVisible(true)}
          disabled={!canAddItems}
          accessibilityRole="button"
          accessibilityLabel="Show frequently bought items"
        >
          <Icon name="time-outline" size={20} color={theme.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem} disabled={!canAddItems}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollViewContainer
        style={styles.listScrollContainer}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {Object.keys(uncheckedGrouped).length === 0 && Object.keys(checkedGrouped).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        ) : (
          <>
            {/* Unchecked items — known categories in layout/default order, draggable */}
            {visibleCategories.map((cat, idx) => {
                const catItems = uncheckedGrouped[cat]!;
                const category = CategoryService.getCategory(cat);
                return (
                  <View key={`cat-${cat}`}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryIcon}>{category?.icon || '📦'}</Text>
                      <Text style={styles.categoryName}>{category?.name || cat}</Text>
                      {!isListLocked && !!list?.storeName && (
                        <View style={styles.categoryArrows}>
                          <TouchableOpacity
                            onPress={() => handleMoveCategory(cat, 'up')}
                            disabled={idx === 0}
                            style={styles.arrowButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${category?.name || cat} up`}
                          >
                            <Icon name="chevron-up" size={18} color={idx === 0 ? '#3A3A3C' : '#6E6E73'} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleMoveCategory(cat, 'down')}
                            disabled={idx === visibleCategories.length - 1}
                            style={styles.arrowButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${category?.name || cat} down`}
                          >
                            <Icon name="chevron-down" size={18} color={idx === visibleCategories.length - 1 ? '#3A3A3C' : '#6E6E73'} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <CategoryItemList
                      key={`cat-items-${cat}`}
                      catItems={catItems}
                      predictedPrices={predictedPrices}
                      smartSuggestions={smartSuggestions}
                      storeName={list?.storeName ?? undefined}
                      isListLocked={isListLocked}
                      onReorder={handleCategoryDragEnd}
                      onToggleItem={handleToggleItem}
                      onItemTap={handleItemTap}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                    />
                  </View>
                );
              })}

            {/* Unchecked items with unrecognised/custom category keys */}
            {Object.keys(uncheckedGrouped)
              .filter(key => !CategoryService.getCategories().some(c => c.id === key))
              .map(key => {
                const catItems = uncheckedGrouped[key];
                if (!catItems?.length) return null;
                return (
                  <View key={`custom-${key}`}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryIcon}>📦</Text>
                      <Text style={styles.categoryName}>{key}</Text>
                    </View>
                    <CategoryItemList
                      key={`custom-items-${key}`}
                      catItems={catItems}
                      predictedPrices={predictedPrices}
                      smartSuggestions={smartSuggestions}
                      storeName={list?.storeName ?? undefined}
                      isListLocked={isListLocked}
                      onReorder={handleCategoryDragEnd}
                      onToggleItem={handleToggleItem}
                      onItemTap={handleItemTap}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                    />
                  </View>
                );
              })}

            {/* Checked items — non-draggable */}
            {Object.keys(checkedGrouped).length > 0 && (
              <View>
                <View style={styles.categoryHeader}>
                  <Icon name="checkmark-circle" size={16} color={theme.accent.green} style={styles.categoryIcon} />
                  <Text style={styles.categoryName}>Completed</Text>
                </View>
                {CategoryService.getCategories().map(cat => {
                  const catItems = checkedGrouped[cat.id];
                  if (!catItems?.length) return null;
                  return catItems.map((item, index) => {
                    const itemPrice = item.price ?? (item.name ? predictedPrices[item.name.toLowerCase()] : undefined) ?? 0;
                    const isPredicted = !item.price && !!item.name && !!predictedPrices[item.name.toLowerCase()];
                    return (
                      <AnimatedItemCard
                        key={item.id || `checked-${index}`}
                        index={index}
                        item={item}
                        itemPrice={itemPrice}
                        isPredicted={isPredicted}
                        showSuggestion={false}
                        suggestion={undefined}
                        isListLocked={isListLocked}
                        onToggleItem={() => !isListLocked && handleToggleItem(item.id)}
                        onItemTap={(focusField) => handleItemTap(item, focusField)}
                        onIncrement={handleIncrement}
                        onDecrement={handleDecrement}
                      />
                    );
                  });
                })}
                {/* Checked items with unrecognised category */}
                {Object.keys(checkedGrouped)
                  .filter(key => !CategoryService.getCategories().some(c => c.id === key))
                  .map(key => {
                    const catItems = checkedGrouped[key];
                    if (!catItems?.length) return null;
                    return catItems.map((item, index) => {
                      const itemPrice = item.price ?? (item.name ? predictedPrices[item.name.toLowerCase()] : undefined) ?? 0;
                      const isPredicted = !item.price && !!item.name && !!predictedPrices[item.name.toLowerCase()];
                      return (
                        <AnimatedItemCard
                          key={item.id || `checked-custom-${key}-${index}`}
                          index={index}
                          item={item}
                          itemPrice={itemPrice}
                          isPredicted={isPredicted}
                          showSuggestion={false}
                          suggestion={undefined}
                          isListLocked={isListLocked}
                          onToggleItem={() => !isListLocked && handleToggleItem(item.id)}
                          onItemTap={(focusField) => handleItemTap(item, focusField)}
                          onIncrement={handleIncrement}
                          onDecrement={handleDecrement}
                        />
                      );
                    });
                  })}
              </View>
            )}
          </>
        )}

        {/* List Footer - Receipt Photo Button */}
        {!isListCompleted && (
          <View style={styles.listFooter}>
            {/* View Receipt Button (if receipt exists) */}
            {list?.receiptUrl && (
              <TouchableOpacity
                style={styles.viewReceiptButton}
                onPress={() => navigation.navigate('ReceiptView', { listId })}
              >
                <Icon name="document-text-outline" size={20} color={theme.text.primary} style={styles.viewReceiptIcon} />
                <Text style={styles.viewReceiptText}>View Receipt</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.attachPhotoButton, isListLocked && styles.attachPhotoButtonDisabled]}
              onPress={handleTakeReceiptPhoto}
              disabled={isListLocked}
            >
              <Icon name="camera-outline" size={20} color={theme.text.primary} style={styles.attachPhotoIcon} />
              <Text style={styles.attachPhotoText}>Attach Receipt Photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollViewContainer>

      {/* Primary action - Start Shopping (FAB) */}
      {!isShoppingMode && !isListLocked && !isListCompleted && (
        <FloatingActionButton
          icon="cart"
          onPress={handleStartShopping}
          size={64}
          accessibilityLabel="Start shopping"
        />
      )}

      <PriceEditModal
        visible={activeModal?.type === 'price'}
        item={activeModal?.type === 'price' ? activeModal.item : null}
        recentPrices={activeModal?.type === 'price' ? activeModal.recentPrices : []}
        onClose={closeModal}
        onSave={handlePriceSave}
        onViewPriceHistory={openPriceHistory}
      />

      <SizeEditModal
        visible={activeModal?.type === 'size'}
        item={activeModal?.type === 'size' ? activeModal.item : null}
        onClose={closeModal}
        onSave={handleSizeSave}
      />

      <DetailsEditModal
        visible={activeModal?.type === 'details'}
        item={activeModal?.type === 'details' ? activeModal.item : null}
        onClose={closeModal}
        onSave={handleDetailsSave}
        onDelete={handleDeleteItem}
      />

      <PriceHistoryModal
        visible={activeModal?.type === 'priceHistory'}
        itemName={activeModal?.type === 'priceHistory' ? activeModal.itemName : ''}
        onClose={closeModal}
      />

      <StoreNamePicker
        visible={storePickerMode !== null}
        onClose={() => setStorePickerMode(null)}
        onSelect={storePickerMode === 'banner' ? handleBannerStoreSelected : handleStoreSelected}
        initialValue={list?.storeName || ''}
      />

      <FrequentlyBoughtModal
        visible={frequentItemsVisible}
        onClose={() => setFrequentItemsVisible(false)}
        onAddItem={handleAddFrequentItem}
      />

      <CategoryConflictModal
        visible={conflictModalVisible}
        itemName={pendingItemName}
        categories={conflictCategories}
        onSelectCategory={handleConflictResolved}
        onCancel={() => {
          setConflictModalVisible(false);
          setPendingItemName('');
        }}
      />

      {isCreatingPartialList && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </View>
  );
};

export default ListDetailScreen;

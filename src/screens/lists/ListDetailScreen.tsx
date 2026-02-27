import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Vibration,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import {
  ScrollViewContainer,
  NestedReorderableList,
  useReorderableDrag,
  reorderItems,
  ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedItemCard from '../../components/AnimatedItemCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Item, ShoppingList, StoreLayout, User } from '../../models/types';
import ItemManager from '../../services/ItemManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import LocalStorageManager from '../../services/LocalStorageManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import PricePredictionService from '../../services/PricePredictionService';
import PriceHistoryService from '../../services/PriceHistoryService';
import CategoryService, { CategoryType } from '../../services/CategoryService';
import CategoryHistoryService from '../../services/CategoryHistoryService';
import StoreHistoryService from '../../services/StoreHistoryService';
import StoreLayoutService from '../../services/StoreLayoutService';
import ItemEditModal from '../../components/ItemEditModal';
import StoreNamePicker from '../../components/StoreNamePicker';
import FrequentlyBoughtModal from '../../components/FrequentlyBoughtModal';
import CategoryConflictModal from '../../components/CategoryConflictModal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useAdMob } from '../../contexts/AdMobContext';

// Drag wrapper — must be a real component because useReorderableDrag is a hook.
// Renders children as a render prop, passing drag() so AnimatedItemCard can
// attach it to its own inner touchable (avoiding nested-touchable conflicts).
interface DraggableItemRowProps {
  isListLocked: boolean;
  children: (drag: (() => void) | undefined) => React.ReactNode;
}
const DraggableItemRow: React.FC<DraggableItemRowProps> = ({ isListLocked, children }) => {
  const drag = useReorderableDrag();
  return <>{children(!isListLocked ? drag : undefined)}</>;
};

interface CategoryItemListProps {
  catItems: Item[];
  totalUnchecked: number;
  predictedPrices: Record<string, number>;
  smartSuggestions: Map<string, { bestStore: string; bestPrice: number; savings: number }>;
  storeName?: string;
  isListLocked: boolean;
  onReorder: (items: Item[]) => void;
  onToggleItem: (id: string) => void;
  onItemTap: (item: Item) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  styles: any;
}

const CategoryItemList = memo(({
  catItems,
  totalUnchecked,
  predictedPrices,
  smartSuggestions,
  storeName,
  isListLocked,
  onReorder,
  onToggleItem,
  onItemTap,
  onIncrement,
  onDecrement,
  styles,
}: CategoryItemListProps) => {
  const panGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(250), []);
  return (
    <NestedReorderableList
      panGesture={panGesture}
      data={catItems}
      keyExtractor={(item: Item) => item.id}
      onReorder={({ from, to }: ReorderableListReorderEvent) => onReorder(reorderItems(catItems, from, to))}
      renderItem={({ item }: { item: Item }) => {
        const itemPrice = item.price ?? (item.name ? predictedPrices[item.name.toLowerCase()] : undefined) ?? 0;
        const isPredicted = !item.price && !!item.name && !!predictedPrices[item.name.toLowerCase()];
        const suggestion = item.name ? smartSuggestions.get(item.name.toLowerCase()) : undefined;
        const showSuggestion = !!suggestion && !item.checked && storeName !== suggestion.bestStore;
        return (
          <DraggableItemRow isListLocked={isListLocked}>
            {(drag) => (
              <AnimatedItemCard
                key={item.id}
                index={0}
                item={item}
                itemPrice={itemPrice}
                isPredicted={isPredicted}
                showSuggestion={showSuggestion}
                suggestion={suggestion}
                isListLocked={isListLocked}
                onDrag={drag}
                onToggleItem={() => !isListLocked && onToggleItem(item.id)}
                onItemTap={() => onItemTap(item)}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                itemRowStyle={styles.itemRow}
                itemRowCheckedStyle={styles.itemRowChecked}
                checkboxStyle={styles.checkbox}
                checkboxDisabledStyle={styles.checkboxDisabled}
                checkboxTextDisabledStyle={styles.checkboxTextDisabled}
                checkboxTextCheckedStyle={styles.checkboxTextChecked}
                itemContentTouchableStyle={styles.itemContentTouchable}
                itemContentColumnStyle={styles.itemContentColumn}
                itemContentRowStyle={styles.itemContentRow}
                itemNameTextStyle={styles.itemNameText}
                itemNameCheckedStyle={styles.itemNameChecked}
                itemPriceTextStyle={styles.itemPriceText}
                itemPricePredictedStyle={styles.itemPricePredicted}
                itemPriceCheckedStyle={styles.itemPriceChecked}
                suggestionRowStyle={styles.suggestionRow}
                suggestionTextStyle={styles.suggestionText}
                totalItems={totalUnchecked}
              />
            )}
          </DraggableItemRow>
        );
      }}
    />
  );
});

/**
 * ListDetailScreen
 * Displays and manages items in a shopping list
 * Implements Req 2.4, 3.1-3.6
 */
const ListDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { showInterstitial } = useAdMob();
  const showInterstitialRef = useRef(showInterstitial);
  showInterstitialRef.current = showInterstitial;
  const insets = useSafeAreaInsets();
  const { listId } = route.params as { listId: string };
  const [items, setItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [list, setList] = useState<ShoppingList | null>(null);
  const [listName, setListName] = useState('');
  const [editedListName, setEditedListName] = useState('');
  const [isEditingListName, setIsEditingListName] = useState(false);
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [isListLocked, setIsListLocked] = useState(false);
  const [isListCompleted, setIsListCompleted] = useState(false);
  const [canAddItems, setCanAddItems] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

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
  const [isOnline, setIsOnline] = useState(true);
  const [isShoppingHeaderExpanded, setIsShoppingHeaderExpanded] = useState(false);

  // Store layout state
  // undefined = not yet fetched; null = fetched, no layout found; StoreLayout = fetched and found
  const [storeLayout, setStoreLayout] = useState<StoreLayout | null | undefined>(undefined);

  // Suppresses observer re-renders during an active drag reorder to avoid intermediate state flicker
  const isReorderingRef = useRef(false);

  // Cleanup flag to prevent setState after unmount
  const isMountedRef = React.useRef(true);

  // Debounce map to prevent multiple rapid toggles on same item
  const toggleInProgressRef = React.useRef<Set<string>>(new Set());

  // Ref for optimistic quantity updates (always has latest state for rapid taps)
  const itemsRef = useRef<Item[]>([]);

  // Define calculateShoppingStats before useEffect
  const calculateShoppingStats = useCallback((itemsList: Item[]) => {
    try {
      if (!itemsList || itemsList.length === 0) {
        setCheckedCount(0);
        setUncheckedCount(0);
        setRunningTotal(0);
        return;
      }

      // Filter out invalid items
      const validItems = itemsList.filter(item => item && item.id);

      const checked = validItems.filter(item => item.checked).length;
      const unchecked = validItems.filter(item => !item.checked).length;
      const total = validItems.reduce((sum, item) => {
        const itemNameLower = item.name?.toLowerCase();
        const predictedPrice = itemNameLower && predictedPrices ? predictedPrices[itemNameLower] : 0;
        const price = item.price ?? predictedPrice ?? 0;
        const qty = item.unitQty ?? 1;
        return sum + (price * qty);
      }, 0);

      setCheckedCount(checked);
      setUncheckedCount(unchecked);
      setRunningTotal(total);
    } catch (error) {
      // Set safe defaults on error
      setCheckedCount(0);
      setUncheckedCount(0);
      setRunningTotal(0);
    }
  }, [predictedPrices]);

  useEffect(() => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!listId || !UUID_REGEX.test(listId)) {
      showAlert('Error', 'Invalid list link.', [{ text: 'OK', onPress: () => navigation.goBack() }], { icon: 'error' });
      return;
    }

    // Reset mounted flag
    isMountedRef.current = true;

    // Eager: fast local DB reads needed immediately
    loadListMetadata();
    loadCurrentUser();

    // Deferred: expensive predictions after navigation animation completes
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (isMountedRef.current) {
        loadPredictions();
      }
    });

    // Subscribe to local WatermelonDB changes for the list (triggered by Firebase or local edits)
    const unsubscribeList = ShoppingListManager.subscribeToSingleList(
      listId,
      async (updatedList) => {
        if (!isMountedRef.current) {
          return;
        }

        if (updatedList && currentUserId) {
          setList(updatedList);
          setListName(updatedList.name);
          setIsListCompleted(updatedList.status === 'completed');

          // Check if list is locked
          const locked = await ShoppingListManager.isListLockedForUser(listId, currentUserId);
          setIsListLocked(locked);

          // If locked by current user, enable shopping mode
          if (updatedList.isLocked && updatedList.lockedBy === currentUserId) {
            setIsShoppingMode(true);
          } else {
            setIsShoppingMode(false);
          }

          // If list is completed, only the person who completed it can add items
          if (updatedList.status === 'completed') {
            setCanAddItems(updatedList.completedBy === currentUserId);
          } else {
            setCanAddItems(!locked);
          }
        }
      }
    );

    // Subscribe to local WatermelonDB changes for items (triggered by Firebase or local edits)
    const unsubscribeItems = ItemManager.subscribeToItemChanges(listId, (updatedItems) => {
      if (!isMountedRef.current) {
        return;
      }

      if (!updatedItems) {
        return;
      }

      itemsRef.current = updatedItems;
      if (!isReorderingRef.current) {
        setItems(updatedItems);
      }

      // Calculate shopping mode stats - wrap in try-catch to prevent observer crashes
      try {
        calculateShoppingStats(updatedItems);
      } catch (error) {
        // Silently handle error
      }
    });

    // Subscribe to network status changes
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (isMountedRef.current) {
        setIsOnline(state.isConnected ?? false);
      }
    });

    return () => {
      isMountedRef.current = false;
      interactionHandle.cancel();
      unsubscribeList();
      unsubscribeItems();
      unsubscribeNetInfo();
      // Memory cleanup: clear cached data
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    };
  }, [listId, currentUserId]);

  // Show interstitial ad on list open (with retry for cold starts)
  useEffect(() => {
    const shown = showInterstitialRef.current();
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    if (!shown) {
      retryTimeout = setTimeout(() => {
        showInterstitialRef.current();
      }, 3000);
    }
    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);

  // Start Firebase items listener once we have the list's familyGroupId
  useEffect(() => {
    if (!list?.familyGroupId) return;

    // Start listening to Firebase for remote changes to items in this list
    const unsubscribeFirebaseItems = FirebaseSyncListener.startListeningToItems(
      list.familyGroupId,
      listId
    );

    return () => {
      unsubscribeFirebaseItems();
    };
  }, [list?.familyGroupId, listId]);

  const loadCurrentUser = async () => {
    const user = await AuthenticationModule.getCurrentUser();
    if (user) {
      setCurrentUserId(user.uid);
      setCurrentUser(user);
    }
  };

  const loadListMetadata = async (): Promise<ShoppingList | null> => {
    try {
      const fetchedList = await ShoppingListManager.getListById(listId);
      if (fetchedList) {
        // Security: verify ownership — needed because listId can come from a deep link
        const user = await AuthenticationModule.getCurrentUser();
        if (user?.familyGroupId && fetchedList.familyGroupId !== user.familyGroupId) {
          showAlert(
            'Access Denied',
            'You do not have access to this list.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
            { icon: 'error' }
          );
          return null;
        }
        setList(fetchedList);
        setListName(fetchedList.name);
        setIsListCompleted(fetchedList.status === 'completed');

        // Check if list is locked
        if (currentUserId) {
          const locked = await ShoppingListManager.isListLockedForUser(listId, currentUserId);
          setIsListLocked(locked);

          // If locked by current user, enable shopping mode
          if (fetchedList.isLocked && fetchedList.lockedBy === currentUserId) {
            setIsShoppingMode(true);
          } else {
            setIsShoppingMode(false);
          }

          // If list is completed, only the person who completed it can add items
          if (fetchedList.status === 'completed') {
            setCanAddItems(fetchedList.completedBy === currentUserId);
          } else {
            setCanAddItems(!locked);
          }
        }
        return fetchedList;
      }
      return null;
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      return null;
    }
  };

  const loadPredictions = async () => {
    if (!list?.familyGroupId || itemsRef.current.length === 0) return;
    await predictPricesFromHistory(itemsRef.current, list.familyGroupId);
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

      // Recalculate stats after predictions are loaded
      calculateShoppingStats(itemsList);
    } catch (error) {
      // Don't crash - just continue without predictions
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    }
  }, []);

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
      await ItemManager.addItem(listId, itemName, currentUserId);
      showAlert('Added', `${itemName} added to list`, undefined, { icon: 'success' });
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleToggleItem = async (itemId: string) => {
    // CRITICAL: Prevent multiple simultaneous toggles on same item
    if (toggleInProgressRef.current.has(itemId)) {
      return;
    }

    try {
      // Mark as in progress
      toggleInProgressRef.current.add(itemId);

      // Trigger haptic feedback if enabled (before toggle for instant feedback)
      const hapticEnabled = await AsyncStorage.getItem('hapticFeedbackEnabled');
      if (hapticEnabled === 'true' && Vibration && typeof Vibration.vibrate === 'function') {
        try {
          Vibration.vibrate(50); // Short vibration (50ms)
        } catch (vibrationError) {
          // Vibration not supported - silently ignore
        }
      }

      await ItemManager.toggleItemChecked(itemId);

      // Don't reload - let WatermelonDB observer handle the update
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      // Always clear the in-progress flag
      toggleInProgressRef.current.delete(itemId);
    }
  };

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
    const dbQty = newQty > 1 ? newQty : null;

    const updatedItems = itemsRef.current.map(i =>
      i.id === itemId ? { ...i, unitQty: dbQty } : i
    );
    itemsRef.current = updatedItems;
    setItems(updatedItems);

    ItemManager.updateItem(itemId, { unitQty: dbQty });
  }, []);

  const handleDecrement = useCallback((itemId: string) => {
    const currentItem = itemsRef.current.find(i => i.id === itemId);
    if (!currentItem) return;
    const currentQty = currentItem.unitQty ?? 1;
    const newQty = Math.max(1, currentQty - 1);
    if (newQty === currentQty) return;
    const dbQty = newQty > 1 ? newQty : null;

    const updatedItems = itemsRef.current.map(i =>
      i.id === itemId ? { ...i, unitQty: dbQty } : i
    );
    itemsRef.current = updatedItems;
    setItems(updatedItems);

    ItemManager.updateItem(itemId, { unitQty: dbQty });
  }, []);

  const handleUpdateItem = async (itemId: string, updates: { name?: string; price?: number | null; category?: string | null }) => {
    try {
      await ItemManager.updateItem(itemId, updates);
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      throw error;
    }
  };

  const handleItemTap = (item: Item) => {
    if (isListLocked) return;
    setSelectedItem(item);
    setEditModalVisible(true);
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

  const handleCompleteList = async () => {
    try {
      await ShoppingListManager.markListAsCompleted(listId);
      showAlert('Success', 'Shopping list completed!', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleTakeReceiptPhoto = () => {
    navigation.navigate('ReceiptCamera' as never, { listId } as never);
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
      setIsListLocked(false); // Not locked for current user
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
    ShoppingListManager.completeShoppingFast(listId, currentUserId!, finalTotal, storeName, skippedCount > 0 ? skippedCount : null).catch(() => {});
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

    ShoppingListManager.completeShoppingFast(listId, currentUserId!, finalTotal, storeName, count).catch(() => {});

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

  const handleCategoryDragEnd = (reorderedItems: Item[]) => {
    // Optimistically update UI immediately — onReorder fires synchronously on the UI thread
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
  };

  // Group items by category and sort by sortOrder within each group.
  // Returns separate maps for unchecked and checked items.
  // NOTE: after per-category D&D, sortOrder is a within-category rank (not global).
  // All display code must group by category first, then sort by sortOrder within groups.
  const { uncheckedGrouped, checkedGrouped } = useMemo(() => {
    if (!items || items.length === 0) {
      return { uncheckedGrouped: {} as { [cat: string]: Item[] }, checkedGrouped: {} as { [cat: string]: Item[] } };
    }

    const validItems = items.filter(item => item && item.id);
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
  }, [items]);

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
            <TouchableOpacity style={styles.titleSaveButton} onPress={handleSaveListName} disabled={isListLocked}>
              <Text style={styles.titleSaveButtonText}>✔️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.titleCancelButton} onPress={handleCancelEditListName}>
              <Text style={styles.titleCancelButtonText}>✖️</Text>
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
              >
                <Text style={styles.saveLayoutText}>{isSavingLayout ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            )}
            {!isListLocked && !isLayoutDirty && (
              <TouchableOpacity onPress={handleEditListName}>
                <Text style={styles.editIcon}>✏️</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

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
                <Text style={styles.statusIcon}>🛒</Text>
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
                {!isOnline && <Text style={styles.statusIcon}>📡</Text>}
              </View>
              <View style={styles.statusRight}>
                <TouchableOpacity onPress={() => setIsShoppingHeaderExpanded(true)} style={styles.expandButton}>
                  <Text style={styles.expandIcon}>▼</Text>
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
                <TouchableOpacity onPress={() => setIsShoppingHeaderExpanded(false)} style={styles.collapseButton}>
                  <Text style={styles.expandIcon}>▲</Text>
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
                  <Text style={styles.doneButtonText}>Done Shopping</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Locked State - Priority 2 */}
          {!isShoppingMode && isListLocked && list && (
            <View style={styles.statusContentCompact}>
              <View style={styles.statusLeft}>
                <Text style={styles.statusIcon}>🔒</Text>
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
                <Text style={styles.statusIcon}>✅</Text>
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
          <TouchableOpacity onPress={() => setStorePickerMode('banner')}>
            <Text style={styles.storeWarningLink}>Select Store</Text>
          </TouchableOpacity>
        </View>
      )}

      {list?.storeName && !isListLocked && !isListCompleted && (
        <View style={styles.changeStoreRow}>
          <Text style={styles.changeStoreLabel}>{list.storeName}</Text>
          <TouchableOpacity onPress={() => setStorePickerMode('banner')}>
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
        >
          <Text style={styles.frequentItemsIcon}>🕐</Text>
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
                const totalUnchecked = items.filter(i => !i.checked).length;
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
                          >
                            <Icon name="chevron-up" size={18} color={idx === 0 ? '#3A3A3C' : '#6E6E73'} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleMoveCategory(cat, 'down')}
                            disabled={idx === visibleCategories.length - 1}
                            style={styles.arrowButton}
                          >
                            <Icon name="chevron-down" size={18} color={idx === visibleCategories.length - 1 ? '#3A3A3C' : '#6E6E73'} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <CategoryItemList
                      catItems={catItems}
                      totalUnchecked={totalUnchecked}
                      predictedPrices={predictedPrices}
                      smartSuggestions={smartSuggestions}
                      storeName={list?.storeName}
                      isListLocked={isListLocked}
                      onReorder={handleCategoryDragEnd}
                      onToggleItem={handleToggleItem}
                      onItemTap={handleItemTap}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      styles={styles}
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
                const totalUnchecked = items.filter(item => !item.checked).length;
                return (
                  <View key={`custom-${key}`}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryIcon}>📦</Text>
                      <Text style={styles.categoryName}>{key}</Text>
                    </View>
                    <CategoryItemList
                      catItems={catItems}
                      totalUnchecked={totalUnchecked}
                      predictedPrices={predictedPrices}
                      smartSuggestions={smartSuggestions}
                      storeName={list?.storeName}
                      isListLocked={isListLocked}
                      onReorder={handleCategoryDragEnd}
                      onToggleItem={handleToggleItem}
                      onItemTap={handleItemTap}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      styles={styles}
                    />
                  </View>
                );
              })}

            {/* Checked items — non-draggable */}
            {Object.keys(checkedGrouped).length > 0 && (
              <View>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryIcon}>✅</Text>
                  <Text style={styles.categoryName}>Completed</Text>
                </View>
                {CategoryService.getCategories().map(cat => {
                  const catItems = checkedGrouped[cat.id];
                  if (!catItems?.length) return null;
                  const totalUnchecked = items.filter(item => !item.checked).length;
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
                        onItemTap={() => handleItemTap(item)}
                        onIncrement={handleIncrement}
                        onDecrement={handleDecrement}
                        itemRowStyle={styles.itemRow}
                        itemRowCheckedStyle={styles.itemRowChecked}
                        checkboxStyle={styles.checkbox}
                        checkboxDisabledStyle={styles.checkboxDisabled}
                        checkboxTextDisabledStyle={styles.checkboxTextDisabled}
                        checkboxTextCheckedStyle={styles.checkboxTextChecked}
                        itemContentTouchableStyle={styles.itemContentTouchable}
                        itemContentColumnStyle={styles.itemContentColumn}
                        itemContentRowStyle={styles.itemContentRow}
                        itemNameTextStyle={styles.itemNameText}
                        itemNameCheckedStyle={styles.itemNameChecked}
                        itemPriceTextStyle={styles.itemPriceText}
                        itemPricePredictedStyle={styles.itemPricePredicted}
                        itemPriceCheckedStyle={styles.itemPriceChecked}
                        suggestionRowStyle={styles.suggestionRow}
                        suggestionTextStyle={styles.suggestionText}
                        totalItems={totalUnchecked}
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
                    const totalUnchecked = items.filter(item => !item.checked).length;
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
                          onItemTap={() => handleItemTap(item)}
                          onIncrement={handleIncrement}
                          onDecrement={handleDecrement}
                          itemRowStyle={styles.itemRow}
                          itemRowCheckedStyle={styles.itemRowChecked}
                          checkboxStyle={styles.checkbox}
                          checkboxDisabledStyle={styles.checkboxDisabled}
                          checkboxTextDisabledStyle={styles.checkboxTextDisabled}
                          checkboxTextCheckedStyle={styles.checkboxTextChecked}
                          itemContentTouchableStyle={styles.itemContentTouchable}
                          itemContentColumnStyle={styles.itemContentColumn}
                          itemContentRowStyle={styles.itemContentRow}
                          itemNameTextStyle={styles.itemNameText}
                          itemNameCheckedStyle={styles.itemNameChecked}
                          itemPriceTextStyle={styles.itemPriceText}
                          itemPricePredictedStyle={styles.itemPricePredicted}
                          itemPriceCheckedStyle={styles.itemPriceChecked}
                          suggestionRowStyle={styles.suggestionRow}
                          suggestionTextStyle={styles.suggestionText}
                          totalItems={totalUnchecked}
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
                onPress={() => navigation.navigate('ReceiptView' as never, { listId } as never)}
              >
                <Text style={styles.viewReceiptIcon}>📄</Text>
                <Text style={styles.viewReceiptText}>View Receipt</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.attachPhotoButton, isListLocked && styles.attachPhotoButtonDisabled]}
              onPress={handleTakeReceiptPhoto}
              disabled={isListLocked}
            >
              <Text style={styles.attachPhotoIcon}>📷</Text>
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
          backgroundColor="#34C759"
          size={64}
        />
      )}

      <ItemEditModal
        visible={editModalVisible}
        item={selectedItem}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedItem(null);
        }}
        onSave={handleUpdateItem}
        onDelete={handleDeleteItem}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  editIcon: {
    fontSize: 20,
    padding: 5,
  },
  titleInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  titleSaveButton: {
    backgroundColor: '#00E676',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00C853',
  },
  titleSaveButtonText: {
    fontSize: 20,
  },
  titleCancelButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  titleCancelButtonText: {
    fontSize: 20,
  },
  addItemContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
  },
  addButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 10,
    borderRadius: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  frequentItemsButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 10,
    minWidth: 44,
  },
  frequentItemsIcon: {
    fontSize: 20,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 15,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 8, // Match borderRadius from useColorShiftingBorder
    // borderWidth and borderColor removed - now provided by animated border
  },
  itemRowChecked: {
    // opacity removed - applied to entire Animated.View in AnimatedItemCard
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    // borderColor removed - animated border handles this
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  checkboxDisabled: {
    borderColor: '#6E6E73',
    backgroundColor: 'rgba(110, 110, 115, 0.1)',
    opacity: 0.5,
  },
  checkboxTextDisabled: {
    color: '#6E6E73',
  },
  checkboxTextChecked: {
    color: '#34C759',
    fontWeight: 'bold',
  },
  itemContent: {
    flex: 1,
  },
  itemContentTouchable: {
    flex: 1,
  },
  itemContentColumn: {
    flex: 1,
  },
  itemContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  suggestionRow: {
    marginTop: 4,
  },
  suggestionText: {
    fontSize: 12,
    color: '#30D158',
    fontStyle: 'italic',
  },
  itemNameText: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '400',
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#6E6E73',
  },
  itemPriceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
    minWidth: 60,
    textAlign: 'right',
  },
  itemPricePredicted: {
    color: '#8E8E93',
    fontWeight: '400',
  },
  itemPriceChecked: {
    color: '#6E6E73',
  },
  itemPriceCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
    marginLeft: 8,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
    marginLeft: 8,
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    color: '#6E6E73',
  },
  priceText: {
    fontSize: 14,
    color: '#34C759',
    marginTop: 4,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceInputField: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: 14,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: '#00E676',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  saveButtonText: {
    fontSize: 16,
  },
  deleteButton: {
    fontSize: 20,
    padding: 5,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  // Category headers
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  categoryArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  arrowButton: {
    padding: 4,
  },
  saveLayoutButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  saveLayoutButtonDisabled: {
    opacity: 0.5,
  },
  saveLayoutText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  // FlatList content padding
  listScrollContainer: {
    flex: 1,
  },
  flatListContent: {
    paddingBottom: 100, // Space for FAB
  },
  // List footer with attach photo button
  listFooter: {
    paddingHorizontal: 10,
    paddingTop: 20,
    paddingBottom: 20,
  },
  viewReceiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    gap: 10,
    marginBottom: 10,
  },
  viewReceiptIcon: {
    fontSize: 20,
  },
  viewReceiptText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  attachPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
  },
  attachPhotoButtonDisabled: {
    opacity: 0.5,
  },
  attachPhotoIcon: {
    fontSize: 20,
  },
  attachPhotoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  importButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: 'rgba(52, 199, 89, 0.8)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Smart Status Bar - Consolidated single banner
  smartStatusBar: {
    borderBottomWidth: 1,
    minHeight: 40,
  },
  statusShopping: {
    backgroundColor: 'rgba(52, 199, 89, 0.95)',
    borderBottomColor: 'rgba(52, 199, 89, 0.3)',
  },
  statusLocked: {
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    borderBottomColor: 'rgba(255, 149, 0, 0.3)',
  },
  statusCompleted: {
    backgroundColor: 'rgba(142, 142, 147, 0.9)',
    borderBottomColor: 'rgba(142, 142, 147, 0.3)',
  },
  // Compact view (default)
  statusContentCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusIcon: {
    fontSize: 16,
  },
  statusTextCompact: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  budgetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 4,
  },
  budgetBadgeWarning: {
    backgroundColor: 'rgba(255, 204, 0, 0.9)',
  },
  budgetBadgeOver: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
  },
  budgetBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  expandButton: {
    padding: 4,
  },
  expandIcon: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  doneButtonCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Expanded view
  statusContentExpanded: {
    padding: 16,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandedTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  collapseButton: {
    padding: 4,
  },
  expandedStats: {
    gap: 8,
    marginBottom: 12,
  },
  expandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
  expandedValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  textOk: {
    color: '#fff',
  },
  textWarning: {
    color: '#FFCC00',
  },
  textOver: {
    color: '#FF3B30',
  },
  expandedButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButtonExpanded: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  doneButtonExpanded: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  storeWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 214, 10, 0.3)',
  },
  storeWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#FFD60A',
  },
  storeWarningLink: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
  changeStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  changeStoreLabel: {
    flex: 1,
    fontSize: 13,
    color: '#C7C7CC',
  },
  changeStoreLink: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
});

export default ListDetailScreen;

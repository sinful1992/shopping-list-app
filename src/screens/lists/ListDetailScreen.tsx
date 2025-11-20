import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Item, ShoppingList, User } from '../../models/types';
import ItemManager from '../../services/ItemManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import LocalStorageManager from '../../services/LocalStorageManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import PricePredictionService from '../../services/PricePredictionService';
import PriceHistoryService from '../../services/PriceHistoryService';
import CategoryService from '../../services/CategoryService';
import StoreHistoryService from '../../services/StoreHistoryService';
import ItemEditModal from '../../components/ItemEditModal';
import StoreNamePicker from '../../components/StoreNamePicker';
import FrequentlyBoughtModal from '../../components/FrequentlyBoughtModal';
import { FloatingActionButton } from '../../components/FloatingActionButton';

/**
 * ListDetailScreen
 * Displays and manages items in a shopping list
 * Implements Req 2.4, 3.1-3.6
 */
const ListDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
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

  // Store picker modal state
  const [storePickerVisible, setStorePickerVisible] = useState(false);

  // Frequent items modal state
  const [frequentItemsVisible, setFrequentItemsVisible] = useState(false);

  // Shopping mode UI state
  const [runningTotal, setRunningTotal] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [uncheckedCount, setUncheckedCount] = useState(0);
  const [predictedPrices, setPredictedPrices] = useState<{ [key: string]: number }>({});
  const [smartSuggestions, setSmartSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());
  const [isOnline, setIsOnline] = useState(true);
  const [isShoppingHeaderExpanded, setIsShoppingHeaderExpanded] = useState(false);

  // Cleanup flag to prevent setState after unmount
  const isMountedRef = React.useRef(true);

  // Debounce map to prevent multiple rapid toggles on same item
  const toggleInProgressRef = React.useRef<Set<string>>(new Set());

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
        // Use actual price if available, otherwise use predicted price, otherwise 0
        const itemNameLower = item.name?.toLowerCase();
        const predictedPrice = itemNameLower && predictedPrices ? predictedPrices[itemNameLower] : 0;
        const price = item.price || predictedPrice || 0;
        return sum + price;
      }, 0);

      setCheckedCount(checked);
      setUncheckedCount(unchecked);
      setRunningTotal(total);
    } catch (error) {
      console.error('Error in calculateShoppingStats:', error);
      // Set safe defaults on error
      setCheckedCount(0);
      setUncheckedCount(0);
      setRunningTotal(0);
    }
  }, [predictedPrices]);

  useEffect(() => {
    // Reset mounted flag
    isMountedRef.current = true;

    loadListAndItems();
    loadCurrentUser();

    // Start listening to Firebase for remote changes to items in this list
    // Note: We don't need to listen to ALL lists here - the HomeScreen already does that
    // We only need item-level listeners for this specific list
    const unsubscribeFirebaseItems = FirebaseSyncListener.startListeningToItems(listId);

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

      setItems(updatedItems);

      // Calculate shopping mode stats - wrap in try-catch to prevent observer crashes
      try {
        calculateShoppingStats(updatedItems);
      } catch (error) {
        console.error('Error calculating shopping stats:', error);
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
      unsubscribeFirebaseItems();
      unsubscribeList();
      unsubscribeItems();
      unsubscribeNetInfo();
      // Memory cleanup: clear cached data
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    };
  }, [listId, currentUserId, calculateShoppingStats]);

  const loadCurrentUser = async () => {
    const user = await AuthenticationModule.getCurrentUser();
    if (user) {
      setCurrentUserId(user.uid);
      setCurrentUser(user);
    }
  };

  const loadListAndItems = async () => {
    try {
      const fetchedList = await ShoppingListManager.getListById(listId);
      if (fetchedList) {
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
      }

      const listItems = await ItemManager.getItemsForList(listId);
      setItems(listItems);

      // Predict prices from history when loading items
      await predictPricesFromHistory(listItems);

      calculateShoppingStats(listItems);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const predictPricesFromHistory = useCallback(async (itemsList: Item[]) => {
    if (!list?.familyGroupId || !itemsList) return;

    try {
      // Use cached price prediction service - much faster!
      const predictions = await PricePredictionService.getPredictionsForFamilyGroup(list.familyGroupId);
      setPredictedPrices(predictions);

      // Get smart suggestions for items where there's a price difference across stores
      const itemNames = itemsList.map(item => item.name);
      const suggestions = await PriceHistoryService.getSmartSuggestions(list.familyGroupId, itemNames);
      setSmartSuggestions(suggestions);

      // Recalculate stats after predictions are loaded
      calculateShoppingStats(itemsList);
    } catch (error) {
      console.error('Failed to predict prices:', error);
      // Don't crash - just continue without predictions
      setPredictedPrices({});
      setSmartSuggestions(new Map());
    }
  }, [list?.familyGroupId, calculateShoppingStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadListAndItems();
    setRefreshing(false);
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    if (!currentUserId) return;

    try {
      await ItemManager.addItem(listId, newItemName.trim(), currentUserId);
      setNewItemName('');
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleAddFrequentItem = async (itemName: string) => {
    if (!currentUserId) return;

    try {
      await ItemManager.addItem(listId, itemName, currentUserId);
      Alert.alert('Added', `${itemName} added to list`);
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
          console.log('Vibration not supported:', vibrationError);
        }
      }

      await ItemManager.toggleItemChecked(itemId);

      // Don't reload - let WatermelonDB observer handle the update
      // await loadListAndItems();
    } catch (error: any) {
      console.error('Toggle error:', error.message);
      Alert.alert('Error', error.message);
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
      Alert.alert('Error', error.message);
    }
  };

  const handleUpdateItem = async (itemId: string, updates: { name?: string; price?: number | null; category?: string | null }) => {
    try {
      await ItemManager.updateItem(itemId, updates);
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
      Alert.alert('Error', 'List name cannot be empty');
      return;
    }
    try {
      await ShoppingListManager.updateListName(listId, editedListName.trim());
      setListName(editedListName.trim());
      setIsEditingListName(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCancelEditListName = () => {
    setIsEditingListName(false);
    setEditedListName('');
  };

  const handleCompleteList = async () => {
    try {
      await ShoppingListManager.markListAsCompleted(listId);
      Alert.alert('Success', 'Shopping list completed!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleTakeReceiptPhoto = () => {
    navigation.navigate('ReceiptCamera' as never, { listId } as never);
  };

  const handleStartShopping = () => {
    // Show store picker modal
    setStorePickerVisible(true);
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
      Alert.alert('Shopping Mode', 'You are now shopping. Other family members can only view this list.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };


  const handleDoneShopping = async () => {
    if (!currentUserId) return;

    try {
      await ShoppingListManager.completeShoppingAndUnlock(listId, currentUserId);
      setIsShoppingMode(false);
      // WatermelonDB observer will automatically update the list state
      Alert.alert('Shopping Complete!', 'Your shopping list has been completed and saved to history.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const renderItem = ({ item: row }: { item: { type: 'header' | 'item'; category?: string; item?: Item } }) => {
    // Render category headers
    if (row.type === 'header') {
      const category = CategoryService.getCategory(row.category as any);
      return (
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryIcon}>{category?.icon || '📦'}</Text>
          <Text style={styles.categoryName}>{category?.name || row.category}</Text>
        </View>
      );
    }

    // Render items
    const item = row.item;
    if (!item || !item.id) {
      return null;
    }

    const itemPrice = item.price || (item.name && predictedPrices[item.name.toLowerCase()]) || 0;
    const isPredicted = !item.price && item.name && predictedPrices[item.name.toLowerCase()];
    const suggestion = item.name ? smartSuggestions.get(item.name.toLowerCase()) : null;
    const showSuggestion = suggestion && !item.checked && list?.storeName !== suggestion.bestStore;

    return (
      <View style={[
        styles.itemRow,
        item.checked === true && styles.itemRowChecked
      ]}>
        <TouchableOpacity
          style={[styles.checkbox, isListLocked && styles.checkboxDisabled]}
          onPress={() => !isListLocked && handleToggleItem(item.id)}
          disabled={isListLocked}
        >
          <Text style={isListLocked && styles.checkboxTextDisabled}>{item.checked === true ? '✓' : ' '}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.itemContentTouchable}
          onPress={() => handleItemTap(item)}
          disabled={isListLocked}
          activeOpacity={0.7}
        >
          <View style={styles.itemContentColumn}>
            <View style={styles.itemContentRow}>
              <Text
                style={[
                  styles.itemNameText,
                  item.checked === true && styles.itemNameChecked
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text
                style={[
                  styles.itemPriceText,
                  isPredicted ? styles.itemPricePredicted : null,
                  item.checked === true ? styles.itemPriceChecked : null
                ]}
              >
                {isPredicted ? '~' : ''}£{itemPrice.toFixed(2)}
              </Text>
            </View>
            {showSuggestion && (
              <View style={styles.suggestionRow}>
                <Text style={styles.suggestionText}>
                  💡 £{suggestion.bestPrice.toFixed(2)} at {suggestion.bestStore} (save £{suggestion.savings.toFixed(2)})
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Group items by category and sort by sortOrder
  const groupedItems = useMemo(() => {
    if (!items || items.length === 0) {
      return [];
    }

    // Filter out any null/undefined items
    const validItems = items.filter(item => item && item.id);

    // Group items by checked status first, then by category
    const unchecked = validItems.filter(item => !item.checked);
    const checked = validItems.filter(item => item.checked);

    // Function to group items by category
    const groupByCategory = (itemsList: Item[]) => {
      const grouped: { [category: string]: Item[] } = {};

      itemsList.forEach(item => {
        const category = item.category || 'Other';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(item);
      });

      // Sort items within each category by sortOrder (drag-and-drop), fallback to createdAt
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

    // Flatten groups in order of category sort order
    const result: Array<{ type: 'header' | 'item'; category?: string; item?: Item }> = [];

    // Add unchecked items by category
    const categories = CategoryService.getCategories();
    categories.forEach(cat => {
      const catItems = uncheckedGrouped[cat.id];
      if (catItems && catItems.length > 0) {
        result.push({ type: 'header', category: cat.id });
        catItems.forEach(item => result.push({ type: 'item', item }));
      }
    });

    // Add "Other" category unchecked items (items with no category or unrecognized category)
    Object.keys(uncheckedGrouped).forEach(catKey => {
      if (!categories.some(c => c.id === catKey)) {
        const catItems = uncheckedGrouped[catKey];
        if (catItems && catItems.length > 0) {
          result.push({ type: 'header', category: 'Other' });
          catItems.forEach(item => result.push({ type: 'item', item }));
        }
      }
    });

    // Add checked items (with less prominence, can optionally collapse)
    const hasCheckedItems = Object.keys(checkedGrouped).length > 0;
    if (hasCheckedItems) {
      result.push({ type: 'header', category: 'Completed' });
      categories.forEach(cat => {
        const catItems = checkedGrouped[cat.id];
        if (catItems && catItems.length > 0) {
          catItems.forEach(item => result.push({ type: 'item', item }));
        }
      });
      // Add checked "Other" items
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

  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
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
            {!isListLocked && (
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
              <TouchableOpacity style={styles.doneButtonExpanded} onPress={handleDoneShopping}>
                <Text style={styles.doneButtonText}>Done Shopping</Text>
              </TouchableOpacity>
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

      <FlatList
        data={groupedItems}
        keyExtractor={(row, index) => {
          if (row.type === 'header') {
            return `header-${row.category}`;
          }
          return row.item?.id || `item-${index}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        // Performance optimizations
        getItemLayout={(data, index) => ({
          length: 66, // Approximate item height (padding + content)
          offset: 66 * index,
          index,
        })}
        maxToRenderPerBatch={15}
        windowSize={10}
        removeClippedSubviews={true}
        initialNumToRender={20}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        }
        ListFooterComponent={
          !isListCompleted ? (
            <View style={styles.listFooter}>
              <TouchableOpacity
                style={[styles.attachPhotoButton, isListLocked && styles.attachPhotoButtonDisabled]}
                onPress={handleTakeReceiptPhoto}
                disabled={isListLocked}
              >
                <Text style={styles.attachPhotoIcon}>📷</Text>
                <Text style={styles.attachPhotoText}>Attach Receipt Photo</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

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
        visible={storePickerVisible}
        onClose={() => setStorePickerVisible(false)}
        onSelect={handleStoreSelected}
        initialValue={list?.storeName || ''}
      />

      <FrequentlyBoughtModal
        visible={frequentItemsVisible}
        onClose={() => setFrequentItemsVisible(false)}
        onAddItem={handleAddFrequentItem}
      />
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
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    gap: 10,
  },
  title: {
    fontSize: 24,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  itemRowChecked: {
    opacity: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
  // FlatList content padding
  flatListContent: {
    paddingBottom: 100, // Space for FAB
  },
  // List footer with attach photo button
  listFooter: {
    paddingHorizontal: 10,
    paddingTop: 20,
    paddingBottom: 20,
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
  doneButtonExpanded: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  // Old styles (kept for backwards compatibility, can be removed later)
  lockedBanner: {
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 149, 0, 0.3)',
  },
  lockedBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Compact sticky header for shopping mode (40-60px)
  shoppingModeHeader: {
    backgroundColor: 'rgba(52, 199, 89, 0.95)',
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(52, 199, 89, 0.3)',
  },
  shoppingModeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  shoppingModeIcon: {
    fontSize: 20,
  },
  shoppingModeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shoppingModeTotal: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  shoppingModeCounter: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  budgetIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 4,
  },
  budgetUnderLimit: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  budgetNearLimit: {
    backgroundColor: 'rgba(255, 204, 0, 0.3)',
  },
  budgetOverLimit: {
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
  },
  budgetText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  offlineIndicator: {
    backgroundColor: 'rgba(255, 149, 0, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 4,
  },
  offlineIcon: {
    fontSize: 14,
  },
  doneShoppingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  doneShoppingButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  completedBanner: {
    backgroundColor: 'rgba(52, 199, 89, 0.8)',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(52, 199, 89, 0.3)',
  },
  completedBannerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ListDetailScreen;

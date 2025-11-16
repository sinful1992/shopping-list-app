import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Item, ShoppingList } from '../../models/types';
import ItemManager from '../../services/ItemManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import LocalStorageManager from '../../services/LocalStorageManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';

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
  const [itemPrices, setItemPrices] = useState<{ [key: string]: string }>({});
  const [itemNames, setItemNames] = useState<{ [key: string]: string }>({});
  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [isListLocked, setIsListLocked] = useState(false);
  const [isListCompleted, setIsListCompleted] = useState(false);
  const [canAddItems, setCanAddItems] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Shopping mode UI state
  const [runningTotal, setRunningTotal] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [uncheckedCount, setUncheckedCount] = useState(0);
  const [predictedPrices, setPredictedPrices] = useState<{ [key: string]: number }>({});
  const [isOnline, setIsOnline] = useState(true);

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

    // Step 1: Start listening to Firebase for remote changes to this list
    const unsubscribeFirebaseList = FirebaseSyncListener.startListeningToLists(
      list?.familyGroupId || ''
    );

    // Step 2: Start listening to Firebase for remote changes to items in this list
    const unsubscribeFirebaseItems = FirebaseSyncListener.startListeningToItems(listId);

    // Step 3: Subscribe to local WatermelonDB changes for the list (triggered by Firebase or local edits)
    const unsubscribeList = ShoppingListManager.subscribeToSingleList(
      listId,
      async (updatedList) => {
        if (!isMountedRef.current) {
          console.log('[OBSERVER] Component unmounted, skipping list update');
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

    // Step 4: Subscribe to local WatermelonDB changes for items (triggered by Firebase or local edits)
    const unsubscribeItems = ItemManager.subscribeToItemChanges(listId, (updatedItems) => {
      if (!isMountedRef.current) {
        console.log('[OBSERVER] Component unmounted, skipping items update');
        return;
      }

      if (!updatedItems) {
        console.log('[OBSERVER] updatedItems is null/undefined');
        return;
      }

      console.log('[OBSERVER] Items updated', {
        count: updatedItems.length,
        itemIds: updatedItems.map(i => i?.id).filter(Boolean),
        checkedStates: updatedItems.map(i => ({ id: i?.id, checked: i?.checked })),
        timestamp: new Date().toISOString()
      });

      setItems(updatedItems);

      // Calculate shopping mode stats - wrap in try-catch to prevent observer crashes
      try {
        calculateShoppingStats(updatedItems);
      } catch (error) {
        console.error('[OBSERVER ERROR] Error calculating shopping stats:', error);
      }
    });

    // Step 5: Subscribe to network status changes
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (isMountedRef.current) {
        setIsOnline(state.isConnected ?? false);
      }
    });

    return () => {
      console.log('[CLEANUP] Component unmounting, setting isMountedRef to false');
      isMountedRef.current = false;
      unsubscribeFirebaseList();
      unsubscribeFirebaseItems();
      unsubscribeList();
      unsubscribeItems();
      unsubscribeNetInfo();
    };
  }, [listId, currentUserId, calculateShoppingStats]);

  const loadCurrentUser = async () => {
    const user = await AuthenticationModule.getCurrentUser();
    if (user) {
      setCurrentUserId(user.uid);
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
      // Get all completed lists for this family group
      const allLists = await ShoppingListManager.getAllLists(list.familyGroupId);
      const completedLists = allLists.filter(l => l.status === 'completed' && l.id !== listId);

      // Collect all items from completed lists
      const historicalItems: Item[] = [];
      for (const completedList of completedLists) {
        const items = await ItemManager.getItemsForList(completedList.id);
        if (items && Array.isArray(items)) {
          historicalItems.push(...items);
        }
      }

      // Calculate average prices for each item name
      const priceMap: { [key: string]: number[] } = {};
      for (const item of historicalItems) {
        if (item && item.name && item.price && item.price > 0) {
          const itemName = item.name.toLowerCase();
          if (!priceMap[itemName]) {
            priceMap[itemName] = [];
          }
          priceMap[itemName].push(item.price);
        }
      }

      // Calculate averages
      const predictions: { [key: string]: number } = {};
      for (const itemName in priceMap) {
        const prices = priceMap[itemName];
        if (prices && prices.length > 0) {
          const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
          predictions[itemName] = Math.round(average * 100) / 100; // Round to 2 decimal places
        }
      }

      setPredictedPrices(predictions);

      // Recalculate stats after predictions are loaded
      calculateShoppingStats(itemsList);
    } catch (error) {
      console.error('Failed to predict prices:', error);
      // Don't crash - just continue without predictions
      setPredictedPrices({});
    }
  }, [list?.familyGroupId, listId, calculateShoppingStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadListAndItems();
    setRefreshing(false);
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) return;

      await ItemManager.addItem(listId, newItemName.trim(), user.uid);
      setNewItemName('');
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleToggleItem = async (itemId: string) => {
    // CRITICAL: Prevent multiple simultaneous toggles on same item
    if (toggleInProgressRef.current.has(itemId)) {
      console.warn('[TOGGLE] Toggle already in progress for item, ignoring', { itemId });
      return;
    }

    try {
      // Mark as in progress
      toggleInProgressRef.current.add(itemId);

      // DEBUG: Find current item state before toggle
      const currentItem = items.find(i => i?.id === itemId);
      console.log('[TOGGLE START]', {
        itemId,
        itemName: currentItem?.name,
        currentChecked: currentItem?.checked,
        timestamp: new Date().toISOString(),
        totalItems: items.length,
        sortedItemsCount: sortedItems.length,
        inProgressCount: toggleInProgressRef.current.size
      });

      // Trigger haptic feedback if enabled (before toggle for instant feedback)
      const hapticEnabled = await AsyncStorage.getItem('hapticFeedbackEnabled');
      if (hapticEnabled === 'true' && Vibration && typeof Vibration.vibrate === 'function') {
        try {
          Vibration.vibrate(50); // Short vibration (50ms)
        } catch (vibrationError) {
          console.log('Vibration not supported:', vibrationError);
        }
      }

      console.log('[TOGGLE] Calling ItemManager.toggleItemChecked');
      await ItemManager.toggleItemChecked(itemId);
      console.log('[TOGGLE] ItemManager.toggleItemChecked completed successfully');

      // Don't reload - let WatermelonDB observer handle the update
      // await loadListAndItems();
    } catch (error: any) {
      console.error('[TOGGLE ERROR]', {
        itemId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      Alert.alert('Error', error.message);
    } finally {
      // Always clear the in-progress flag
      toggleInProgressRef.current.delete(itemId);
      console.log('[TOGGLE] Cleared in-progress flag for', { itemId });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await ItemManager.deleteItem(itemId);
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handlePriceChange = (itemId: string, text: string) => {
    setItemPrices(prev => ({ ...prev, [itemId]: text }));
  };

  const handleSavePrice = async (itemId: string) => {
    const priceText = itemPrices[itemId];
    const price = priceText ? parseFloat(priceText) : null;
    if (priceText && (price === null || isNaN(price))) {
      Alert.alert('Error', 'Please enter a valid number');
      return;
    }
    try {
      await ItemManager.updateItem(itemId, { price });
      setItemPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[itemId];
        return newPrices;
      });
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleNameChange = (itemId: string, text: string) => {
    setItemNames(prev => ({ ...prev, [itemId]: text }));
  };

  const handleSaveName = async (itemId: string) => {
    const nameText = itemNames[itemId];
    if (!nameText || !nameText.trim()) {
      Alert.alert('Error', 'Item name cannot be empty');
      return;
    }
    try {
      await ItemManager.updateItem(itemId, { name: nameText.trim() });
      setItemNames(prev => {
        const newNames = { ...prev };
        delete newNames[itemId];
        return newNames;
      });
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
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

  const handleImportReceiptItems = async () => {
    try {
      const receiptData = await LocalStorageManager.getReceiptData(listId);
      if (!receiptData || !receiptData.lineItems || receiptData.lineItems.length === 0) {
        Alert.alert('No Items', 'No receipt items found to import');
        return;
      }

      // Get existing items to check for duplicates
      const existingItems = await ItemManager.getItemsForList(listId);
      const existingNames = new Set(existingItems.map(i => i.name.toLowerCase().trim()));

      // Filter out duplicates
      const newItems = receiptData.lineItems.filter(
        lineItem => !existingNames.has(lineItem.description.toLowerCase().trim())
      );

      if (newItems.length === 0) {
        Alert.alert('No New Items', 'All receipt items already exist in the list');
        return;
      }

      const duplicateCount = receiptData.lineItems.length - newItems.length;
      const message = duplicateCount > 0
        ? `Import ${newItems.length} new items?\n(${duplicateCount} duplicates skipped)`
        : `Import ${newItems.length} items from receipt?`;

      Alert.alert(
        'Import Items',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              const user = await AuthenticationModule.getCurrentUser();
              if (!user) return;

              try {
                // Import each new line item
                for (const lineItem of newItems) {
                  await ItemManager.addItem(
                    listId,
                    lineItem.description,
                    user.uid,
                    lineItem.quantity?.toString() || undefined,
                    lineItem.price || undefined
                  );
                }

                await loadListAndItems();
                Alert.alert('Success', `Imported ${newItems.length} items successfully!`);
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleTakeReceiptPhoto = () => {
    navigation.navigate('ReceiptCamera' as never, { listId } as never);
  };

  const handleStartShopping = async () => {
    if (!currentUserId) return;

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) return;

      await ShoppingListManager.lockListForShopping(
        listId,
        currentUserId,
        user.displayName,
        user.role || null
      );
      setIsShoppingMode(true);
      setIsListLocked(false); // Not locked for current user
      await loadListAndItems(); // Reload to get updated list
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
      await loadListAndItems(); // Reload to get updated list
      Alert.alert('Shopping Complete!', 'Your shopping list has been completed and saved to history.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const renderItem = ({ item }: { item: Item }) => {
    // Safety check - don't render if item is invalid
    if (!item || !item.id) {
      console.error('[RENDER] Invalid item received in renderItem:', item);
      return null;
    }

    // Additional defensive checks
    if (typeof item.checked !== 'boolean' && item.checked !== undefined) {
      console.warn('[RENDER] Item has non-boolean checked value:', { id: item.id, checked: item.checked });
    }

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
        <View style={styles.itemContent}>
          <View style={styles.nameInputRow}>
            <TextInput
              style={[styles.nameInputField, item.checked === true && styles.itemChecked]}
              placeholder="Item name"
              placeholderTextColor="#6E6E73"
              value={itemNames[item.id] !== undefined ? itemNames[item.id] : (item.name || '')}
              onChangeText={(text) => handleNameChange(item.id, text)}
              editable={canAddItems}
            />
          {itemNames[item.id] !== undefined && itemNames[item.id] !== item.name && canAddItems && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSaveName(item.id)}
            >
              <Text style={styles.saveButtonText}>✔️</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.priceInputFieldInline}
            placeholder={
              item.name && predictedPrices[item.name.toLowerCase()]
                ? `~£${predictedPrices[item.name.toLowerCase()].toFixed(2)}`
                : "£0.00"
            }
            placeholderTextColor="#6E6E73"
            value={itemPrices[item.id] !== undefined ? itemPrices[item.id] : (item.price?.toString() || '')}
            onChangeText={(text) => handlePriceChange(item.id, text)}
            keyboardType="numeric"
            editable={canAddItems}
          />
          {itemPrices[item.id] !== undefined && canAddItems && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSavePrice(item.id)}
            >
              <Text style={styles.saveButtonText}>✔️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={() => handleDeleteItem(item.id)} disabled={isListLocked}>
        <Text style={styles.deleteButton}>🗑</Text>
      </TouchableOpacity>
    </View>
    );
  };

  // Memoize sorted items to prevent unnecessary re-sorts and maintain stable keys
  const sortedItems = useMemo(() => {
    console.log('[SORT] Starting sort operation', {
      itemsCount: items?.length || 0,
      timestamp: new Date().toISOString()
    });

    if (!items || items.length === 0) {
      console.log('[SORT] No items to sort, returning empty array');
      return [];
    }

    // Filter out any null/undefined items before sorting
    const validItems = items.filter(item => item && item.id);
    console.log('[SORT] Valid items after filtering', {
      validCount: validItems.length,
      filteredOut: items.length - validItems.length
    });

    // Create explicit copy before sorting to prevent any mutation
    const itemsCopy = validItems.map(item => item);

    const sorted = itemsCopy.sort((a, b) => {
      // Primary sort: unchecked items first, checked items at bottom
      if (a.checked !== b.checked) {
        return a.checked ? 1 : -1;
      }
      // Secondary sort: by creation time (stable sort within each group)
      // This ensures items maintain consistent positions when moving between groups
      return a.createdAt - b.createdAt;
    });

    console.log('[SORT] Sort completed', {
      sortedCount: sorted.length,
      sortedIds: sorted.map(i => i.id),
      checkedStates: sorted.map(i => ({ id: i.id, checked: i.checked })),
      timestamp: new Date().toISOString()
    });

    return sorted;
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

      {isListLocked && list && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>
            🔒 {list.lockedByRole || list.lockedByName || 'Someone'} is shopping now!
          </Text>
        </View>
      )}

      {isShoppingMode && (
        <View style={styles.shoppingModeHeader}>
          <View style={styles.shoppingModeLeft}>
            <Text style={styles.shoppingModeIcon}>🛒</Text>
            <View style={styles.shoppingModeStats}>
              <Text style={styles.shoppingModeTotal}>
                £{runningTotal.toFixed(2)}
              </Text>
              <Text style={styles.shoppingModeCounter}>
                {checkedCount}/{checkedCount + uncheckedCount}
              </Text>
            </View>
            {list?.budget && (
              <View style={[
                styles.budgetIndicator,
                runningTotal > list.budget ? styles.budgetOverLimit :
                runningTotal > list.budget * 0.8 ? styles.budgetNearLimit :
                styles.budgetUnderLimit
              ]}>
                <Text style={styles.budgetText}>
                  {list.budget ? `£${list.budget}` : ''}
                </Text>
              </View>
            )}
            {!isOnline && (
              <View style={styles.offlineIndicator}>
                <Text style={styles.offlineIcon}>📡</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.doneShoppingButton} onPress={handleDoneShopping}>
            <Text style={styles.doneShoppingButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {isListCompleted && !canAddItems && (
        <View style={styles.completedBanner}>
          <Text style={styles.completedBannerText}>
            ✅ List completed - Only the shopper can add missing items
          </Text>
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
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem} disabled={!canAddItems}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {list?.receiptData?.lineItems && list.receiptData.lineItems.length > 0 && (
        <TouchableOpacity style={styles.importButton} onPress={handleImportReceiptItems}>
          <Text style={styles.importButtonText}>📋 Import Receipt Items</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={sortedItems}
        keyExtractor={(item) => {
          // CRITICAL: Add null safety to prevent native crashes
          if (!item || !item.id) {
            console.error('[FLATLIST] keyExtractor received invalid item:', item);
            return `fallback-${Math.random()}`; // Fallback to prevent crash
          }
          return item.id;
        }}
        renderItem={renderItem}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={['#007AFF']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        }
      />

      <View style={styles.buttonContainer}>
        {!isShoppingMode && !isListLocked && !isListCompleted && (
          <TouchableOpacity style={styles.startShoppingButton} onPress={handleStartShopping}>
            <Text style={styles.startShoppingButtonText}>🛒 Start Shopping</Text>
          </TouchableOpacity>
        )}
        {!isListCompleted && (
          <TouchableOpacity style={styles.receiptButton} onPress={handleTakeReceiptPhoto} disabled={isListLocked}>
            <Text style={styles.receiptButtonText}>📷 Take Receipt Photo</Text>
          </TouchableOpacity>
        )}
      </View>
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
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInputField: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: 16,
  },
  priceInputFieldInline: {
    width: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#34C759',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
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
  buttonContainer: {
    padding: 10,
  },
  receiptButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 16,
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  receiptButtonText: {
    color: '#fff',
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
  startShoppingButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 16,
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  startShoppingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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

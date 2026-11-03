import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { Theme } from '../../styles/theme';
import { NUMERIC } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useUser } from '../../contexts/UserContext';
import CrashReporting from '../../services/CrashReporting';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { HistoryStackParamList } from '../../types/navigation';
import HistoryTracker from '../../services/HistoryTracker';
import ItemManager from '../../services/ItemManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import ShoppingListManager from '../../services/ShoppingListManager';
import PriceHistoryService, { PriceStats } from '../../services/PriceHistoryService';
import { ListDetails, Item, ShoppingList } from '../../models/types';
import PriceEditModal from '../../components/PriceEditModal';
import PriceHistoryModal from '../../components/PriceHistoryModal';
import { calculateShoppingStats } from '../../utils/shoppingStats';
import Icon from 'react-native-vector-icons/Ionicons';

// A receipt push is sent as soon as the scanning phone completes the trip
// locally, so the list can reach Firebase a moment after the push does.
const LIST_RETRY_DELAYS_MS = [0, 1500, 3000];
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Synced data is not type-checked: a number can arrive as a string.
function toAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normaliseList(list: ShoppingList): ShoppingList {
  return { ...list, totalAmount: toAmount(list.totalAmount) };
}

function normaliseItem(item: Item): Item {
  return { ...item, name: item.name ?? '', price: toAmount(item.price) };
}

type Missing = 'notFound' | 'deleted';

/**
 * HistoryDetailScreen
 * Display details of a completed shopping trip
 * Implements Req 8.3, 8.4
 */
const HistoryDetailScreen = () => {
  const route = useRoute<RouteProp<HistoryStackParamList, 'HistoryDetail'>>();
  const navigation = useNavigation<StackNavigationProp<HistoryStackParamList>>();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { listId } = route.params;
  const user = useUser();
  const familyGroupId = user?.familyGroupId ?? null;

  const [loading, setLoading] = useState(true);
  const [listDetails, setListDetails] = useState<ListDetails | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [priceHistoryItem, setPriceHistoryItem] = useState<Item | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [priceHistoryModalItemName, setPriceHistoryModalItemName] = useState<string | null>(null);
  const [priceStats, setPriceStats] = useState<Map<string, PriceStats>>(new Map());
  const [smartSuggestions, setSmartSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());
  const priceStatsLoadedRef = useRef(false);
  const [missing, setMissing] = useState<Missing | null>(null);
  const loadTokenRef = useRef(0);

  // Reload when listId changes, not just on mount: a deep link (e.g. a
  // receipt-scanned notification) can retarget this already-mounted screen at a
  // different list, and React Navigation reuses the instance rather than
  // remounting. Reset the price-stats guard so the new list recomputes its stats.
  // Also reload when the family group arrives: a cold start from a push mounts
  // this screen before the signed-in user is known, and the Firebase fallback
  // below needs the group.
  useEffect(() => {
    priceStatsLoadedRef.current = false;
    loadListDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, familyGroupId]);

  // Load price stats once after items first arrive
  useEffect(() => {
    const listGroupId = listDetails?.list.familyGroupId;
    if (!listGroupId || items.length === 0 || priceStatsLoadedRef.current) return;
    priceStatsLoadedRef.current = true;

    const loadPriceStats = async () => {
      try {
        const statsMap = new Map<string, PriceStats>();
        const suggestionsMap = new Map<string, { bestStore: string; bestPrice: number; savings: number }>();

        const uniqueNames = [...new Set(items.map(item => item.name.toLowerCase()))];
        const suggestions = await PriceHistoryService.getSmartSuggestions(listGroupId, uniqueNames);

        await Promise.all(uniqueNames.map(async (name) => {
          const stats = await PriceHistoryService.getPriceStats(listGroupId, name);
          if (stats) statsMap.set(name, stats);
          const suggestion = suggestions.get(name);
          if (suggestion) suggestionsMap.set(name, suggestion);
        }));

        setPriceStats(statsMap);
        setSmartSuggestions(suggestionsMap);
      } catch {
        // Price stats are non-critical, don't block UI
      }
    };
    loadPriceStats();
  }, [items, listDetails?.list.familyGroupId]);

  /**
   * The local trip, or the one in Firebase when this device has not synced it
   * yet (a push opens this screen straight from a cold start). Null when
   * neither has it.
   */
  const findListDetails = async (isCurrent: () => boolean): Promise<ListDetails | null> => {
    try {
      return await HistoryTracker.getListDetails(listId);
    } catch (localError) {
      if (!familyGroupId) return null;
      for (const delay of LIST_RETRY_DELAYS_MS) {
        if (delay > 0) await wait(delay);
        if (!isCurrent()) return null;
        try {
          const list = await FirebaseSyncListener.fetchListOnceForHistory(familyGroupId, listId);
          if (list) return { list, items: [], receiptData: list.receiptData };
        } catch (error) {
          CrashReporting.recordError(error as Error, 'HistoryDetailScreen fetchListOnceForHistory');
          return null;
        }
      }
      CrashReporting.recordError(localError as Error, 'HistoryDetailScreen list not found');
      return null;
    }
  };

  const loadListDetails = async () => {
    const token = ++loadTokenRef.current;
    const isCurrent = () => token === loadTokenRef.current;
    try {
      setLoading(true);
      const found = await findListDetails(isCurrent);
      if (!isCurrent()) return;
      if (!found || found.list.status === 'deleted') {
        setMissing(found ? 'deleted' : 'notFound');
        setListDetails(null);
        setItems([]);
        return;
      }
      setMissing(null);
      const details = { ...found, list: normaliseList(found.list) };

      let loadedItems = details.items.map(normaliseItem);
      if (details.list.familyGroupId) {
        try {
          const firebaseItems = await FirebaseSyncListener.fetchItemsOnceForHistory(
            details.list.familyGroupId,
            listId
          );
          if (firebaseItems.length > 0) {
            loadedItems = firebaseItems.map(normaliseItem);
          }
        } catch {
          // fall back to local items already in loadedItems
        }
      }

      // Backfill totalAmount from item prices when not yet saved (including zero)
      let resolvedList = details.list;
      if (details.list.totalAmount == null && loadedItems.length > 0) {
        const calcTotal = calculateShoppingStats(loadedItems, null).total;
        await ShoppingListManager.updateList(listId, { totalAmount: calcTotal });
        resolvedList = { ...details.list, totalAmount: calcTotal };
      }

      if (!isCurrent()) return;
      setListDetails({ ...details, list: resolvedList });
      setItems(loadedItems);
    } catch (error: any) {
      if (!isCurrent()) return;
      CrashReporting.recordError(error as Error, 'HistoryDetailScreen loadListDetails');
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  const handleDeleteList = () => {
    showAlert(
      'Delete Shopping Trip',
      'Are you sure you want to delete this shopping trip? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ShoppingListManager.deleteList(listId);
              showAlert('Success', 'Shopping trip deleted', undefined, { icon: 'success' });
              navigation.goBack();
            } catch (error: any) {
              showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
    );
  };

  const handleViewReceipt = () => {
    navigation.navigate('ReceiptView', { listId });
  };

  const handleItemPress = (item: Item) => {
    if (item.price != null && item.price > 0) {
      setPriceHistoryItem(item);
      return;
    }
    setSelectedItem(item);
    setEditModalVisible(true);
  };

  const handleSaveItem = async (
    itemId: string,
    updates: { price?: number | null }
  ) => {
    await ItemManager.updateItem(itemId, updates);

    // A scanned receipt's total is what was paid; only a trip without one takes its total from the items.
    // Done Shopping saves an empty receiptData placeholder, so that one is not a scan.
    if (updates.price !== undefined && listDetails) {
      const newItems = items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      const newTotal = calculateShoppingStats(newItems, null).total;

      const { receiptUrl, receiptData } = listDetails.list;
      const scanned = !!receiptUrl || (receiptData?.lineItems?.length ?? 0) > 0;
      if (!scanned && newTotal !== listDetails.list.totalAmount) {
        await ShoppingListManager.updateList(listId, { totalAmount: newTotal });
      }

      // Reload to refresh receiptData total
      await loadListDetails();
    }
  };

  // Calculate total from item prices
  const calculatedTotal = useMemo(() => {
    return calculateShoppingStats(items, null).total;
  }, [items]);

  const { uncheckedItems, checkedItems } = useMemo(() => ({
    uncheckedItems: items.filter(i => !i.checked),
    checkedItems: items.filter(i => i.checked),
  }), [items]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.accent.blue} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!listDetails) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {missing === 'deleted'
            ? 'This shopping trip was deleted'
            : 'This shopping trip is not on this phone yet. Check your connection and open it again from History.'}
        </Text>
      </View>
    );
  }

  const { list } = listDetails;

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollView}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.listName}>{list.name}</Text>
        <Text style={styles.listDate}>
          {new Date(list.completedAt || list.createdAt || 0).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
          {list.storeName && ` / ${list.storeName}`}
        </Text>
        <Text style={styles.totalAmount}>
          Total: £{(list.totalAmount && list.totalAmount > 0
            ? list.totalAmount
            : calculatedTotal
          ).toFixed(2)}
        </Text>
      </View>

      {/* Items Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items ({checkedItems.length}/{items.length} bought)</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>This trip was completed without any items</Text>
        ) : (
          <>
            {uncheckedItems.length > 0 && (
              <>
                <View style={styles.subSectionHeaderNotPurchased}>
                  <Text style={styles.subSectionTitleNotPurchased}>
                    Not Purchased ({uncheckedItems.length})
                  </Text>
                </View>
                <View style={styles.itemsContainer}>
                  {uncheckedItems.map((item) => {
                    const hasPrice = item.price != null && item.price > 0;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.itemRow}
                        onPress={() => handleItemPress(item)}
                      >
                        <View style={styles.checkboxContainer}>
                          <View style={styles.checkboxUnchecked} />
                        </View>
                        <View style={styles.itemContent}>
                          <View style={styles.itemNameRow}>
                            <Text style={[styles.itemName, styles.itemNameNotPurchased]}>
                              {item.name}
                            </Text>
                          </View>
                          <View style={styles.priceRow}>
                            {hasPrice ? (
                              <Text style={[styles.itemPrice, styles.itemPriceNotPurchased]}>
                                £{item.price!.toFixed(2)}
                              </Text>
                            ) : (
                              <Text style={styles.addPricePrompt}>+ set price</Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={[styles.subSectionHeaderPurchased, uncheckedItems.length > 0 && styles.itemsMarginTop]}>
              <Text style={styles.subSectionTitlePurchased}>Purchased</Text>
            </View>
            <View style={styles.itemsContainer}>
              {checkedItems.map((item) => {
                const stats = priceStats.get(item.name.toLowerCase());
                const suggestion = smartSuggestions.get(item.name.toLowerCase());
                const hasCheaperOption = suggestion && suggestion.bestStore !== list.storeName && suggestion.savings > 0.01;
                const priceChange = stats && stats.priceHistory.length > 1 && item.price
                  ? item.price - stats.priceHistory[stats.priceHistory.length - 2]?.price
                  : null;

                const hasPrice = item.price != null && item.price > 0;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.itemRow}
                    onPress={() => handleItemPress(item)}
                  >
                    <View style={styles.checkboxContainer}>
                      <Icon name="checkmark" size={20} color={theme.accent.green} />
                    </View>
                    <View style={styles.itemContent}>
                      <View style={styles.itemNameRow}>
                        <Text style={[styles.itemName, styles.itemNameChecked]}>
                          {item.name}
                        </Text>
                        {hasCheaperOption && (
                          <Text style={styles.cheaperIcon}>⭐</Text>
                        )}
                      </View>
                      <View style={styles.priceRow}>
                        {hasPrice ? (
                          <Text style={styles.itemPrice}>
                            £{item.price!.toFixed(2)}
                          </Text>
                        ) : (
                          <Text style={styles.addPricePrompt}>+ set price</Text>
                        )}
                        {priceChange !== null && priceChange !== 0 && (
                          <Text style={[
                            styles.priceTrend,
                            priceChange > 0 ? styles.priceUp : styles.priceDown
                          ]}>
                            {priceChange > 0 ? '↑' : '↓'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* Receipt Photo Button */}
      {!!list.receiptUrl && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.receiptButton} onPress={handleViewReceipt}>
            <Icon name="camera-outline" size={20} color={theme.text.primary} style={styles.receiptButtonIcon} />
            <Text style={styles.receiptButtonText}>View Receipt Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Delete Button */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteList}>
          <Text style={styles.deleteButtonText}>Delete Shopping Trip</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>

      {/* Price Edit Modal — for items without a price */}
      <PriceEditModal
        visible={editModalVisible}
        item={selectedItem}
        recentPrices={[]}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedItem(null);
        }}
        onSave={handleSaveItem}
        onViewPriceHistory={(itemName) => {
          setEditModalVisible(false);
          setPriceHistoryModalItemName(itemName);
        }}
      />

      {/* Price History Modal — for items that already have a price, or opened from PriceEditModal */}
      <PriceHistoryModal
        visible={priceHistoryItem !== null || priceHistoryModalItemName !== null}
        itemName={priceHistoryItem?.name ?? priceHistoryModalItemName ?? ''}
        onClose={() => {
          setPriceHistoryItem(null);
          setPriceHistoryModalItemName(null);
        }}
      />
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.secondary,
  },
  errorText: {
    fontSize: 16,
    color: theme.text.secondary,
  },
  header: {
    backgroundColor: theme.glass.subtle,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  listName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 8,
  },
  listDate: {
    fontSize: 14,
    color: theme.text.secondary,
    marginBottom: 8,
  },
  totalAmount: {
    ...NUMERIC,
    fontSize: 20,
    fontWeight: '700',
    color: theme.accent.green,
  },
  section: {
    backgroundColor: theme.glass.subtle,
    marginBottom: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: 20,
    marginHorizontal: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 15,
  },
  itemsContainer: {
    marginTop: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkboxUnchecked: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: theme.text.tertiary,
    borderRadius: 4,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 16,
    color: theme.text.primary,
    flex: 1,
    flexShrink: 1,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: theme.text.tertiary,
  },
  itemPrice: {
    ...NUMERIC,
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent.green,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cheaperIcon: {
    fontSize: 12,
    marginLeft: 6,
  },
  addPricePrompt: {
    fontSize: 12,
    color: theme.text.dim,
    fontStyle: 'italic',
  },
  priceTrend: {
    fontSize: 14,
    fontWeight: '700',
  },
  priceUp: {
    color: theme.accent.red,
  },
  priceDown: {
    color: theme.accent.green,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: theme.accent.blueSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
  },
  receiptButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  receiptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.accent.blue,
  },
  emptyText: {
    fontSize: 14,
    color: theme.text.secondary,
    fontStyle: 'italic',
  },
  deleteButton: {
    padding: 15,
    marginHorizontal: 10,
    backgroundColor: theme.accent.red,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.accent.redDim,
    shadowColor: theme.accent.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteButtonText: {
    color: theme.text.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  subSectionHeaderNotPurchased: {
    backgroundColor: theme.accent.orangeSubtle,
    borderWidth: 1,
    borderColor: theme.accent.orangeDim,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  subSectionTitleNotPurchased: {
    color: theme.accent.orange,
    fontSize: 14,
    fontWeight: '700',
  },
  subSectionHeaderPurchased: {
    paddingVertical: 4,
    marginBottom: 4,
  },
  subSectionTitlePurchased: {
    color: theme.accent.green,
    fontSize: 14,
    fontWeight: '700',
  },
  itemNameNotPurchased: {
    color: theme.accent.orange,
  },
  itemPriceNotPurchased: {
    ...NUMERIC,
    color: theme.accent.orange,
  },
  itemsMarginTop: { marginTop: 12 },
});

export default HistoryDetailScreen;

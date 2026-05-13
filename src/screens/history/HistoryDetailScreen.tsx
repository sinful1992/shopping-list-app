import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { RADIUS } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { HistoryStackParamList } from '../../types/navigation';
import HistoryTracker from '../../services/HistoryTracker';
import ItemManager from '../../services/ItemManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import ShoppingListManager from '../../services/ShoppingListManager';
import PriceHistoryService, { PriceStats } from '../../services/PriceHistoryService';
import { ListDetails, Item } from '../../models/types';
import PriceEditModal from '../../components/PriceEditModal';
import PriceHistoryModal from '../../components/PriceHistoryModal';

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

  useEffect(() => {
    loadListDetails();
  }, []);

  // Load price stats once after items first arrive
  useEffect(() => {
    const familyGroupId = listDetails?.list.familyGroupId;
    if (!familyGroupId || items.length === 0 || priceStatsLoadedRef.current) return;
    priceStatsLoadedRef.current = true;

    const loadPriceStats = async () => {
      try {
        const statsMap = new Map<string, PriceStats>();
        const suggestionsMap = new Map<string, { bestStore: string; bestPrice: number; savings: number }>();

        const uniqueNames = [...new Set(items.map(item => item.name.toLowerCase()))];
        const suggestions = await PriceHistoryService.getSmartSuggestions(familyGroupId, uniqueNames);

        await Promise.all(uniqueNames.map(async (name) => {
          const stats = await PriceHistoryService.getPriceStats(familyGroupId!, name);
          if (stats) statsMap.set(name, stats);
          const suggestion = suggestions.get(name);
          if (suggestion) suggestionsMap.set(name, suggestion);
        }));

        setPriceStats(statsMap);
        setSmartSuggestions(suggestionsMap);
      } catch (error: any) {
        // Price stats are non-critical, don't block UI
      }
    };
    loadPriceStats();
  }, [items, listDetails?.list.familyGroupId]);

  const loadListDetails = async () => {
    try {
      setLoading(true);
      const details = await HistoryTracker.getListDetails(listId);
      setListDetails(details);
      if (details.items.length > 0) {
        setItems(details.items);
      } else if (details.list.familyGroupId) {
        // Items not in local DB (fresh install / new device) — fetch from Firebase
        try {
          const firebaseItems = await FirebaseSyncListener.fetchItemsOnceForHistory(
            details.list.familyGroupId,
            listId
          );
          setItems(firebaseItems);
        } catch {
          setItems([]);
        }
      }
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      navigation.goBack();
    } finally {
      setLoading(false);
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

    // Recalculate total if price changed
    if (updates.price !== undefined && listDetails) {
      const newItems = items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      const newTotal = newItems.reduce((sum, item) => sum + (item.price || 0), 0);

      if (newTotal > 0) {
        await ShoppingListManager.updateList(listId, { totalAmount: newTotal });
      }

      // Reload to refresh receiptData total
      await loadListDetails();
    }
  };

  // Calculate total from item prices
  const calculatedTotal = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + (item.price || 0), 0);
  }, [items]);

  const { uncheckedItems, checkedItems } = useMemo(() => ({
    uncheckedItems: items.filter(i => !i.checked),
    checkedItems: items.filter(i => i.checked),
  }), [items]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!listDetails) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Shopping trip not found</Text>
      </View>
    );
  }

  const { list, receiptUrl, receiptData } = listDetails;

  return (
    <View style={styles.container}>
    <ScrollView style={styles.scrollView}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.listName}>{list.name}</Text>
        <Text style={styles.listDate}>
          {new Date(list.completedAt || 0).toLocaleDateString('en-GB', {
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
          <Text style={styles.emptyText}>No items in this list</Text>
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

            <View style={[styles.subSectionHeaderPurchased, uncheckedItems.length > 0 && { marginTop: 12 }]}>
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
                      <Text style={styles.checkboxChecked}>✓</Text>
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
      {receiptUrl && (
        <View style={styles.section}>
          <TouchableOpacity style={styles.receiptButton} onPress={handleViewReceipt}>
            <Text style={styles.receiptButtonIcon}>📷</Text>
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

const createStyles = (theme: import('../../styles/theme').Theme) => StyleSheet.create({
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 15,
  },
  editLink: {
    fontSize: 16,
    color: theme.accent.blue,
    fontWeight: '600',
  },
  receiptDataContainer: {
    marginTop: 10,
  },
  receiptField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  receiptLabel: {
    fontSize: 14,
    color: theme.text.secondary,
  },
  receiptValue: {
    fontSize: 14,
    color: theme.text.primary,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.accent.green,
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
  checkboxChecked: {
    fontSize: 20,
    color: theme.accent.green,
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
  itemQuantity: {
    fontSize: 13,
    color: theme.text.secondary,
    marginTop: 2,
  },
  itemPrice: {
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
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  subSectionHeaderNotPurchased: {
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
  },
  subSectionTitleNotPurchased: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '700',
  },
  subSectionHeaderPurchased: {
    paddingVertical: 4,
    marginBottom: 4,
  },
  subSectionTitlePurchased: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '700',
  },
  itemNameNotPurchased: {
    color: '#FF9500',
  },
  itemPriceNotPurchased: {
    color: '#FF9500',
  },
});

export default HistoryDetailScreen;

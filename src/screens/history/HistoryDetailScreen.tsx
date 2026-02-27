import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { useRoute, useNavigation } from '@react-navigation/native';
import HistoryTracker from '../../services/HistoryTracker';
import ShoppingListManager from '../../services/ShoppingListManager';
import ItemManager from '../../services/ItemManager';
import PriceHistoryService, { PriceStats } from '../../services/PriceHistoryService';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import { ListDetails, Item } from '../../models/types';
import ItemEditModal from '../../components/ItemEditModal';

/**
 * HistoryDetailScreen
 * Display details of a completed shopping trip
 * Implements Req 8.3, 8.4
 */
const HistoryDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { listId } = route.params as { listId: string };

  const [loading, setLoading] = useState(true);
  const [listDetails, setListDetails] = useState<ListDetails | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [priceStats, setPriceStats] = useState<Map<string, PriceStats>>(new Map());
  const [smartSuggestions, setSmartSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());
  const priceStatsLoadedRef = useRef(false);

  useEffect(() => {
    loadListDetails();
  }, []);

  // Subscribe to WatermelonDB item observer for reactive item updates
  useEffect(() => {
    const unsubscribe = ItemManager.subscribeToItemChanges(listId, setItems);
    return () => unsubscribe();
  }, [listId]);

  // Start Firebase items listener once listDetails resolves with familyGroupId
  useEffect(() => {
    const familyGroupId = listDetails?.list.familyGroupId;
    if (!familyGroupId) return;

    const unsubscribe = FirebaseSyncListener.startListeningToItems(familyGroupId, listId);
    return () => unsubscribe();
  }, [listDetails?.list.familyGroupId, listId]);

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
    } catch (error: any) {
      showAlert('Error', error.message, undefined, { icon: 'error' });
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
              showAlert('Error', error.message, undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
    );
  };

  const handleViewReceipt = () => {
    navigation.navigate('ReceiptView' as never, { listId } as never);
  };

  const handleItemPress = (item: Item) => {
    setSelectedItem(item);
    setEditModalVisible(true);
  };

  const handleSaveItem = async (itemId: string, updates: { name?: string; price?: number | null; category?: string | null }) => {
    await ItemManager.updateItem(itemId, updates);

    // Recalculate total if price changed
    if (updates.price !== undefined && listDetails) {
      const newItems = items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      const newTotal = newItems.reduce((sum, item) => sum + (item.price || 0), 0);

      // Update receiptData with new total
      if (newTotal > 0) {
        const newReceiptData = {
          ...(listDetails.receiptData || {
            merchantName: listDetails.list.storeName || null,
            purchaseDate: null,
            subtotal: null,
            currency: '£',
            lineItems: [],
            discounts: [],
            totalDiscount: null,
            vatBreakdown: [],
            store: null,
            extractedAt: Date.now(),
            confidence: 1,
          }),
          totalAmount: newTotal,
        };
        await ShoppingListManager.updateList(listId, { receiptData: newReceiptData as any });
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

  if (loading || (listDetails && items.length === 0)) {
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
    <ScrollView style={styles.container}>
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
          Total: £{(receiptData?.totalAmount && receiptData.totalAmount > 0
            ? receiptData.totalAmount
            : calculatedTotal
          ).toFixed(2)}
        </Text>
      </View>

      {/* Items Section */}
      <View style={styles.section}>
        {(() => {
          const checkedCount = items.filter(i => i.checked).length;
          const uncheckedCount = items.length - checkedCount;
          return (
            <>
              <Text style={styles.sectionTitle}>Items ({checkedCount}/{items.length} bought)</Text>
              {uncheckedCount > 0 && (
                <View style={styles.skippedBanner}>
                  <Text style={styles.skippedBannerText}>
                    {uncheckedCount} item{uncheckedCount === 1 ? '' : 's'} not purchased
                  </Text>
                </View>
              )}
            </>
          );
        })()}
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items in this list</Text>
        ) : (
          <View style={styles.itemsContainer}>
            {items.map((item) => {
              const stats = priceStats.get(item.name.toLowerCase());
              const suggestion = smartSuggestions.get(item.name.toLowerCase());
              const hasCheaperOption = suggestion && suggestion.bestStore !== list.storeName && suggestion.savings > 0.01;
              const priceChange = stats && stats.priceHistory.length > 1 && item.price
                ? item.price - stats.priceHistory[stats.priceHistory.length - 2]?.price
                : null;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.checkboxContainer}>
                    {item.checked ? (
                      <Text style={styles.checkboxChecked}>✓</Text>
                    ) : (
                      <View style={styles.checkboxUnchecked} />
                    )}
                  </View>
                  <View style={styles.itemContent}>
                    <View style={styles.itemNameRow}>
                      <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                        {item.name}
                      </Text>
                      {hasCheaperOption && (
                        <Text style={styles.cheaperIcon}>⭐</Text>
                      )}
                    </View>
                    <View style={styles.priceRow}>
                      {item.price !== null && item.price !== undefined && (
                        <Text style={styles.itemPrice}>
                          £{item.price.toFixed(2)}
                        </Text>
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

      {/* Item Edit Modal */}
      <ItemEditModal
        visible={editModalVisible}
        item={selectedItem}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedItem(null);
        }}
        onSave={handleSaveItem}
        focusField="price"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#a0a0a0',
  },
  errorText: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  listName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  listDate: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#30D158',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
    color: '#ffffff',
    marginBottom: 15,
  },
  editLink: {
    fontSize: 16,
    color: '#007AFF',
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
    color: '#a0a0a0',
  },
  receiptValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#30D158',
  },
  itemsContainer: {
    marginTop: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkboxChecked: {
    fontSize: 20,
    color: '#30D158',
  },
  checkboxUnchecked: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
    color: '#ffffff',
    flex: 1,
    flexShrink: 1,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#6E6E73',
  },
  itemQuantity: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#30D158',
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
  priceTrend: {
    fontSize: 14,
    fontWeight: '700',
  },
  priceUp: {
    color: '#FF3B30',
  },
  priceDown: {
    color: '#30D158',
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  receiptButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  receiptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#a0a0a0',
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
  skippedBanner: {
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  skippedBannerText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default HistoryDetailScreen;

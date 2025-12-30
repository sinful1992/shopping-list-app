import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import HistoryTracker from '../../services/HistoryTracker';
import ShoppingListManager from '../../services/ShoppingListManager';
import { ListDetails } from '../../models/types';

/**
 * HistoryDetailScreen
 * Display details of a completed shopping trip
 * Implements Req 8.3, 8.4
 */
const HistoryDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { listId } = route.params as { listId: string };

  const [loading, setLoading] = useState(true);
  const [listDetails, setListDetails] = useState<ListDetails | null>(null);

  useEffect(() => {
    loadListDetails();
  }, []);

  const loadListDetails = async () => {
    try {
      setLoading(true);
      const details = await HistoryTracker.getListDetails(listId);
      setListDetails(details);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = () => {
    Alert.alert(
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
              Alert.alert('Success', 'Shopping trip deleted');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleViewReceipt = () => {
    navigation.navigate('ReceiptView' as never, { listId } as never);
  };

  // Calculate total from item prices
  const calculatedTotal = useMemo(() => {
    if (!listDetails?.items) return 0;
    return listDetails.items.reduce((sum, item) => sum + (item.price || 0), 0);
  }, [listDetails?.items]);

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

  const { list, items, receiptUrl, receiptData } = listDetails;

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
        <Text style={styles.sectionTitle}>Items ({items.length})</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items in this list</Text>
        ) : (
          <View style={styles.itemsContainer}>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.checkboxContainer}>
                  {item.checked ? (
                    <Text style={styles.checkboxChecked}>✓</Text>
                  ) : (
                    <View style={styles.checkboxUnchecked} />
                  )}
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                    {item.name}
                  </Text>
                  {item.price !== null && item.price !== undefined && (
                    <Text style={styles.itemPrice}>
                      £{item.price.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Receipt Data Section */}
      {receiptData && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Receipt Data</Text>
            <TouchableOpacity onPress={handleViewReceipt}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.receiptDataContainer}>
            {receiptData.merchantName && (
              <View style={styles.receiptField}>
                <Text style={styles.receiptLabel}>Merchant:</Text>
                <Text style={styles.receiptValue}>{receiptData.merchantName}</Text>
              </View>
            )}
            {receiptData.purchaseDate && (
              <View style={styles.receiptField}>
                <Text style={styles.receiptLabel}>Date:</Text>
                <Text style={styles.receiptValue}>{receiptData.purchaseDate}</Text>
              </View>
            )}
            {receiptData.totalAmount !== null && (
              <View style={styles.receiptField}>
                <Text style={styles.receiptLabel}>Total:</Text>
                <Text style={styles.receiptValue}>
                  {receiptData.currency || '£'}{receiptData.totalAmount.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Delete Button */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteList}>
          <Text style={styles.deleteButtonText}>Delete Shopping Trip</Text>
        </TouchableOpacity>
      </View>
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
    gap: 10,
  },
  itemName: {
    fontSize: 16,
    color: '#ffffff',
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
    marginLeft: 10,
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
});

export default HistoryDetailScreen;

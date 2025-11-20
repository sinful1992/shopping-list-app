import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { TopItem } from '../services/AnalyticsService';
import AnalyticsService from '../services/AnalyticsService';
import AuthenticationModule from '../services/AuthenticationModule';

interface FrequentlyBoughtModalProps {
  visible: boolean;
  onClose: () => void;
  onAddItem: (itemName: string) => Promise<void>;
}

const FrequentlyBoughtModal: React.FC<FrequentlyBoughtModalProps> = ({
  visible,
  onClose,
  onAddItem,
}) => {
  const [loading, setLoading] = useState(true);
  const [frequentItems, setFrequentItems] = useState<TopItem[]>([]);
  const [addingItemName, setAddingItemName] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadFrequentItems();
    }
  }, [visible]);

  const loadFrequentItems = async () => {
    try {
      setLoading(true);
      const user = await AuthenticationModule.getCurrentUser();
      if (!user?.familyGroupId) {
        setFrequentItems([]);
        return;
      }

      // Get analytics summary for last 90 days to get more items
      const analytics = await AnalyticsService.getAnalyticsSummary(
        user.familyGroupId,
        90
      );

      // Sort by purchase count and take top 20
      const sortedItems = [...analytics.topItems]
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, 20);

      setFrequentItems(sortedItems);
    } catch (error) {
      console.error('Error loading frequent items:', error);
      setFrequentItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (itemName: string) => {
    try {
      setAddingItemName(itemName);
      await onAddItem(itemName);
      // Don't close modal - allow multiple additions
    } catch (error) {
      console.error('Error adding item:', error);
    } finally {
      setAddingItemName(null);
    }
  };

  const renderItem = ({ item }: { item: TopItem }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemStats}>
          <Text style={styles.itemCount}>Bought {item.purchaseCount} times</Text>
          <Text style={styles.itemPrice}>£{item.averagePrice.toFixed(2)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.addButton,
          addingItemName === item.name && styles.addButtonDisabled,
        ]}
        onPress={() => handleAddItem(item.name)}
        disabled={addingItemName === item.name}
      >
        {addingItemName === item.name ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.addButtonText}>+</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Frequently Bought Items</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading frequent items...</Text>
            </View>
          ) : frequentItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>No frequent items yet</Text>
              <Text style={styles.emptySubtext}>
                Complete more shopping trips to see your frequently bought items
              </Text>
            </View>
          ) : (
            <FlatList
              data={frequentItems}
              renderItem={renderItem}
              keyExtractor={(item) => item.name}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              // Performance optimizations
              getItemLayout={(data, index) => ({
                length: 70, // Approximate item height
                offset: 70 * index,
                index,
              })}
              maxToRenderPerBatch={10}
              initialNumToRender={15}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#6E6E73',
    fontWeight: '300',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#a0a0a0',
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  listContent: {
    padding: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 6,
  },
  itemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemCount: {
    fontSize: 13,
    color: '#a0a0a0',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#30D158',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '300',
    lineHeight: 24,
  },
});

export default FrequentlyBoughtModal;

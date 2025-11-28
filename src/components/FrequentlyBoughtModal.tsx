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
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

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
              <ActivityIndicator size="large" color={COLORS.accent.blue} />
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
            <View style={styles.listContent}>
              {frequentItems.map((item) => (
                <View key={item.name} style={styles.itemRow}>
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
                      <ActivityIndicator size="small" color={COLORS.text.primary} />
                    ) : (
                      <Text style={styles.addButtonText}>+</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
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
    backgroundColor: COLORS.overlay.dark,
  },
  modal: {
    ...COMMON_STYLES.modal,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.medium,
  },
  title: {
    ...COMMON_STYLES.sectionHeader,
    marginBottom: 0,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: 24,
    color: COLORS.text.tertiary,
    fontWeight: '300',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.lg,
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.text.secondary,
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  listContent: {
    padding: SPACING.xl,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
  },
  itemLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  itemName: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    marginBottom: 6,
  },
  itemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  itemCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
  },
  itemPrice: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.accent.green,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent.blueLight,
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 24,
    color: COLORS.text.primary,
    fontWeight: '300',
    lineHeight: 24,
  },
});

export default FrequentlyBoughtModal;

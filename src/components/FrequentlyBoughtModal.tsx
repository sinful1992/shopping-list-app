import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { TopItem } from '../services/AnalyticsService';
import AnalyticsService from '../services/AnalyticsService';
import AuthenticationModule from '../services/AuthenticationModule';
import { RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

      const analytics = await AnalyticsService.getAnalyticsSummary(
        user.familyGroupId,
        90
      );

      const sortedItems = [...analytics.topItems]
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, 20);

      setFrequentItems(sortedItems);
    } catch {
      setFrequentItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (itemName: string) => {
    try {
      setAddingItemName(itemName);
      await onAddItem(itemName);
    } catch {
      // Failed to add item
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
        <LinearGradient
          colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
          style={styles.modal}
        >
          <View style={styles.modalHandleContainer}>
            <View style={styles.modalHandle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Frequently Bought Items</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={theme.text.tertiary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.accent.blue} />
              <Text style={styles.loadingText}>Loading frequent items...</Text>
            </View>
          ) : frequentItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="stats-chart-outline" size={56} color={theme.text.tertiary} style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No frequent items yet</Text>
              <Text style={styles.emptySubtext}>
                Complete more shopping trips to see your frequently bought items
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.listContent}>
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
                      <ActivityIndicator size="small" color={theme.text.primary} />
                    ) : (
                      <Text style={styles.addButtonText}>+</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.overlay.dark,
  },
  modal: {
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.medium,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    marginBottom: 0,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: 24,
    color: theme.text.tertiary,
    fontWeight: '300',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.lg,
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: theme.text.secondary,
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
    color: theme.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
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
    paddingHorizontal: SPACING.md,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    marginBottom: SPACING.sm,
  },
  itemLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  itemName: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.primary,
    marginBottom: 6,
  },
  itemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  itemCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: theme.text.secondary,
  },
  itemPrice: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.accent.green,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: theme.accent.blueSubtle,
    borderWidth: 1.5,
    borderColor: theme.accent.blueDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 24,
    color: theme.text.primary,
    fontWeight: '300',
    lineHeight: 24,
  },
});

export default FrequentlyBoughtModal;

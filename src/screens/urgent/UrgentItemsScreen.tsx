import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useAdMob } from '../../contexts/AdMobContext';
import { useRevenueCat } from '../../contexts/RevenueCatContext';
import { UrgentItem } from '../../models/types';
import { useUrgentItems } from '../../hooks';

/**
 * UrgentItemsScreen
 * Display and manage standalone urgent items
 */
const UrgentItemsScreen = () => {
  const { showAlert } = useAlert();
  const { shouldShowAds, showRewarded } = useAdMob();
  const { tier } = useRevenueCat();

  // Use custom hook for urgent items management
  const { activeItems, resolvedItems, loading, createItem, resolveItem, formatTimeAgo } = useUrgentItems();

  // UI state only
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<UrgentItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [resolvePrice, setResolvePrice] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateItem = async () => {
    if (!newItemName.trim()) {
      showAlert('Error', 'Please enter an item name', undefined, { icon: 'error' });
      return;
    }
    if (isCreating) return;
    setIsCreating(true);

    const performCreate = async () => {
      try {
        await createItem(newItemName.trim());
        setNewItemName('');
        setShowCreateModal(false);
        showAlert('Success', 'Urgent item created and family notified!', undefined, { icon: 'success' });
      } catch (error: any) {
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      } finally {
        setIsCreating(false);
      }
    };

    if (tier !== 'free') {
      await performCreate();
      return;
    }

    if (!shouldShowAds) {
      setIsCreating(false);
      showAlert(
        'Ads Required',
        'Please accept ads to create urgent items, or upgrade to Premium for unlimited access.',
        undefined,
        { icon: 'info' }
      );
      return;
    }

    const shown = showRewarded(
      () => { performCreate(); },
      () => { setIsCreating(false); }
    );

    if (!shown) {
      setIsCreating(false);
      showAlert('Ad Not Ready', 'Please wait a moment and try again.', undefined, { icon: 'info' });
    }
  };

  const handleResolveItem = (item: UrgentItem) => {
    setSelectedItem(item);
    setResolvePrice('');
    setShowResolveModal(true);
  };

  const confirmResolveItem = async () => {
    if (!selectedItem) {
      return;
    }

    try {
      const price = resolvePrice.trim() ? parseFloat(resolvePrice) : undefined;

      if (resolvePrice.trim() && (price === undefined || isNaN(price) || price < 0)) {
        showAlert('Error', 'Please enter a valid price', undefined, { icon: 'error' });
        return;
      }

      await resolveItem(selectedItem.id, price);
      setShowResolveModal(false);
      setSelectedItem(null);
      setResolvePrice('');
      showAlert('Success', 'Urgent item marked as resolved!', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading urgent items...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Active Items Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Urgent Items ({activeItems.length})</Text>
          {activeItems.length === 0 ? (
            <Text style={styles.emptyText}>No active urgent items</Text>
          ) : (
            <View>
              {activeItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.activeItemCard}
                  onPress={() => handleResolveItem(item)}
                >
                  <View style={styles.itemHeader}>
                    <Text style={styles.fireEmoji}>🔥</Text>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        Added by {item.createdByName} • {formatTimeAgo(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.resolveButton}>
                    <Text style={styles.resolveButtonText}>Mark Done</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Resolved Items Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resolved ({resolvedItems.length})</Text>
          {resolvedItems.length === 0 ? (
            <Text style={styles.emptyText}>No resolved items</Text>
          ) : (
            <View>
              {resolvedItems.map((item) => (
                <View key={item.id} style={styles.resolvedItemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.checkEmoji}>✓</Text>
                    <View style={styles.itemInfo}>
                      <Text style={styles.resolvedItemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        Added by {item.createdByName}
                      </Text>
                      <Text style={styles.resolvedMeta}>
                        ✓ Picked up by {item.resolvedByName} {item.price ? `• £${item.price.toFixed(2)}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Create Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabText}>🔥</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Urgent Item</Text>
            <TextInput
              style={styles.input}
              placeholder="What do you need urgently?"
              placeholderTextColor="#6E6E73"
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewItemName('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, isCreating && { opacity: 0.5 }]}
                onPress={handleCreateItem}
                disabled={isCreating}
              >
                <Text style={styles.createButtonText}>Create & Notify</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Resolve Modal */}
      <Modal
        visible={showResolveModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowResolveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark as Picked Up</Text>
            <Text style={styles.modalSubtitle}>{selectedItem?.name}</Text>
            <TextInput
              style={styles.input}
              placeholder="Price (optional)"
              placeholderTextColor="#6E6E73"
              value={resolvePrice}
              onChangeText={setResolvePrice}
              keyboardType="decimal-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowResolveModal(false);
                  setSelectedItem(null);
                  setResolvePrice('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={confirmResolveItem}
              >
                <Text style={styles.createButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 14,
    color: '#6E6E73',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  activeItemCard: {
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  resolvedItemCard: {
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fireEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  checkEmoji: {
    fontSize: 28,
    marginRight: 12,
    color: '#30D158',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  resolvedItemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a0a0a0',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  resolvedMeta: {
    fontSize: 13,
    color: '#30D158',
    fontWeight: '600',
  },
  resolveButton: {
    backgroundColor: '#30D158',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  resolveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default UrgentItemsScreen;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { ShoppingList } from '../../models/types';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ImageStorageManager from '../../services/ImageStorageManager';
import ReceiptOCRProcessor from '../../services/ReceiptOCRProcessor';
import ItemManager from '../../services/ItemManager';

/**
 * HomeScreen
 * Displays all active shopping lists
 * Implements Req 2.3, 9.1
 */
const HomeScreen = () => {
  const navigation = useNavigation();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user || !user.familyGroupId) {
        Alert.alert('Error', 'No family group found');
        return;
      }

      setFamilyGroupId(user.familyGroupId);
      const activeLists = await ShoppingListManager.getAllActiveLists(user.familyGroupId);
      setLists(activeLists);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLists();
    setRefreshing(false);
  };

  const handleCreateList = () => {
    setSelectedDate(new Date());
    setShowCreateModal(true);
  };

  const handleOpenDatePicker = () => {
    if (Platform.OS === 'android') {
      // Use imperative API for Android (recommended approach)
      // Set safe date range to avoid Android crashes (1900-2038 limitation)
      const minDate = new Date(1900, 0, 1);
      const maxDate = new Date(2037, 11, 31);

      try {
        DateTimePickerAndroid.open({
          value: selectedDate,
          onChange: (event, date) => {
            if (event.type === 'set' && date) {
              setSelectedDate(date);
            }
          },
          mode: 'date',
          is24Hour: true,
          minimumDate: minDate,
          maximumDate: maxDate,
        });
      } catch (error: any) {
        Alert.alert('Error', `Failed to open date picker: ${error.message}`);
      }
    } else {
      // Use component for iOS
      setShowIOSPicker(true);
    }
  };

  const handleConfirmCreate = async () => {
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      if (!user.familyGroupId) {
        Alert.alert('Error', 'No family group found. Please create or join a family group first.');
        return;
      }

      // Format date as list name (e.g., "Mon, Jan 15, 2025")
      const listName = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      await ShoppingListManager.createList(listName, user.uid, user.familyGroupId);
      setShowCreateModal(false);
      await loadLists();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    Alert.alert(
      'Delete Shopping List',
      `Are you sure you want to delete "${listName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ShoppingListManager.deleteList(listId);
              await loadLists();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleScanReceipt = async () => {
    if (scanningReceipt) return;

    try {
      setScanningReceipt(true);

      // Get current user
      const user = await AuthenticationModule.getCurrentUser();
      if (!user || !user.familyGroupId) {
        Alert.alert('Error', 'User not authenticated or no family group found');
        return;
      }

      // Step 1: Capture receipt
      const captureResult = await ReceiptCaptureModule.captureReceipt();

      if (captureResult.cancelled) {
        return;
      }

      if (!captureResult.success || !captureResult.filePath) {
        Alert.alert('Error', captureResult.error || 'Failed to capture receipt');
        return;
      }

      // Step 2: Create a new shopping list
      const listName = 'Receipt - ' + new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const newList = await ShoppingListManager.createList(
        listName,
        user.uid,
        user.familyGroupId
      );

      // Step 3: Upload receipt to Firebase Storage
      const storagePath = await ImageStorageManager.uploadReceipt(
        captureResult.filePath,
        newList.id,
        user.familyGroupId
      );

      // Step 4: Process OCR
      const ocrResult = await ReceiptOCRProcessor.processReceipt(storagePath, newList.id);

      // Step 5: Create items from OCR lineItems (if OCR succeeded)
      if (ocrResult.success && ocrResult.receiptData && ocrResult.receiptData.lineItems.length > 0) {
        for (const lineItem of ocrResult.receiptData.lineItems) {
          await ItemManager.addItem(
            newList.id,
            lineItem.description,
            user.uid,
            lineItem.quantity?.toString() || undefined,
            lineItem.price || undefined
          );
          // Mark item as checked since this is a completed receipt
          const items = await ItemManager.getItemsForList(newList.id);
          const lastItem = items[items.length - 1];
          if (lastItem) {
            await ItemManager.updateItem(lastItem.id, { checked: true });
          }
        }

        // Step 6: Mark list as completed
        await ShoppingListManager.markListAsCompleted(newList.id);

        Alert.alert(
          'Success',
          `Created shopping list "${listName}" with ${ocrResult.receiptData.lineItems.length} items from receipt`
        );
      } else {
        // OCR failed or low confidence, but list and receipt are still saved
        Alert.alert(
          'Partial Success',
          'Receipt uploaded but could not extract items. You can view the receipt and add items manually.'
        );
      }

      // Reload lists to show the new one
      await loadLists();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setScanningReceipt(false);
    }
  };

  const renderListItem = ({ item }: { item: ShoppingList }) => (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => navigation.navigate('ListDetail' as never, { listId: item.id } as never)}
    >
      <View style={styles.listHeader}>
        <Text style={styles.listName}>{item.name}</Text>
        <View style={styles.listBadges}>
          {item.syncStatus === 'pending' && <Text style={styles.syncBadge}>⏱ Syncing...</Text>}
          {item.syncStatus === 'synced' && <Text style={styles.syncedBadge}>✓ Synced</Text>}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteList(item.id, item.name);
            }}
            style={styles.deleteIconButton}
          >
            <Text style={styles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.listDate}>
        Created {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={lists}
        keyExtractor={(item) => item.id}
        renderItem={renderListItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No shopping lists yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first list</Text>
          </View>
        }
      />

      {/* Scan Receipt Button */}
      <TouchableOpacity
        style={[styles.scanButton, scanningReceipt && styles.scanButtonDisabled]}
        onPress={handleScanReceipt}
        disabled={scanningReceipt}
      >
        <Text style={styles.scanButtonIcon}>📷</Text>
        <Text style={styles.scanButtonText}>
          {scanningReceipt ? 'Processing...' : 'Scan Receipt'}
        </Text>
      </TouchableOpacity>

      {/* Create List Button (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={handleCreateList}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Shopping List</Text>
            <Text style={styles.modalSubtitle}>Select shopping date:</Text>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={handleOpenDatePicker}
            >
              <Text style={styles.dateButtonText}>
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>

            <Text style={styles.datePreview}>
              Tap to change date
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmCreate}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS Date Picker */}
      {showIOSPicker && Platform.OS === 'ios' && (
        <Modal visible={true} transparent animationType="slide">
          <View style={styles.iosPickerContainer}>
            <View style={styles.iosPickerContent}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={(event, date) => {
                  if (date) setSelectedDate(date);
                }}
                minimumDate={new Date(1900, 0, 1)}
                maximumDate={new Date(2037, 11, 31)}
              />
              <TouchableOpacity
                style={styles.iosPickerDone}
                onPress={() => setShowIOSPicker(false)}
              >
                <Text style={styles.iosPickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  listCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: 10,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  listDate: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  listBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  syncBadge: {
    fontSize: 12,
    color: '#FFB340',
  },
  syncedBadge: {
    fontSize: 12,
    color: '#30D158',
  },
  deleteIconButton: {
    padding: 4,
  },
  deleteIcon: {
    fontSize: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 22,
    color: '#ffffff',
    marginBottom: 10,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  scanButton: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(52, 199, 89, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.4)',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  scanButtonDisabled: {
    backgroundColor: 'rgba(142, 142, 147, 0.5)',
    borderColor: 'rgba(142, 142, 147, 0.3)',
    shadowColor: '#8E8E93',
  },
  scanButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.4)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  fabText: {
    fontSize: 36,
    color: '#fff',
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
    color: '#ffffff',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 15,
  },
  dateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
  },
  calendarIcon: {
    fontSize: 24,
  },
  datePreview: {
    fontSize: 12,
    color: '#6E6E73',
    marginBottom: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 1,
    marginLeft: 12,
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginLeft: 0,
  },
  modalButtonConfirm: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextCancel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  iosPickerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  iosPickerContent: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  iosPickerDone: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  iosPickerDoneText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;

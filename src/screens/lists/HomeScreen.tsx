import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import AnimatedList from '../../components/AnimatedList';
import StarBorder from '../../components/StarBorder';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { ShoppingList, User } from '../../models/types';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ReceiptOCRProcessor from '../../services/ReceiptOCRProcessor';
import ItemManager from '../../services/ItemManager';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import DatabaseMigration from '../../services/DatabaseMigration';

/**
 * HomeScreen
 * Displays all active shopping lists
 * Implements Req 2.3, 9.1
 */
const HomeScreen = () => {
  const navigation = useNavigation();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  // Subscribe to real-time list changes using WatermelonDB observers (no polling!)
  useEffect(() => {
    if (!familyGroupId) return;

    // Step 1: Start listening to Firebase for remote changes
    // When Firebase data changes, it will update local WatermelonDB
    const unsubscribeFirebase = FirebaseSyncListener.startListeningToLists(familyGroupId);

    // Step 2: Subscribe to local WatermelonDB changes (triggered by Firebase or local edits)
    // This gives us instant UI updates without polling
    const unsubscribeLocal = ShoppingListManager.subscribeToListChanges(
      familyGroupId,
      (updatedLists) => {
        setLists(updatedLists);
      }
    );

    return () => {
      unsubscribeFirebase();
      unsubscribeLocal();
    };
  }, [familyGroupId]);

  const loadLists = async () => {
    try {
      const currentUser = await AuthenticationModule.getCurrentUser();
      if (!currentUser || !currentUser.familyGroupId) {
        Alert.alert('Error', 'No family group found');
        return;
      }

      setUser(currentUser);
      setFamilyGroupId(currentUser.familyGroupId);

      // Check if migration is needed and run it automatically
      const needsMigration = await DatabaseMigration.needsMigration(currentUser.familyGroupId);
      if (needsMigration) {
        console.log('Migration needed, running automatic migration...');
        try {
          await DatabaseMigration.runAllMigrations(currentUser.familyGroupId);
          console.log('Migration completed successfully');
        } catch (migrationError: any) {
          console.error('Migration failed:', migrationError);
          Alert.alert(
            'Migration Notice',
            'Database migration in progress. Please restart the app if lists do not appear.'
          );
        }
      }

      // Get all lists, sorted by creation date (newest first)
      const allLists = await ShoppingListManager.getAllLists(currentUser.familyGroupId);
      // Filter out deleted and completed lists (completed lists shown in HistoryScreen)
      const activeLists = allLists.filter(list => list.status !== 'deleted' && list.status !== 'completed');
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
    if (creating) return; // Prevent double-tap

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

    // Close modal immediately so user doesn't wait
    setShowCreateModal(false);
    setCreating(true);

    try {
      await ShoppingListManager.createList(listName, user.uid, user.familyGroupId, user);
      // WatermelonDB observer will automatically update the UI
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setCreating(false);
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
              // WatermelonDB observer will automatically update the UI
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

      // Use cached user state
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
        user.familyGroupId,
        user
      );

      // Save receipt image path to list
      await ShoppingListManager.updateList(newList.id, {
        receiptUrl: captureResult.filePath,
      });

      // Step 3: Process OCR from local file (no Firebase Storage upload needed)
      const ocrResult = await ReceiptOCRProcessor.processReceipt(captureResult.filePath, newList.id, user);

      // Step 4: Create items from OCR lineItems (if OCR succeeded)
      if (ocrResult.success && ocrResult.receiptData && ocrResult.receiptData.lineItems.length > 0) {
        // Use batch operation for better performance (90 ops → 2 ops for 30 items!)
        const itemsData = ocrResult.receiptData.lineItems.map(lineItem => ({
          name: lineItem.description,
          quantity: lineItem.quantity?.toString() || undefined,
          price: lineItem.price || undefined,
          // Items are already checked since this is a completed receipt
        }));

        await ItemManager.addItemsBatch(newList.id, itemsData, user.uid);

        // Mark all items as checked in a single batch update
        const items = await ItemManager.getItemsForList(newList.id);
        await ItemManager.updateItemsBatch(
          items.map(item => ({
            id: item.id,
            updates: { checked: true }
          }))
        );

        // Step 5: Mark list as completed
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

  const renderListItem = ({ item }: { item: ShoppingList }) => {
    const isCompleted = item.status === 'completed';
    const targetScreen = isCompleted ? 'HistoryDetail' : 'ListDetail';

    // Format date for completed lists - UK format
    const date = isCompleted ? new Date(item.completedAt || 0) : new Date(item.createdAt);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    // Sync status indicator color
    const syncColor = item.syncStatus === 'synced' ? '#30D158' :
                     item.syncStatus === 'pending' ? '#FFD60A' :
                     '#FF453A'; // failed

    return (
      <TouchableOpacity
        style={[styles.listCard, isCompleted && styles.completedCard]}
        onPress={() => navigation.navigate(targetScreen as never, { listId: item.id } as never)}
      >
        {/* Sync Status Indicator - Top Right */}
        <View style={[styles.syncIndicator, { backgroundColor: syncColor }]} />

        <View style={styles.listHeader}>
          <View style={styles.listTitleRow}>
            <Text style={[styles.listName, isCompleted && styles.completedText]}>
              {item.name}
            </Text>
          </View>
          <View style={styles.listBadges}>
            {item.isLocked && (
              <Text style={styles.shoppingBadge}>
                🛒 {item.lockedByRole || item.lockedByName || 'Shopping'}
              </Text>
            )}
            {isCompleted && <Text style={styles.completedBadge}>✓ Completed</Text>}
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

        {/* Date and Store Display */}
        <Text style={[styles.listDateFormatted, isCompleted && styles.completedText]}>
          {formattedDate}
        </Text>
        {isCompleted && item.storeName && (
          <Text style={[styles.storeName, isCompleted && styles.completedText]}>
            {item.storeName}
          </Text>
        )}
        {!isCompleted && (
          <Text style={[styles.listDateSecondary, isCompleted && styles.completedText]}>
            Created {formattedDate}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {lists.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No shopping lists yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first list</Text>
          </View>
        ) : lists.length <= 50 ? (
          <AnimatedList staggerDelay={80} duration={400} initialDelay={100}>
            {lists.map((list) => {
              const isCompleted = list.status === 'completed';
              const targetScreen = isCompleted ? 'HistoryDetail' : 'ListDetail';

              // Format date for completed lists - UK format
              const date = isCompleted ? new Date(list.completedAt || 0) : new Date(list.createdAt);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              const formattedDate = `${day}/${month}/${year}`;

              // Sync status indicator color
              const syncColor = list.syncStatus === 'synced' ? '#30D158' :
                               list.syncStatus === 'pending' ? '#FFD60A' :
                               '#FF453A'; // failed

              return (
                <StarBorder
                  key={list.id}
                  colors={isCompleted ? ['#FFD700', '#FFA500', '#FF4500'] : ['#007AFF', '#AF52DE', '#007AFF']}
                  speed={isCompleted ? 4000 : 3000}
                  borderRadius={16}
                >
                  <TouchableOpacity
                    style={[styles.listCard, isCompleted && styles.completedCard]}
                    onPress={() => navigation.navigate(targetScreen as never, { listId: list.id } as never)}
                  >
                    {/* Sync Status Indicator - Top Right */}
                    <View style={[styles.syncIndicator, { backgroundColor: syncColor }]} />

                  <View style={styles.listHeader}>
                    <View style={styles.listTitleRow}>
                      <Text style={[styles.listName, isCompleted && styles.completedText]}>
                        {list.name}
                      </Text>
                    </View>
                    <View style={styles.listBadges}>
                      {list.isLocked && (
                        <Text style={styles.shoppingBadge}>
                          🛒 {list.lockedByRole || list.lockedByName || 'Shopping'}
                        </Text>
                      )}
                      {isCompleted && <Text style={styles.completedBadge}>✓ Completed</Text>}
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id, list.name);
                        }}
                        style={styles.deleteIconButton}
                      >
                        <Text style={styles.deleteIcon}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Date and Store Display */}
                  <Text style={[styles.listDateFormatted, isCompleted && styles.completedText]}>
                    {formattedDate}
                  </Text>
                  {isCompleted && list.storeName && (
                    <Text style={[styles.storeName, isCompleted && styles.completedText]}>
                      {list.storeName}
                    </Text>
                  )}
                  {!isCompleted && (
                    <Text style={[styles.listDateSecondary, isCompleted && styles.completedText]}>
                      Created {formattedDate}
                    </Text>
                  )}
                  </TouchableOpacity>
                </StarBorder>
              );
            })}
          </AnimatedList>
        ) : (
          // Render without animation for >50 lists (performance fallback)
          lists.map((list) => {
            const isCompleted = list.status === 'completed';
            const targetScreen = isCompleted ? 'HistoryDetail' : 'ListDetail';

            const date = isCompleted ? new Date(list.completedAt || 0) : new Date(list.createdAt);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const formattedDate = `${day}/${month}/${year}`;

            const syncColor = list.syncStatus === 'synced' ? '#30D158' :
                             list.syncStatus === 'pending' ? '#FFD60A' :
                             '#FF453A';

            return (
              <StarBorder
                key={list.id}
                colors={isCompleted ? ['#FFD700', '#FFA500', '#FF4500'] : ['#007AFF', '#AF52DE', '#007AFF']}
                speed={isCompleted ? 4000 : 3000}
                borderRadius={16}
              >
                <TouchableOpacity
                  style={[styles.listCard, isCompleted && styles.completedCard]}
                  onPress={() => navigation.navigate(targetScreen as never, { listId: list.id } as never)}
                >
                  <View style={[styles.syncIndicator, { backgroundColor: syncColor }]} />

                <View style={styles.listHeader}>
                  <View style={styles.listTitleRow}>
                    <Text style={[styles.listName, isCompleted && styles.completedText]}>
                      {list.name}
                    </Text>
                  </View>
                  <View style={styles.listBadges}>
                    {list.isLocked && (
                      <Text style={styles.shoppingBadge}>
                        🛒 {list.lockedByRole || list.lockedByName || 'Shopping'}
                      </Text>
                    )}
                    {isCompleted && <Text style={styles.completedBadge}>✓ Completed</Text>}
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id, list.name);
                      }}
                      style={styles.deleteIconButton}
                    >
                      <Text style={styles.deleteIcon}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.listDateFormatted, isCompleted && styles.completedText]}>
                  {formattedDate}
                </Text>
                {isCompleted && list.storeName && (
                  <Text style={[styles.storeName, isCompleted && styles.completedText]}>
                    {list.storeName}
                  </Text>
                )}
                {!isCompleted && (
                  <Text style={[styles.listDateSecondary, isCompleted && styles.completedText]}>
                    Created {formattedDate}
                  </Text>
                )}
                </TouchableOpacity>
              </StarBorder>
            );
          })
        )}
      </ScrollView>

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
    position: 'relative',
  },
  completedCard: {
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  syncIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  listName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  completedText: {
    color: '#a0a0a0',
  },
  completedBadge: {
    fontSize: 12,
    color: '#30D158',
    backgroundColor: 'rgba(48, 209, 88, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '600',
  },
  listDate: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  listDateFormatted: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: 4,
  },
  storeName: {
    fontSize: 17,
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 6,
  },
  listDateSecondary: {
    fontSize: 13,
    color: '#6E6E73',
    marginTop: 4,
  },
  listBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shoppingBadge: {
    fontSize: 12,
    color: '#FFB340',
    backgroundColor: 'rgba(255, 179, 64, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '600',
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

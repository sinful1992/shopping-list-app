import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import database from '@react-native-firebase/database';
import AnimatedListCard from '../../components/AnimatedListCard';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import AuthenticationModule from '../../services/AuthenticationModule';
import DatabaseMigration from '../../services/DatabaseMigration';
import { useAuth, useShoppingLists } from '../../hooks';

/**
 * HomeScreen
 * Displays all active shopping lists
 * Implements Req 2.3, 9.1
 */
const HomeScreen = () => {
  const navigation = useNavigation();
  const { showAlert } = useAlert();

  // Use custom hooks for auth and list management
  const { user, familyGroupId, loading: authLoading } = useAuth();
  const { lists, loading: listsLoading, creating, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);

  // UI state only - not business logic
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);

  // Run initial setup when user is available
  useEffect(() => {
    if (user && familyGroupId) {
      loadInitialData();
    }
  }, [user, familyGroupId]);

  const loadInitialData = async () => {
    try {
      if (!user || !familyGroupId) return;

      // Validate family group exists
      const groupExists = await AuthenticationModule.validateFamilyGroupExists(familyGroupId);

      if (!groupExists) {
        showAlert(
          'Family Group Not Found',
          'Your family group no longer exists. Please create or join a new group.',
          [{ text: 'OK' }],
          { icon: 'warning' }
        );

        // Clear the invalid familyGroupId
        await database().ref(`/users/${user.uid}`).update({
          familyGroupId: null,
        });

        return;
      }

      // Check if migration is needed and run it automatically
      const needsMigration = await DatabaseMigration.needsMigration(familyGroupId);
      if (needsMigration) {
        try {
          await DatabaseMigration.runAllMigrations(familyGroupId);
        } catch {
          showAlert(
            'Migration Notice',
            'Database migration in progress. Please restart the app if lists do not appear.',
            undefined,
            { icon: 'info' }
          );
        }
      }
    } catch (error: any) {
      showAlert('Error', error.message, undefined, { icon: 'error' });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
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
        showAlert('Error', `Failed to open date picker: ${error.message}`, undefined, { icon: 'error' });
      }
    } else {
      // Use component for iOS
      setShowIOSPicker(true);
    }
  };

  const handleConfirmCreate = async () => {
    if (creating) return; // Prevent double-tap

    if (!user) {
      showAlert('Error', 'User not authenticated', undefined, { icon: 'error' });
      return;
    }

    if (!familyGroupId) {
      showAlert('Error', 'No family group found. Please create or join a family group first.', undefined, { icon: 'error' });
      return;
    }

    // Format date as list name (e.g., "Mon, Jan 15, 2025")
    const listName = selectedDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    setShowCreateModal(false);

    try {
      await createList(listName);
    } catch (error: any) {
      showAlert('Error', error.message, undefined, { icon: 'error' });
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    showAlert(
      'Delete Shopping List',
      `Are you sure you want to delete "${listName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteList(listId);
            } catch (error: any) {
              showAlert('Error', error.message, undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
    );
  };

  // Note: OCR scan receipt feature is disabled - remove handleScanReceipt if re-enabling

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
        ) : (
          lists.map((list, index) => {
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
                <AnimatedListCard
                  key={list.id}
                  index={index}
                  listId={list.id}
                  listName={list.name}
                  isCompleted={isCompleted}
                  isLocked={list.isLocked}
                  lockedByRole={list.lockedByRole}
                  lockedByName={list.lockedByName}
                  storeName={list.storeName}
                  formattedDate={formattedDate}
                  syncColor={syncColor}
                  onPress={() => navigation.navigate(targetScreen as never, { listId: list.id } as never)}
                  onDelete={() => handleDeleteList(list.id, list.name)}
                  listCardStyle={styles.listCard}
                  completedCardStyle={styles.completedCard}
                  totalLists={lists.length}
                />
              );
            })
        )}
      </ScrollView>

      {/* OCR FEATURE HIDDEN - uncomment to re-enable
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
      */}

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

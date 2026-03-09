import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { COLORS } from '../../styles/theme';
import styles from './HomeScreen.styles';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
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

  const { user, familyGroupId, loading: authLoading } = useAuth();
  const { lists, loading: listsLoading, creating, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);

  useEffect(() => {
    if (user && familyGroupId) {
      loadInitialData();
    }
  }, [user, familyGroupId]);

  const loadInitialData = async () => {
    try {
      if (!user || !familyGroupId) return;

      const groupExists = await AuthenticationModule.validateFamilyGroupExists(familyGroupId);

      if (!groupExists) {
        showAlert(
          'Family Group Not Found',
          'Your family group no longer exists. Please create or join a new group.',
          [{ text: 'OK' }],
          { icon: 'warning' }
        );

        await database().ref(`/users/${user.uid}`).update({
          familyGroupId: null,
        });

        return;
      }

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
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
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
      // Android DateTimePickerAndroid crashes outside 1900-2037 range
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
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      }
    } else {
      setShowIOSPicker(true);
    }
  };

  const handleConfirmCreate = async () => {
    if (creating) return;

    if (!user) {
      showAlert('Error', 'User not authenticated', undefined, { icon: 'error' });
      return;
    }

    if (!familyGroupId) {
      showAlert('Error', 'No family group found. Please create or join a family group first.', undefined, { icon: 'error' });
      return;
    }

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
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
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
              showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
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
        ) : (
          lists.map((list, index) => {
              const isCompleted = list.status === 'completed';
              const targetScreen = isCompleted ? 'HistoryDetail' : 'ListDetail';

              const date = isCompleted ? new Date(list.completedAt || 0) : new Date(list.createdAt);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              const formattedDate = `${day}/${month}/${year}`;

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
                />
              );
            })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleCreateList}>
        <LinearGradient
          colors={[COLORS.gradient.buttonStart, COLORS.gradient.buttonEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={[COLORS.gradient.modalStart, COLORS.gradient.modalEnd]}
            style={styles.modalContent}
          >
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
                <LinearGradient
                  colors={[COLORS.gradient.buttonStart, COLORS.gradient.buttonEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalButtonConfirmGradient}
                >
                  <Text style={styles.modalButtonText}>Create</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

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
                <LinearGradient
                  colors={[COLORS.gradient.buttonStart, COLORS.gradient.buttonEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iosPickerDoneGradient}
                >
                  <Text style={styles.iosPickerDoneText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default HomeScreen;

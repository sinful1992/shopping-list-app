import 'react-native-get-random-values';
import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import createStyles from './HomeScreen.styles';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { getDatabase, ref, update } from '@react-native-firebase/database';
import AnimatedListCard from '../../components/AnimatedListCard';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { ListsStackParamList } from '../../types/navigation';
import AuthenticationModule from '../../services/AuthenticationModule';
import DatabaseMigration from '../../services/DatabaseMigration';
import { useAuth, useShoppingLists } from '../../hooks';
import { formatDateLong, formatDateShort } from '../../utils/date';

/**
 * HomeScreen
 * Displays all active shopping lists
 * Implements Req 2.3, 9.1
 */
const HomeScreen = () => {
  const navigation = useNavigation<StackNavigationProp<ListsStackParamList>>();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { user, familyGroupId } = useAuth();
  const { lists, creating, createList, deleteList, refresh } = useShoppingLists(familyGroupId, user);

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showIOSPicker, setShowIOSPicker] = useState(false);

  useEffect(() => {
    if (user && familyGroupId) {
      loadInitialData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

        await update(ref(getDatabase(), `/users/${user.uid}`), {
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

  const handleQuickScan = async () => {
    if (!user || !familyGroupId) {
      showAlert('Error', 'Sign in required', undefined, { icon: 'error' });
      return;
    }
    try {
      const listName = formatDateLong(new Date());
      const list = await createList(listName);
      if (!list) return;
      navigation.navigate('ReceiptCamera', { listId: list.id, autoAddAll: true });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
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

    const listName = formatDateLong(selectedDate);

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
              const formattedDate = formatDateShort(date);

              const syncStatus = list.syncStatus === 'synced' || list.syncStatus === 'pending'
                ? list.syncStatus
                : 'failed';

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
                  syncStatus={syncStatus}
                  onPress={() => navigation.navigate(targetScreen as 'ListDetail' | 'HistoryDetail', { listId: list.id })}
                  onDelete={() => handleDeleteList(list.id, list.name)}
                  listCardStyle={styles.listCard}
                  completedCardStyle={styles.completedCard}
                  theme={theme}
                />
              );
            })
        )}
      </ScrollView>

      <View style={styles.fabContainer}>
        <Text style={styles.fabHint}>Hold to scan receipt</Text>
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreateList}
          onLongPress={handleQuickScan}
          delayLongPress={500}
        >
          <LinearGradient
            colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Text style={styles.fabText}>+</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>New Shopping List</Text>
            <Text style={styles.modalSubtitle}>Select shopping date:</Text>

            <TouchableOpacity
              style={styles.dateButton}
              onPress={handleOpenDatePicker}
            >
              <Text style={styles.dateButtonText}>
                {formatDateLong(selectedDate)}
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
                  colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
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
                  colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
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

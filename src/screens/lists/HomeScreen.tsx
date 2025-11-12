import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ShoppingList } from '../../models/types';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';

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
  const [newListName, setNewListName] = useState('');

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
    setNewListName('');
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async () => {
    if (!newListName.trim() || !familyGroupId) {
      Alert.alert('Error', 'Please enter a list name');
      return;
    }

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) return;

      await ShoppingListManager.createList(newListName.trim(), user.uid, familyGroupId);
      setShowCreateModal(false);
      setNewListName('');
      await loadLists();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const renderListItem = ({ item }: { item: ShoppingList }) => (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => navigation.navigate('ListDetail' as never, { listId: item.id } as never)}
    >
      <View style={styles.listHeader}>
        <Text style={styles.listName}>{item.name}</Text>
        {item.syncStatus === 'pending' && <Text style={styles.syncBadge}>⏱ Syncing...</Text>}
        {item.syncStatus === 'synced' && <Text style={styles.syncedBadge}>✓ Synced</Text>}
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
            <TextInput
              style={styles.modalInput}
              placeholder="Enter list name"
              placeholderTextColor="#6E6E73"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              onSubmitEditing={handleConfirmCreate}
            />
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
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  listDate: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  syncBadge: {
    fontSize: 12,
    color: '#FFB340',
  },
  syncedBadge: {
    fontSize: 12,
    color: '#30D158',
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
    marginBottom: 20,
    color: '#ffffff',
    textShadowColor: 'rgba(0, 122, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 15,
    fontSize: 16,
    marginBottom: 24,
    color: '#ffffff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
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
});

export default HomeScreen;

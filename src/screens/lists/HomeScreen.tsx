import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
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

  const handleCreateList = async () => {
    Alert.prompt(
      'New Shopping List',
      'Enter list name:',
      async (name) => {
        if (!name || !familyGroupId) return;

        try {
          const user = await AuthenticationModule.getCurrentUser();
          if (!user) return;

          await ShoppingListManager.createList(name, user.uid, familyGroupId);
          await loadLists();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
      }
    );
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  listName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  listDate: {
    fontSize: 14,
    color: '#666',
  },
  syncBadge: {
    fontSize: 12,
    color: '#FF9500',
  },
  syncedBadge: {
    fontSize: 12,
    color: '#34C759',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    color: '#666',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#999',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
  },
});

export default HomeScreen;

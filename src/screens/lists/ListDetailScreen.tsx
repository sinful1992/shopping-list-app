import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Item } from '../../models/types';
import ItemManager from '../../services/ItemManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';

/**
 * ListDetailScreen
 * Displays and manages items in a shopping list
 * Implements Req 2.4, 3.1-3.6
 */
const ListDetailScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { listId } = route.params as { listId: string };
  const [items, setItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [listName, setListName] = useState('');

  useEffect(() => {
    loadListAndItems();
  }, [listId]);

  const loadListAndItems = async () => {
    try {
      const list = await ShoppingListManager.getListById(listId);
      if (list) {
        setListName(list.name);
      }

      const listItems = await ItemManager.getItemsForList(listId);
      setItems(listItems);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) return;

      await ItemManager.addItem(listId, newItemName.trim(), user.uid);
      setNewItemName('');
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleToggleItem = async (itemId: string) => {
    try {
      await ItemManager.toggleItemChecked(itemId);
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await ItemManager.deleteItem(itemId);
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCompleteList = async () => {
    try {
      await ShoppingListManager.markListAsCompleted(listId);
      Alert.alert('Success', 'Shopping list completed!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleTakeReceiptPhoto = () => {
    navigation.navigate('ReceiptCamera' as never, { listId } as never);
  };

  const renderItem = ({ item }: { item: Item }) => (
    <View style={styles.itemRow}>
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => handleToggleItem(item.id)}
      >
        <Text>{item.checked ? '✓' : ' '}</Text>
      </TouchableOpacity>
      <Text style={[styles.itemName, item.checked && styles.itemChecked]}>
        {item.name}
      </Text>
      <TouchableOpacity onPress={() => handleDeleteItem(item.id)}>
        <Text style={styles.deleteButton}>🗑</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{listName}</Text>

      <View style={styles.addItemContainer}>
        <TextInput
          style={styles.input}
          placeholder="Add item..."
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        }
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.receiptButton} onPress={handleTakeReceiptPhoto}>
          <Text style={styles.receiptButtonText}>📷 Take Receipt Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.completeButton} onPress={handleCompleteList}>
          <Text style={styles.completeButtonText}>Complete Shopping</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
  },
  addItemContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
  },
  addButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 10,
    borderRadius: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 15,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    color: '#6E6E73',
  },
  deleteButton: {
    fontSize: 20,
    padding: 5,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  buttonContainer: {
    padding: 10,
  },
  receiptButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 16,
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  receiptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: 'rgba(52, 199, 89, 0.8)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ListDetailScreen;

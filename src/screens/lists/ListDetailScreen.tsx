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
import LocalStorageManager from '../../services/LocalStorageManager';

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
  const [itemPrices, setItemPrices] = useState<{ [key: string]: string }>({});
  const [itemNames, setItemNames] = useState<{ [key: string]: string }>({});

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

  const handlePriceChange = (itemId: string, text: string) => {
    setItemPrices(prev => ({ ...prev, [itemId]: text }));
  };

  const handleSavePrice = async (itemId: string) => {
    const priceText = itemPrices[itemId];
    const price = priceText ? parseFloat(priceText) : null;
    if (priceText && (price === null || isNaN(price))) {
      Alert.alert('Error', 'Please enter a valid number');
      return;
    }
    try {
      await ItemManager.updateItem(itemId, { price });
      setItemPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[itemId];
        return newPrices;
      });
      await loadListAndItems();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleNameChange = (itemId: string, text: string) => {
    setItemNames(prev => ({ ...prev, [itemId]: text }));
  };

  const handleSaveName = async (itemId: string) => {
    const nameText = itemNames[itemId];
    if (!nameText || !nameText.trim()) {
      Alert.alert('Error', 'Item name cannot be empty');
      return;
    }
    try {
      await ItemManager.updateItem(itemId, { name: nameText.trim() });
      setItemNames(prev => {
        const newNames = { ...prev };
        delete newNames[itemId];
        return newNames;
      });
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

  const handleImportReceiptItems = async () => {
    try {
      const receiptData = await LocalStorageManager.getReceiptData(listId);
      if (!receiptData || !receiptData.lineItems || receiptData.lineItems.length === 0) {
        Alert.alert('No Items', 'No receipt items found to import');
        return;
      }

      // Get existing items to check for duplicates
      const existingItems = await ItemManager.getItemsForList(listId);
      const existingNames = new Set(existingItems.map(i => i.name.toLowerCase().trim()));

      // Filter out duplicates
      const newItems = receiptData.lineItems.filter(
        lineItem => !existingNames.has(lineItem.description.toLowerCase().trim())
      );

      if (newItems.length === 0) {
        Alert.alert('No New Items', 'All receipt items already exist in the list');
        return;
      }

      const duplicateCount = receiptData.lineItems.length - newItems.length;
      const message = duplicateCount > 0
        ? `Import ${newItems.length} new items?\n(${duplicateCount} duplicates skipped)`
        : `Import ${newItems.length} items from receipt?`;

      Alert.alert(
        'Import Items',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              const user = await AuthenticationModule.getCurrentUser();
              if (!user) return;

              try {
                // Import each new line item
                for (const lineItem of newItems) {
                  await ItemManager.addItem(
                    listId,
                    lineItem.description,
                    user.uid,
                    lineItem.quantity?.toString() || undefined,
                    lineItem.price || undefined
                  );
                }

                await loadListAndItems();
                Alert.alert('Success', `Imported ${newItems.length} items successfully!`);
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            },
          },
        ]
      );
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
      <View style={styles.itemContent}>
        <View style={styles.nameInputRow}>
          <TextInput
            style={[styles.nameInputField, item.checked && styles.itemChecked]}
            placeholder="Item name"
            placeholderTextColor="#6E6E73"
            value={itemNames[item.id] !== undefined ? itemNames[item.id] : item.name}
            onChangeText={(text) => handleNameChange(item.id, text)}
          />
          {itemNames[item.id] !== undefined && itemNames[item.id] !== item.name && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSaveName(item.id)}
            >
              <Text style={styles.saveButtonText}>✔️</Text>
            </TouchableOpacity>
          )}
          {item.price !== null && item.price !== undefined && !itemNames[item.id] && (
            <Text style={[styles.itemPriceCompact, item.checked && styles.itemChecked]}>
              £{item.price.toFixed(2)}
            </Text>
          )}
        </View>
        <View style={styles.priceInputRow}>
          <TextInput
            style={styles.priceInputField}
            placeholder="Add price"
            placeholderTextColor="#6E6E73"
            value={itemPrices[item.id] !== undefined ? itemPrices[item.id] : (item.price?.toString() || '')}
            onChangeText={(text) => handlePriceChange(item.id, text)}
            keyboardType="numeric"
          />
          {itemPrices[item.id] !== undefined && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSavePrice(item.id)}
            >
              <Text style={styles.saveButtonText}>✔️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
          placeholderTextColor="#6E6E73"
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.importButton} onPress={handleImportReceiptItems}>
        <Text style={styles.importButtonText}>📋 Import Receipt Items</Text>
      </TouchableOpacity>

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
  itemContent: {
    flex: 1,
  },
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameInputField: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: 16,
    marginRight: 8,
  },
  itemPriceCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
    marginLeft: 8,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#34C759',
    marginLeft: 8,
  },
  itemChecked: {
    textDecorationLine: 'line-through',
    color: '#6E6E73',
  },
  priceText: {
    fontSize: 14,
    color: '#34C759',
    marginTop: 4,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceInputField: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: 14,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: '#00E676',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00C853',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
  },
  saveButtonText: {
    fontSize: 16,
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
  importButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
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

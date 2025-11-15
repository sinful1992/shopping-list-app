import database from '@react-native-firebase/database';
import { ShoppingList, Item, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';

/**
 * FirebaseSyncListener
 * Listens to Firebase Realtime Database changes and syncs them to local WatermelonDB
 * This enables true real-time sync across devices
 * Implements Requirements: 4.4, 9.5
 */
class FirebaseSyncListener {
  private activeListeners: Map<string, () => void> = new Map();

  /**
   * Start listening to all lists for a family group
   * When Firebase data changes, update local WatermelonDB
   */
  startListeningToLists(familyGroupId: string): Unsubscribe {
    const key = `lists_${familyGroupId}`;

    // Don't create duplicate listeners
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const listsRef = database().ref(`shoppingLists/${familyGroupId}`);

    // Listen for new lists
    const onChildAdded = listsRef.on('child_added', async (snapshot) => {
      const listId = snapshot.key;
      const listData = snapshot.val();

      if (listId && listData) {
        await this.syncListToLocal(listId, listData);
      }
    });

    // Listen for updated lists
    const onChildChanged = listsRef.on('child_changed', async (snapshot) => {
      const listId = snapshot.key;
      const listData = snapshot.val();

      if (listId && listData) {
        await this.syncListToLocal(listId, listData);
      }
    });

    // Listen for deleted lists
    const onChildRemoved = listsRef.on('child_removed', async (snapshot) => {
      const listId = snapshot.key;

      if (listId) {
        // Mark as deleted in local DB
        try {
          await LocalStorageManager.updateList(listId, {
            status: 'deleted',
            syncStatus: 'synced',
          });
        } catch (error) {
          console.error('Error syncing list deletion:', error);
        }
      }
    });

    // Create unsubscribe function
    const unsubscribe = () => {
      listsRef.off('child_added', onChildAdded);
      listsRef.off('child_changed', onChildChanged);
      listsRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Start listening to items for a specific list
   */
  startListeningToItems(listId: string): Unsubscribe {
    const key = `items_${listId}`;

    // Don't create duplicate listeners
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const itemsRef = database().ref(`items/${listId}`);

    // Listen for new items
    const onChildAdded = itemsRef.on('child_added', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      if (itemId && itemData) {
        await this.syncItemToLocal(listId, itemId, itemData);
      }
    });

    // Listen for updated items
    const onChildChanged = itemsRef.on('child_changed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      if (itemId && itemData) {
        await this.syncItemToLocal(listId, itemId, itemData);
      }
    });

    // Listen for deleted items
    const onChildRemoved = itemsRef.on('child_removed', async (snapshot) => {
      const itemId = snapshot.key;

      if (itemId) {
        // Delete from local DB
        try {
          await LocalStorageManager.deleteItem(itemId);
        } catch (error) {
          console.error('Error syncing item deletion:', error);
        }
      }
    });

    // Create unsubscribe function
    const unsubscribe = () => {
      itemsRef.off('child_added', onChildAdded);
      itemsRef.off('child_changed', onChildChanged);
      itemsRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Sync a list from Firebase to local WatermelonDB
   */
  private async syncListToLocal(listId: string, firebaseData: any): Promise<void> {
    try {
      const list: ShoppingList = {
        id: listId,
        name: firebaseData.name || '',
        familyGroupId: firebaseData.familyGroupId || '',
        createdBy: firebaseData.createdBy || '',
        createdAt: firebaseData.createdAt || Date.now(),
        status: firebaseData.status || 'active',
        completedAt: firebaseData.completedAt || null,
        completedBy: firebaseData.completedBy || null,
        receiptUrl: firebaseData.receiptUrl || null,
        receiptData: firebaseData.receiptData || null,
        syncStatus: 'synced', // Mark as synced since it came from Firebase
        isLocked: firebaseData.isLocked || false,
        lockedBy: firebaseData.lockedBy || null,
        lockedByName: firebaseData.lockedByName || null,
        lockedByRole: firebaseData.lockedByRole || null,
        lockedAt: firebaseData.lockedAt || null,
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveList(list);
    } catch (error) {
      console.error('Error syncing list to local:', error);
    }
  }

  /**
   * Sync an item from Firebase to local WatermelonDB
   */
  private async syncItemToLocal(listId: string, itemId: string, firebaseData: any): Promise<void> {
    try {
      const item: Item = {
        id: itemId,
        listId: listId,
        name: firebaseData.name || '',
        quantity: firebaseData.quantity || null,
        price: firebaseData.price || null,
        checked: firebaseData.checked || false,
        createdBy: firebaseData.createdBy || '',
        createdAt: firebaseData.createdAt || Date.now(),
        updatedAt: firebaseData.updatedAt || Date.now(),
        syncStatus: 'synced', // Mark as synced since it came from Firebase
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveItem(item);
    } catch (error) {
      console.error('Error syncing item to local:', error);
    }
  }

  /**
   * Stop all active listeners
   */
  stopAllListeners(): void {
    this.activeListeners.forEach((unsubscribe) => unsubscribe());
    this.activeListeners.clear();
  }

  /**
   * Stop listening to lists for a family group
   */
  stopListeningToLists(familyGroupId: string): void {
    const key = `lists_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }

  /**
   * Stop listening to items for a list
   */
  stopListeningToItems(listId: string): void {
    const key = `items_${listId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }
}

export default new FirebaseSyncListener();

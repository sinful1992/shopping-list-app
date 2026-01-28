import database from '@react-native-firebase/database';
import { ShoppingList, Item, UrgentItem, CategoryHistory, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import CrashReporting from './CrashReporting';
import { v4 as uuidv4 } from 'uuid';

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

    const listsRef = database().ref(`familyGroups/${familyGroupId}/lists`);

    // Perform initial sync of all existing lists
    listsRef.once('value').then(async (snapshot) => {
      if (snapshot.exists()) {
        const listsData = snapshot.val();
        for (const listId of Object.keys(listsData)) {
          await this.syncListToLocal(listId, listsData[listId]);
        }
      }
    }).catch((error) => {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener.startListeningToLists initial');
    });

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
          CrashReporting.recordError(error as Error, 'FirebaseSyncListener list deletion');
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
  startListeningToItems(familyGroupId: string, listId: string): Unsubscribe {
    const key = `items_${familyGroupId}_${listId}`;

    // Don't create duplicate listeners
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const itemsRef = database().ref(`familyGroups/${familyGroupId}/items`);

    // Listen for new items
    const onChildAdded = itemsRef.on('child_added', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      // Only sync items belonging to this list
      if (itemId && itemData && itemData.listId === listId) {
        await this.syncItemToLocal(listId, itemId, itemData);
      }
    });

    // Listen for updated items
    const onChildChanged = itemsRef.on('child_changed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      // Only sync items belonging to this list
      if (itemId && itemData && itemData.listId === listId) {
        await this.syncItemToLocal(listId, itemId, itemData);
      }
    });

    // Listen for deleted items
    const onChildRemoved = itemsRef.on('child_removed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      // Only delete items belonging to this list
      if (itemId && itemData && itemData.listId === listId) {
        try {
          await LocalStorageManager.deleteItem(itemId);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'FirebaseSyncListener item deletion');
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
        budget: firebaseData.budget || null,
        storeName: firebaseData.storeName || null,
        archived: firebaseData.archived || false,
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveList(list);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncListToLocal');
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
        category: firebaseData.category || null,
        sortOrder: firebaseData.sortOrder || null,
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveItem(item);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncItemToLocal');
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
  stopListeningToItems(familyGroupId: string, listId: string): void {
    const key = `items_${familyGroupId}_${listId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }

  /**
   * Start listening to urgent items for a family group
   */
  startListeningToUrgentItems(familyGroupId: string): Unsubscribe {
    const key = `urgent_items_${familyGroupId}`;

    // Don't create duplicate listeners
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const urgentItemsRef = database().ref(`urgentItems/${familyGroupId}`);

    // Listen for new urgent items
    const onChildAdded = urgentItemsRef.on('child_added', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      if (itemId && itemData) {
        await this.syncUrgentItemToLocal(familyGroupId, itemId, itemData);
      }
    });

    // Listen for updated urgent items
    const onChildChanged = urgentItemsRef.on('child_changed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      if (itemId && itemData) {
        await this.syncUrgentItemToLocal(familyGroupId, itemId, itemData);
      }
    });

    // Listen for deleted urgent items
    const onChildRemoved = urgentItemsRef.on('child_removed', async (snapshot) => {
      const itemId = snapshot.key;

      if (itemId) {
        try {
          await LocalStorageManager.deleteUrgentItem(itemId);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'FirebaseSyncListener urgent item deletion');
        }
      }
    });

    // Create unsubscribe function
    const unsubscribe = () => {
      urgentItemsRef.off('child_added', onChildAdded);
      urgentItemsRef.off('child_changed', onChildChanged);
      urgentItemsRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Sync an urgent item from Firebase to local WatermelonDB
   */
  private async syncUrgentItemToLocal(familyGroupId: string, itemId: string, firebaseData: any): Promise<void> {
    try {
      const urgentItem: UrgentItem = {
        id: itemId,
        name: firebaseData.name || '',
        familyGroupId: firebaseData.familyGroupId || familyGroupId,
        createdBy: firebaseData.createdBy || '',
        createdByName: firebaseData.createdByName || '',
        createdAt: firebaseData.createdAt || Date.now(),
        resolvedBy: firebaseData.resolvedBy || null,
        resolvedByName: firebaseData.resolvedByName || null,
        resolvedAt: firebaseData.resolvedAt || null,
        price: firebaseData.price || null,
        status: firebaseData.status || 'active',
        syncStatus: 'synced', // Mark as synced since it came from Firebase
      };

      // Save to local DB (will create or update)
      await LocalStorageManager.saveUrgentItem(urgentItem);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncUrgentItemToLocal');
    }
  }

  /**
   * Stop listening to urgent items for a family group
   */
  stopListeningToUrgentItems(familyGroupId: string): void {
    const key = `urgent_items_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }

  /**
   * Start listening to category history for a family group
   * Syncs Firebase category usage data to local WatermelonDB
   */
  startListeningToCategoryHistory(familyGroupId: string): Unsubscribe {
    const key = `category_history_${familyGroupId}`;

    // Don't create duplicate listeners
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const categoryHistoryRef = database().ref(`familyGroups/${familyGroupId}/categoryHistory`);

    // Perform initial sync of all existing category history
    categoryHistoryRef.once('value').then(async (snapshot) => {
      if (snapshot.exists()) {
        const historyData = snapshot.val();
        for (const itemHash of Object.keys(historyData)) {
          const categoriesForItem = historyData[itemHash];
          for (const category of Object.keys(categoriesForItem)) {
            const data = categoriesForItem[category];
            await this.syncCategoryHistoryToLocal(familyGroupId, itemHash, data);
          }
        }
      }
    }).catch((error) => {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener categoryHistory initial');
    });

    // Listen for new/updated category history
    const onChildAdded = categoryHistoryRef.on('child_added', async (itemSnapshot) => {
      const itemHash = itemSnapshot.key;
      if (itemHash) {
        const categoriesForItem = itemSnapshot.val();
        for (const category of Object.keys(categoriesForItem)) {
          const data = categoriesForItem[category];
          await this.syncCategoryHistoryToLocal(familyGroupId, itemHash, data);
        }
      }
    });

    const onChildChanged = categoryHistoryRef.on('child_changed', async (itemSnapshot) => {
      const itemHash = itemSnapshot.key;
      if (itemHash) {
        const categoriesForItem = itemSnapshot.val();
        for (const category of Object.keys(categoriesForItem)) {
          const data = categoriesForItem[category];
          await this.syncCategoryHistoryToLocal(familyGroupId, itemHash, data);
        }
      }
    });

    // Create unsubscribe function
    const unsubscribe = () => {
      categoryHistoryRef.off('child_added', onChildAdded);
      categoryHistoryRef.off('child_changed', onChildChanged);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Sync category history data from Firebase to local WatermelonDB
   */
  private async syncCategoryHistoryToLocal(
    familyGroupId: string,
    itemHash: string,
    firebaseData: any
  ): Promise<void> {
    try {
      // Unhash the item name (reverse the hashing done in CategoryHistoryService)
      const itemNameNormalized = itemHash.replace(/_/g, '.');

      // Check if we already have this record
      const existingRecords = await LocalStorageManager.getCategoryHistoryForItem(
        familyGroupId,
        itemNameNormalized
      );

      const existing = existingRecords.find((record) => record.category === firebaseData.category);

      if (existing) {
        // Update existing record with Firebase data
        await LocalStorageManager.updateCategoryHistory(existing.id, {
          usageCount: firebaseData.usageCount || 1,
          lastUsedAt: firebaseData.lastUsedAt || Date.now(),
        });
      } else {
        // Create new record from Firebase data
        const categoryHistory: CategoryHistory = {
          id: uuidv4(),
          familyGroupId,
          itemNameNormalized,
          category: firebaseData.category,
          usageCount: firebaseData.usageCount || 1,
          lastUsedAt: firebaseData.lastUsedAt || Date.now(),
          createdAt: firebaseData.createdAt || Date.now(),
        };

        await LocalStorageManager.saveCategoryHistory(categoryHistory);
      }
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncCategoryHistoryToLocal');
    }
  }

  /**
   * Stop listening to category history for a family group
   */
  stopListeningToCategoryHistory(familyGroupId: string): void {
    const key = `category_history_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }
}

export default new FirebaseSyncListener();

import database from '@react-native-firebase/database';
import { ShoppingList, Item, UrgentItem, CategoryHistory, PriceHistoryRecord, StoreLayout, Unsubscribe } from '../models/types';
import { CategoryType } from './CategoryService';
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

    // Listen for new lists (child_added fires for existing children on attach)
    const onChildAdded = listsRef.on('child_added', async (snapshot) => {
      const listId = snapshot.key;
      const listData = snapshot.val();

      if (listId && listData) {
        await this.syncListToLocal(listId, listData, familyGroupId);
      }
    });

    // Listen for updated lists
    const onChildChanged = listsRef.on('child_changed', async (snapshot) => {
      const listId = snapshot.key;
      const listData = snapshot.val();

      if (listId && listData) {
        await this.syncListToLocal(listId, listData, familyGroupId);
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
    if (this.activeListeners.has(key)) return this.activeListeners.get(key)!;

    const itemsRef = database().ref(`familyGroups/${familyGroupId}/items`);
    let isCancelled = false;
    let offChildAdded: (() => void) | null = null;
    const initialItemIds = new Set<string>();

    const filteredRef = itemsRef.orderByChild('listId').equalTo(listId);
    const initialBuffer: { id: string; data: any }[] = [];
    let initialLoadDone = false;

    // Batch-write buffered items to local DB once all initial child_added events arrive.
    // initialLoadDone is set synchronously before async work to guard against double-flush.
    const flushBuffer = async () => {
      if (initialLoadDone) return;
      if (isCancelled) return;
      initialLoadDone = true;
      initialBuffer.forEach(({ id }) => initialItemIds.add(id));
      const localItems = await LocalStorageManager.getItemsForList(listId);
      if (isCancelled) return;
      const localMap = new Map(localItems.map(i => [i.id, i]));
      const toSync: Item[] = [];
      for (const { id, data } of initialBuffer) {
        const item = this.buildItemFromFirebase(id, listId, data);
        const existing = localMap.get(id);
        if (existing && !this.hasItemChanged(existing, item)) continue;
        if (existing && existing.updatedAt > (data.updatedAt || 0)) continue;
        toSync.push(item);
      }
      if (toSync.length > 0) {
        await LocalStorageManager.saveItemsBatchUpsert(toSync);
      }
    };

    const safeFlush = async () => {
      try { await flushBuffer(); }
      catch (e) { CrashReporting.recordError(e as Error, 'FirebaseSyncListener items flush'); }
    };

    // Collect initial items via child_added; after initialLoadDone, route new items individually.
    const childAddedCb = filteredRef.on('child_added', async (snap) => {
      if (!snap.key) return;
      if (!initialLoadDone) {
        initialBuffer.push({ id: snap.key, data: snap.val() });
        return;
      }
      if (initialItemIds.has(snap.key)) return;
      await this.syncItemToLocal(listId, snap.key, snap.val());
    });
    offChildAdded = () => filteredRef.off('child_added', childAddedCb);

    // value fires after all initial child_added events — use as "done" sentinel.
    // Second argument catches once('value') rejections without swallowing safeFlush errors.
    filteredRef.once('value').then(safeFlush, async (err) => {
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener items value sentinel');
      await safeFlush();
    });

    const onChildChanged = filteredRef.on('child_changed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();
      if (itemId && itemData) {
        await this.syncItemToLocal(listId, itemId, itemData);
      }
    });

    const onChildRemoved = filteredRef.on('child_removed', async (snapshot) => {
      const itemId = snapshot.key;
      if (itemId) {
        try {
          await LocalStorageManager.deleteItem(itemId);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'FirebaseSyncListener item deletion');
        }
      }
    });

    const unsubscribe = () => {
      isCancelled = true;
      offChildAdded?.();
      filteredRef.off('child_changed', onChildChanged);
      filteredRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Sync a list from Firebase to local WatermelonDB
   * Skips the write if the list already exists locally with identical data,
   * preventing observer flicker from echo-back writes.
   */
  private async syncListToLocal(
    listId: string,
    firebaseData: any,
    familyGroupId: string
  ): Promise<void> {
    try {
      const existingList = await LocalStorageManager.getList(listId);
      const resolvedFamilyGroupId = firebaseData.familyGroupId
        || existingList?.familyGroupId
        || familyGroupId;

      const incomingList: ShoppingList = {
        id: listId,
        name: firebaseData.name || '',
        familyGroupId: resolvedFamilyGroupId,
        createdBy: firebaseData.createdBy || '',
        createdAt: firebaseData.createdAt || Date.now(),
        status: firebaseData.status || 'active',
        completedAt: firebaseData.completedAt || null,
        completedBy: firebaseData.completedBy || null,
        receiptUrl: firebaseData.receiptUrl || null,
        receiptData: firebaseData.receiptData || null,
        syncStatus: 'synced',
        isLocked: firebaseData.isLocked || false,
        lockedBy: firebaseData.lockedBy || null,
        lockedByName: firebaseData.lockedByName || null,
        lockedByRole: firebaseData.lockedByRole || null,
        lockedAt: firebaseData.lockedAt || null,
        budget: firebaseData.budget || null,
        storeName: firebaseData.storeName || null,
        archived: firebaseData.archived || false,
        layoutApplied: firebaseData.layoutApplied ?? false,
      };

      if (existingList && !this.hasListChanged(existingList, incomingList)) {
        return;
      }

      await LocalStorageManager.saveList(incomingList);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncListToLocal');
    }
  }

  /**
   * Compare local and incoming list data to detect meaningful changes.
   * Returns true if any user-visible field differs.
   */
  private hasListChanged(local: ShoppingList, incoming: ShoppingList): boolean {
    return (
      local.name !== incoming.name ||
      local.status !== incoming.status ||
      local.isLocked !== incoming.isLocked ||
      local.lockedBy !== incoming.lockedBy ||
      local.completedAt !== incoming.completedAt ||
      local.completedBy !== incoming.completedBy ||
      local.budget !== incoming.budget ||
      local.storeName !== incoming.storeName ||
      local.archived !== incoming.archived ||
      local.receiptUrl !== incoming.receiptUrl ||
      (local.layoutApplied ?? false) !== (incoming.layoutApplied ?? false)
    );
  }

  /**
   * Sync an item from Firebase to local WatermelonDB
   * Skips the write if the item already exists locally with identical data,
   * preventing observer flicker from echo-back writes.
   */
  private buildItemFromFirebase(itemId: string, listId: string, data: any): Item {
    return {
      id: itemId,
      listId,
      name: data.name || '',
      quantity: data.quantity ?? null,
      price: data.price ?? null,
      checked: data.checked || false,
      createdBy: data.createdBy || '',
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      syncStatus: 'synced',
      category: data.category || null,
      sortOrder: data.sortOrder ?? null,
      unitQty: data.unitQty ?? null,
    };
  }

  private async syncItemToLocal(listId: string, itemId: string, firebaseData: any): Promise<void> {
    try {
      const existingItem = await LocalStorageManager.getItem(itemId);
      const item = this.buildItemFromFirebase(itemId, listId, firebaseData);

      if (existingItem && !this.hasItemChanged(existingItem, item)) {
        return;
      }

      if (existingItem && existingItem.updatedAt > (firebaseData.updatedAt || 0)) {
        return;
      }

      await LocalStorageManager.saveItem(item);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncItemToLocal');
    }
  }

  /**
   * Compare local and incoming item data to detect meaningful changes.
   * Returns true if any user-visible field differs.
   */
  private hasItemChanged(local: Item, incoming: Item): boolean {
    return (
      local.name !== incoming.name ||
      local.quantity !== incoming.quantity ||
      local.price !== incoming.price ||
      local.checked !== incoming.checked ||
      local.category !== incoming.category ||
      local.sortOrder !== incoming.sortOrder ||
      local.unitQty !== incoming.unitQty
    );
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
   * Skips the write if the item already exists locally with identical data,
   * preventing observer flicker from echo-back writes.
   */
  private async syncUrgentItemToLocal(familyGroupId: string, itemId: string, firebaseData: any): Promise<void> {
    try {
      const existingItem = await LocalStorageManager.getUrgentItem(itemId);

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
        syncStatus: 'synced',
      };

      if (existingItem && !this.hasUrgentItemChanged(existingItem, urgentItem)) {
        return;
      }

      await LocalStorageManager.saveUrgentItem(urgentItem);
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncUrgentItemToLocal');
    }
  }

  /**
   * Compare local and incoming urgent item data to detect meaningful changes.
   * Returns true if any user-visible field differs.
   */
  private hasUrgentItemChanged(local: UrgentItem, incoming: UrgentItem): boolean {
    return (
      local.name !== incoming.name ||
      local.status !== incoming.status ||
      local.resolvedBy !== incoming.resolvedBy ||
      local.resolvedByName !== incoming.resolvedByName ||
      local.resolvedAt !== incoming.resolvedAt ||
      local.price !== incoming.price
    );
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

    // Listen for new/updated category history (child_added fires for existing children on attach)
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

  /**
   * Map raw Firebase data to a PriceHistoryRecord.
   * Returns null for malformed records (missing id or price) so callers can skip them.
   */
  private mapToPriceRecord(data: any): PriceHistoryRecord | null {
    if (!data?.id || data?.price === undefined || data?.price === null) {
      CrashReporting.recordError(
        new Error(`Malformed priceHistory record: id=${data?.id}, price=${data?.price}`),
        'FirebaseSyncListener.mapToPriceRecord'
      );
      return null;
    }
    return {
      id: data.id,
      itemName: data.itemName ?? '',
      itemNameNormalized: data.itemNameNormalized ?? '',
      price: data.price,
      storeName: data.storeName ?? null,
      listId: data.listId ?? null,
      recordedAt: data.recordedAt ?? 0,
      familyGroupId: data.familyGroupId ?? '',
    };
  }

  /**
   * Start listening to price history for a family group.
   * Phase 1: bulk load all existing records via once('value').
   * Phase 2: stream new records via child_added filtered to post-session timestamps.
   */
  startListeningToPriceHistory(familyGroupId: string): Unsubscribe {
    const key = `price_history_${familyGroupId}`;
    if (this.activeListeners.has(key)) return this.activeListeners.get(key)!;

    const baseRef = database().ref(`familyGroups/${familyGroupId}/priceHistory`);
    const sessionStart = Date.now();

    baseRef.once('value').then(async (snapshot) => {
      const records: PriceHistoryRecord[] = [];
      snapshot.forEach(child => {
        const data = child.val();
        if (data) {
          const record = this.mapToPriceRecord(data);
          if (record) records.push(record);
        }
      });
      await LocalStorageManager.savePriceHistoryBatch(records);
    }).catch(err => CrashReporting.recordError(err as Error, 'FirebaseSyncListener priceHistory batch'));

    const ongoingRef = baseRef.orderByChild('recordedAt').startAt(sessionStart);
    const onChildAdded = ongoingRef.on('child_added', async (snapshot) => {
      try {
        const data = snapshot.val();
        if (data) {
          const record = this.mapToPriceRecord(data);
          if (record) await LocalStorageManager.savePriceHistoryRecord(record);
        }
      } catch (err) {
        CrashReporting.recordError(err as Error, 'FirebaseSyncListener priceHistory child_added');
      }
    });

    const unsubscribe = () => {
      ongoingRef.off('child_added', onChildAdded);
      this.activeListeners.delete(key);
    };
    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  /**
   * Start listening to store layouts for a family group
   */
  startListeningToStoreLayouts(familyGroupId: string): Unsubscribe {
    const key = `storeLayouts_${familyGroupId}`;

    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const layoutsRef = database().ref(`familyGroups/${familyGroupId}/storeLayouts`);

    const onChildAdded = layoutsRef.on('child_added', async (snapshot) => {
      const layoutId = snapshot.key;
      const data = snapshot.val();
      if (layoutId && data) {
        await this.syncStoreLayoutToLocal(familyGroupId, layoutId, data);
      }
    });

    const onChildChanged = layoutsRef.on('child_changed', async (snapshot) => {
      const layoutId = snapshot.key;
      const data = snapshot.val();
      if (layoutId && data) {
        await this.syncStoreLayoutToLocal(familyGroupId, layoutId, data);
      }
    });

    const onChildRemoved = layoutsRef.on('child_removed', async (snapshot) => {
      const layoutId = snapshot.key;
      if (layoutId) {
        try {
          await LocalStorageManager.deleteStoreLayout(layoutId);
        } catch (error) {
          CrashReporting.recordError(error as Error, 'FirebaseSyncListener store layout deletion');
        }
      }
    });

    const unsubscribe = () => {
      layoutsRef.off('child_added', onChildAdded);
      layoutsRef.off('child_changed', onChildChanged);
      layoutsRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  private async syncStoreLayoutToLocal(
    familyGroupId: string,
    layoutId: string,
    firebaseData: any
  ): Promise<void> {
    try {
      const existing = await LocalStorageManager.getStoreLayoutById(layoutId);

      // categoryOrder from Firebase arrives as a native JS array (RTDB reconstructs it)
      const incomingLayout: StoreLayout = {
        id: layoutId,
        familyGroupId: firebaseData.familyGroupId || familyGroupId,
        storeName: firebaseData.storeName || '',
        categoryOrder: firebaseData.categoryOrder as CategoryType[],
        createdBy: firebaseData.createdBy || '',
        createdAt: firebaseData.createdAt || Date.now(),
        updatedAt: firebaseData.updatedAt || Date.now(),
        syncStatus: 'synced',
      };

      if (existing) {
        await LocalStorageManager.updateStoreLayout(layoutId, {
          categoryOrder: incomingLayout.categoryOrder,
          updatedAt: incomingLayout.updatedAt,
          syncStatus: 'synced',
        });
      } else {
        await LocalStorageManager.saveStoreLayout(incomingLayout);
      }
    } catch (error) {
      CrashReporting.recordError(error as Error, 'FirebaseSyncListener syncStoreLayoutToLocal');
    }
  }

  /**
   * Stop listening to store layouts for a family group
   */
  stopListeningToStoreLayouts(familyGroupId: string): void {
    const key = `storeLayouts_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }

  /**
   * Stop listening to price history for a family group
   */
  stopListeningToPriceHistory(familyGroupId: string): void {
    const key = `price_history_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) {
      unsubscribe();
    }
  }
}

export default new FirebaseSyncListener();

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

    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const listsRef = database().ref(`familyGroups/${familyGroupId}/lists`);
    const initialIds = new Set<string>();
    let initialLoadDone = false;

    // child_added: no-op during initial load, handles new records after
    const onChildAdded = listsRef.on('child_added', async (snapshot) => {
      if (!snapshot.key || !snapshot.val()) return;
      if (!initialLoadDone) return;
      if (initialIds.has(snapshot.key)) return;
      await this.syncListToLocal(snapshot.key, snapshot.val(), familyGroupId);
    });

    // once('value'): sole initial load path
    listsRef.once('value').then(async (snapshot) => {
      const lists: ShoppingList[] = [];
      snapshot.forEach(child => {
        if (child.key && child.val()) {
          initialIds.add(child.key);
          const data = child.val();
          lists.push({
            id: child.key,
            name: data.name || '',
            familyGroupId: data.familyGroupId || familyGroupId,
            createdBy: data.createdBy || '',
            createdAt: data.createdAt || Date.now(),
            status: data.status || 'active',
            completedAt: data.completedAt || null,
            completedBy: data.completedBy || null,
            receiptUrl: data.receiptUrl || null,
            receiptData: data.receiptData || null,
            syncStatus: 'synced' as const,
            isLocked: data.isLocked || false,
            lockedBy: data.lockedBy || null,
            lockedByName: data.lockedByName || null,
            lockedByRole: data.lockedByRole || null,
            lockedAt: data.lockedAt || null,
            budget: data.budget ?? null,
            storeName: data.storeName || null,
            archived: data.archived || false,
            layoutApplied: data.layoutApplied ?? false,
          });
        }
      });
      initialLoadDone = true;
      if (lists.length > 0) {
        await LocalStorageManager.saveListsBatch(lists);
      }
    }).catch(err => {
      initialLoadDone = true;
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener lists initial load');
    });

    const onChildChanged = listsRef.on('child_changed', async (snapshot) => {
      const listId = snapshot.key;
      const listData = snapshot.val();

      if (listId && listData) {
        await this.syncListToLocal(listId, listData, familyGroupId);
      }
    });

    const onChildRemoved = listsRef.on('child_removed', async (snapshot) => {
      const listId = snapshot.key;

      if (listId) {
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
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const itemsRef = database().ref(`familyGroups/${familyGroupId}/items`);
    let isCancelled = false;
    const initialItemIds = new Set<string>();

    const filteredRef = itemsRef.orderByChild('listId').equalTo(listId);
    let initialLoadDone = false;

    // child_added: no-op during initial load, handles new records after
    const childAddedCb = filteredRef.on('child_added', async (snap) => {
      if (!snap.key) return;
      if (!initialLoadDone) return;
      if (initialItemIds.has(snap.key)) return;
      await this.syncItemToLocal(listId, snap.key, snap.val());
    });

    // once('value'): sole initial load path
    filteredRef.once('value').then(async (snapshot) => {
      if (isCancelled) return;
      const entries: { id: string; data: any }[] = [];
      snapshot.forEach(child => {
        if (child.key && child.val()) {
          initialItemIds.add(child.key);
          entries.push({ id: child.key, data: child.val() });
        }
      });
      initialLoadDone = true;

      const localItems = await LocalStorageManager.getItemsForList(listId);
      if (isCancelled) return;
      const localMap = new Map(localItems.map(i => [i.id, i]));
      const toSync: Item[] = [];
      for (const { id, data } of entries) {
        const item = this.buildItemFromFirebase(id, listId, data);
        const existing = localMap.get(id);
        if (existing && !this.hasItemChanged(existing, item)) continue;
        if (existing && existing.updatedAt > (data.updatedAt || 0)) continue;
        toSync.push(item);
      }
      if (toSync.length > 0) {
        await LocalStorageManager.saveItemsBatchUpsert(toSync);
      }
    }).catch(err => {
      initialLoadDone = true;
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener items initial load');
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
      if (!itemId) return;
      try {
        const snap = await itemsRef.child(itemId).once('value');
        if (snap.exists()) return;
        await LocalStorageManager.deleteItem(itemId);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'FirebaseSyncListener item deletion');
      }
    });

    const unsubscribe = () => {
      isCancelled = true;
      filteredRef.off('child_added', childAddedCb);
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
        budget: firebaseData.budget ?? null,
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
      measurementUnit: data.measurementUnit ?? null,
      measurementValue: data.measurementValue ?? null,
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
      local.unitQty !== incoming.unitQty ||
      local.measurementUnit !== incoming.measurementUnit ||
      local.measurementValue !== incoming.measurementValue
    );
  }

  /**
   * One-time fetch of items for a completed list from Firebase.
   * Used by HistoryDetailScreen when local DB has no items for the list
   * (e.g. fresh install or new device where items were never synced locally).
   * Saves results to WatermelonDB so subsequent opens are instant.
   */
  async fetchItemsOnceForHistory(familyGroupId: string, listId: string): Promise<Item[]> {
    const itemsRef = database().ref(`familyGroups/${familyGroupId}/items`);
    const filteredRef = itemsRef.orderByChild('listId').equalTo(listId);
    const snapshot = await filteredRef.once('value');
    const items: Item[] = [];
    snapshot.forEach(child => {
      if (child.key) {
        items.push(this.buildItemFromFirebase(child.key, listId, child.val()));
      }
    });
    if (items.length > 0) {
      await LocalStorageManager.saveItemsBatchUpsert(items);
    }
    return items;
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

    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const urgentItemsRef = database().ref(`urgentItems/${familyGroupId}`);
    const initialBuffer: { itemId: string; data: any }[] = [];
    let initialLoadDone = false;

    const flushBuffer = async () => {
      if (initialLoadDone) return;
      initialLoadDone = true;
      if (initialBuffer.length === 0) return;

      const urgentItems: UrgentItem[] = initialBuffer.map(({ itemId, data }) => ({
        id: itemId,
        name: data.name || '',
        familyGroupId: data.familyGroupId || familyGroupId,
        createdBy: data.createdBy || '',
        createdByName: data.createdByName || '',
        createdAt: data.createdAt || Date.now(),
        resolvedBy: data.resolvedBy || null,
        resolvedByName: data.resolvedByName || null,
        resolvedAt: data.resolvedAt || null,
        price: data.price ?? null,
        status: data.status || 'active',
        syncStatus: 'synced' as const,
      }));

      await LocalStorageManager.saveUrgentItemsBatch(urgentItems);
    };

    const safeFlush = async () => {
      try { await flushBuffer(); }
      catch (e) { CrashReporting.recordError(e as Error, 'FirebaseSyncListener urgentItems flush'); }
    };

    const onChildAdded = urgentItemsRef.on('child_added', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();
      if (!itemId || !itemData) return;

      if (!initialLoadDone) {
        initialBuffer.push({ itemId, data: itemData });
        return;
      }

      await this.syncUrgentItemToLocal(familyGroupId, itemId, itemData);
    });

    urgentItemsRef.once('value').then(safeFlush, async (err) => {
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener urgentItems value sentinel');
      await safeFlush();
    });

    const onChildChanged = urgentItemsRef.on('child_changed', async (snapshot) => {
      const itemId = snapshot.key;
      const itemData = snapshot.val();

      if (itemId && itemData) {
        await this.syncUrgentItemToLocal(familyGroupId, itemId, itemData);
      }
    });

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
        price: firebaseData.price ?? null,
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

    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const categoryHistoryRef = database().ref(`familyGroups/${familyGroupId}/categoryHistory`);
    const initialBuffer: { itemHash: string; data: any }[] = [];
    let initialLoadDone = false;

    const flushBuffer = async () => {
      if (initialLoadDone) return;
      initialLoadDone = true;
      if (initialBuffer.length > 0) {
        await LocalStorageManager.saveCategoryHistoryBatch(familyGroupId, initialBuffer);
      }
    };

    const safeFlush = async () => {
      try { await flushBuffer(); }
      catch (e) { CrashReporting.recordError(e as Error, 'FirebaseSyncListener categoryHistory flush'); }
    };

    const onChildAdded = categoryHistoryRef.on('child_added', async (itemSnapshot) => {
      const itemHash = itemSnapshot.key;
      if (!itemHash) return;
      const categoriesForItem = itemSnapshot.val();
      if (!categoriesForItem || typeof categoriesForItem !== 'object') return;

      if (!initialLoadDone) {
        for (const category of Object.keys(categoriesForItem)) {
          initialBuffer.push({ itemHash, data: categoriesForItem[category] });
        }
        return;
      }

      for (const category of Object.keys(categoriesForItem)) {
        await this.syncCategoryHistoryToLocal(familyGroupId, itemHash, categoriesForItem[category]);
      }
    });

    categoryHistoryRef.once('value').then(safeFlush, async (err) => {
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener categoryHistory value sentinel');
      await safeFlush();
    });

    const onChildChanged = categoryHistoryRef.on('child_changed', async (itemSnapshot) => {
      const itemHash = itemSnapshot.key;
      if (itemHash) {
        const categoriesForItem = itemSnapshot.val();
        if (!categoriesForItem || typeof categoriesForItem !== 'object') return;
        for (const category of Object.keys(categoriesForItem)) {
          const data = categoriesForItem[category];
          await this.syncCategoryHistoryToLocal(familyGroupId, itemHash, data);
        }
      }
    });

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
    if (this.activeListeners.has(key)) {
      return this.activeListeners.get(key)!;
    }

    const baseRef = database().ref(`familyGroups/${familyGroupId}/priceHistory`);
    const sessionStart = Date.now();
    let batchLoadDone = false;

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
      batchLoadDone = true;
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
    const initialBuffer: { layoutId: string; data: any }[] = [];
    let initialLoadDone = false;

    const flushBuffer = async () => {
      if (initialLoadDone) return;
      initialLoadDone = true;
      if (initialBuffer.length > 0) {
        await LocalStorageManager.saveStoreLayoutsBatch(familyGroupId, initialBuffer);
      }
    };

    const safeFlush = async () => {
      try { await flushBuffer(); }
      catch (e) { CrashReporting.recordError(e as Error, 'FirebaseSyncListener storeLayouts flush'); }
    };

    const onChildAdded = layoutsRef.on('child_added', async (snapshot) => {
      const layoutId = snapshot.key;
      const data = snapshot.val();
      if (!layoutId || !data) return;

      if (!initialLoadDone) {
        initialBuffer.push({ layoutId, data });
        return;
      }

      await this.syncStoreLayoutToLocal(familyGroupId, layoutId, data);
    });

    layoutsRef.once('value').then(safeFlush, async (err) => {
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener storeLayouts value sentinel');
      await safeFlush();
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

  /**
   * Start listening to item preferences for a family group.
   * Syncs measurement preferences from Firebase to local WatermelonDB.
   */
  startListeningToItemPreferences(familyGroupId: string): Unsubscribe {
    const key = `item_preferences_${familyGroupId}`;
    if (this.activeListeners.has(key)) return this.activeListeners.get(key)!;

    const prefsRef = database().ref(`familyGroups/${familyGroupId}/itemPreferences`);
    const initialBuffer: { itemNameNormalized: string; unit: string; value: number | null }[] = [];
    let initialLoadDone = false;

    const flushBuffer = async () => {
      if (initialLoadDone) return;
      initialLoadDone = true;
      if (initialBuffer.length > 0) {
        await LocalStorageManager.saveItemPreferencesBatch(familyGroupId, initialBuffer);
      }
    };

    const safeFlush = async () => {
      try { await flushBuffer(); }
      catch (e) { CrashReporting.recordError(e as Error, 'FirebaseSyncListener itemPreferences flush'); }
    };

    const onChildAdded = prefsRef.on('child_added', async (snapshot) => {
      const itemKey = snapshot.key;
      const data = snapshot.val();
      if (!itemKey || !data?.unit) return;

      const normalized = itemKey.replace(/_/g, '.');

      if (!initialLoadDone) {
        initialBuffer.push({ itemNameNormalized: normalized, unit: data.unit, value: data.value ?? null });
        return;
      }

      await LocalStorageManager.saveItemPreference(familyGroupId, normalized, data.unit, data.value ?? null);
    });

    prefsRef.once('value').then(safeFlush, async (err) => {
      CrashReporting.recordError(err as Error, 'FirebaseSyncListener itemPreferences value sentinel');
      await safeFlush();
    });

    const onChildChanged = prefsRef.on('child_changed', async (snapshot) => {
      const itemKey = snapshot.key;
      const data = snapshot.val();
      if (itemKey && data?.unit) {
        const normalized = itemKey.replace(/_/g, '.');
        await LocalStorageManager.saveItemPreference(familyGroupId, normalized, data.unit, data.value ?? null);
      }
    });

    const onChildRemoved = prefsRef.on('child_removed', async (snapshot) => {
      const itemKey = snapshot.key;
      if (itemKey) {
        const normalized = itemKey.replace(/_/g, '.');
        await LocalStorageManager.deleteItemPreference(familyGroupId, normalized);
      }
    });

    const unsubscribe = () => {
      prefsRef.off('child_added', onChildAdded);
      prefsRef.off('child_changed', onChildChanged);
      prefsRef.off('child_removed', onChildRemoved);
      this.activeListeners.delete(key);
    };

    this.activeListeners.set(key, unsubscribe);
    return unsubscribe;
  }

  stopListeningToItemPreferences(familyGroupId: string): void {
    const key = `item_preferences_${familyGroupId}`;
    const unsubscribe = this.activeListeners.get(key);
    if (unsubscribe) unsubscribe();
  }
}

export default new FirebaseSyncListener();

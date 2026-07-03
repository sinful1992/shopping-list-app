import { Database, Q } from '@nozbe/watermelondb';
import { ShoppingList, ReceiptData } from '../../models/types';
import CrashReporting from '../CrashReporting';
import { ShoppingListModel } from '../../database/models/ShoppingList';
import { applyListCreate, applyListFullUpdate, hasListChanged, listModelToType } from './mappers';

/**
 * Lists storage domain: shopping lists plus their receipt/expenditure reads.
 * Receives the shared WatermelonDB handle from LocalStorageManager (the facade);
 * all methods moved verbatim from LocalStorageManager.
 */
export class ListsStorage {
  constructor(private database: Database) {}

  /**
   * Save shopping list (create or update)
   */
  async saveList(list: ShoppingList): Promise<ShoppingList> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');

      let listRecord: ShoppingListModel | undefined;

      await this.database.write(async () => {
        const existing = await listsCollection.query(Q.where('id', list.id)).fetch();
        if (existing.length > 0) {
          listRecord = existing[0];
          await listRecord.update((record) => { applyListFullUpdate(record, list); });
        } else {
          listRecord = await listsCollection.create((record) => { applyListCreate(record, list); });
        }
      }, 'saveList');

      return listModelToType(listRecord!);
    } catch (error: any) {
      throw new Error(`Failed to save list: ${error.message}`);
    }
  }

  /**
   * Batch upsert lists in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveListsBatch(lists: ShoppingList[]): Promise<void> {
    if (lists.length === 0) return;

    const collection = this.database.get<ShoppingListModel>('shopping_lists');

    const existingRecords = await collection
      .query(Q.where('id', Q.oneOf(lists.map(l => l.id))))
      .fetch();

    const existingMap = new Map(existingRecords.map(r => [r.id, r]));

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const list of lists) {
        const existing = existingMap.get(list.id);
        if (existing) {
          const local = listModelToType(existing);
          if (!hasListChanged(local, list)) continue;
          ops.push(existing.prepareUpdate(r => applyListFullUpdate(r, list)));
        } else {
          ops.push(collection.prepareCreate(r => applyListCreate(r, list)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveListsBatch batch failed, falling back to individual writes');
        for (const list of lists) {
          try {
            const records = await collection.query(Q.where('id', list.id)).fetch();
            const rec = records[0];
            if (rec) {
              const local = listModelToType(rec);
              if (!hasListChanged(local, list)) continue;
              await rec.update(r => applyListFullUpdate(r, list));
            } else {
              await collection.create(r => applyListCreate(r, list));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveListsBatch individual write failed for ${list.id}`);
          }
        }
      }
    }, 'saveListsBatch');
  }

  /**
   * Get shopping list by ID
   */
  async getList(listId: string): Promise<ShoppingList | null> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);
      return listModelToType(listRecord);
    } catch {
      return null;
    }
  }

  /**
   * Get all lists for family group
   */
  async getAllLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const lists = await listsCollection
        .query(
          Q.where('family_group_id', familyGroupId)
        )
        .fetch();

      return lists.map((list) => listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get lists: ${error.message}`);
    }
  }

  /**
   * Get active lists
   * Implements Req 2.3
   */
  async getActiveLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const lists = await listsCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('status', 'active'),
          Q.sortBy('created_at', Q.desc)
        )
        .fetch();

      return lists.map((list) => listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get active lists: ${error.message}`);
    }
  }

  /**
   * Get completed lists with optional date range
   * Implements Req 8.1
   */
  async getCompletedLists(
    familyGroupId: string,
    startDate?: number,
    endDate?: number,
    limit?: number,
    offset?: number
  ): Promise<ShoppingList[]> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const conditions: any[] = [
        Q.where('family_group_id', familyGroupId),
        Q.where('status', 'completed'),
      ];

      if (startDate) {
        conditions.push(Q.where('completed_at', Q.gte(startDate)));
      }
      if (endDate) {
        conditions.push(Q.where('completed_at', Q.lte(endDate)));
      }

      conditions.push(Q.sortBy('completed_at', Q.desc));

      if (limit !== undefined) {
        conditions.push(Q.skip(offset ?? 0));
        conditions.push(Q.take(limit));
      }

      const lists = await listsCollection.query(...conditions).fetch();
      return lists.map((list) => listModelToType(list));
    } catch (error: any) {
      throw new Error(`Failed to get completed lists: ${error.message}`);
    }
  }

  async countCompletedLists(
    familyGroupId: string,
    startDate?: number,
    endDate?: number
  ): Promise<number> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const conditions: any[] = [
        Q.where('family_group_id', familyGroupId),
        Q.where('status', 'completed'),
      ];
      if (startDate) conditions.push(Q.where('completed_at', Q.gte(startDate)));
      if (endDate) conditions.push(Q.where('completed_at', Q.lte(endDate)));
      return await listsCollection.query(...conditions).fetchCount();
    } catch (error: any) {
      throw new Error(`Failed to count completed lists: ${error.message}`);
    }
  }

  /**
   * Update shopping list
   */
  async updateList(listId: string, updates: Partial<ShoppingList>): Promise<ShoppingList> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);

      await this.database.write(async () => {
        await listRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.status !== undefined) record.status = updates.status;
          if (updates.completedAt !== undefined) record.completedAt = updates.completedAt;
          if (updates.completedBy !== undefined) record.completedBy = updates.completedBy;
          if (updates.receiptUrl !== undefined) record.receiptUrl = updates.receiptUrl;
          if (updates.receiptData !== undefined) {
            record.receiptData = updates.receiptData ? JSON.stringify(updates.receiptData) : null;
          }
          if (updates.syncStatus !== undefined) record.syncStatus = updates.syncStatus;
          if (updates.isLocked !== undefined) record.isLocked = updates.isLocked;
          if (updates.lockedBy !== undefined) record.lockedBy = updates.lockedBy;
          if (updates.lockedByName !== undefined) record.lockedByName = updates.lockedByName;
          if (updates.lockedByRole !== undefined) record.lockedByRole = updates.lockedByRole;
          if (updates.lockedAt !== undefined) record.lockedAt = updates.lockedAt;
          if (updates.budget !== undefined) record.budget = updates.budget;
          if (updates.storeName !== undefined) record.storeName = updates.storeName;
          if (updates.archived !== undefined) record.archived = updates.archived;
          if (updates.layoutApplied !== undefined) record.layoutApplied = updates.layoutApplied;
          if (updates.uncheckedItemsCount !== undefined) record.uncheckedItemsCount = updates.uncheckedItemsCount;
          if (updates.totalAmount !== undefined) record.totalAmount = updates.totalAmount;
          if (updates.merchantName !== undefined) record.merchantName = updates.merchantName;
          if (updates.purchaseDate !== undefined) record.purchaseDate = updates.purchaseDate;
          if (updates.currency !== undefined) record.currency = updates.currency;
        });
      }, 'updateList');

      return listModelToType(listRecord);
    } catch (error: any) {
      throw new Error(`Failed to update list: ${error.message}`);
    }
  }

  /**
   * Delete shopping list
   */
  async deleteList(listId: string): Promise<void> {
    try {
      const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
      const listRecord = await listsCollection.find(listId);
      await this.database.write(async () => {
        await listRecord.markAsDeleted();
      }, 'deleteList');
    } catch (error: any) {
      throw new Error(`Failed to delete list: ${error.message}`);
    }
  }

  /**
   * Save receipt data to a list
   * Implements Req 6.4
   */
  async saveReceiptData(listId: string, receiptData: ReceiptData): Promise<void> {
    await this.updateList(listId, { receiptData });
  }

  /**
   * Get receipt data for a list
   */
  async getReceiptData(listId: string): Promise<ReceiptData | null> {
    const list = await this.getList(listId);
    return list?.receiptData || null;
  }

  /**
   * Get total expenditure for date range
   * Implements Req 7.2
   */
  async getTotalExpenditureForDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<number> {
    const lists = await this.getCompletedLists(familyGroupId, startDate, endDate);
    let total = 0;

    for (const list of lists) {
      if (list.totalAmount) {
        total += list.totalAmount;
      }
    }

    return total;
  }

  /**
   * Get lists with receipts in date range
   */
  async getListsWithReceiptsInDateRange(
    familyGroupId: string,
    startDate: number,
    endDate: number
  ): Promise<ShoppingList[]> {
    const lists = await this.getCompletedLists(familyGroupId, startDate, endDate);
    return lists.filter((list) => list.receiptUrl !== null);
  }

  /**
   * Observe all lists for a family group (returns WatermelonDB observable)
   * Use this instead of polling for real-time updates
   */
  observeAllLists(familyGroupId: string, callback: (lists: ShoppingList[]) => void): () => void {
    const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');
    const query = listsCollection.query(
      Q.where('family_group_id', familyGroupId),
      Q.where('status', Q.notEq('deleted')),
    );

    // Observe key fields so status/sync changes update the UI without a manual refresh.
    const subscription = query.observeWithColumns([
      'name',
      'status',
      'completed_at',
      'sync_status',
      'is_locked',
      'locked_by_name',
      'locked_by_role',
      'store_name',
    ]).subscribe((listModels) => {
      const lists = listModels.map((model) => listModelToType(model));
      callback(lists);
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Observe a single list by ID (returns WatermelonDB observable)
   */
  observeList(listId: string, callback: (list: ShoppingList | null) => void): () => void {
    const listsCollection = this.database.get<ShoppingListModel>('shopping_lists');

    const subscription = listsCollection.findAndObserve(listId).subscribe({
      next: (model) => {
        callback(listModelToType(model));
      },
      error: () => {
        callback(null);
      },
    });

    return () => subscription.unsubscribe();
  }
}

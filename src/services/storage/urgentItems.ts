import { Database, Q } from '@nozbe/watermelondb';
import { UrgentItem } from '../../models/types';
import CrashReporting from '../CrashReporting';
import { UrgentItemModel } from '../../database/models/UrgentItem';
import { urgentItemModelToType } from './mappers';

/**
 * Urgent-items storage domain. Receives the shared WatermelonDB handle from
 * LocalStorageManager (the facade); all methods moved verbatim.
 */
export class UrgentItemsStorage {
  constructor(private database: Database) {}

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
   * Save urgent item (create or update)
   */
  async saveUrgentItem(urgentItem: UrgentItem): Promise<UrgentItem> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');

      let itemRecord: UrgentItemModel | undefined;

      await this.database.write(async () => {
        try {
          itemRecord = await urgentItemsCollection.find(urgentItem.id);
          await itemRecord.update((record) => {
            record.name = urgentItem.name;
            record.resolvedBy = urgentItem.resolvedBy;
            record.resolvedByName = urgentItem.resolvedByName;
            record.resolvedAt = urgentItem.resolvedAt;
            record.price = urgentItem.price;
            record.status = urgentItem.status;
          });
        } catch {
          itemRecord = await urgentItemsCollection.create((record) => {
            record._raw.id = urgentItem.id;
            record.name = urgentItem.name;
            record.familyGroupId = urgentItem.familyGroupId;
            record.createdBy = urgentItem.createdBy;
            record.createdByName = urgentItem.createdByName;
            record.resolvedBy = urgentItem.resolvedBy;
            record.resolvedByName = urgentItem.resolvedByName;
            record.resolvedAt = urgentItem.resolvedAt;
            record.price = urgentItem.price;
            record.status = urgentItem.status;
          });
        }
      }, 'saveUrgentItem');

      if (!itemRecord) {
        throw new Error('Failed to create or update urgent item record');
      }

      return urgentItemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to save urgent item: ${error.message}`);
    }
  }

  /**
   * Batch upsert urgent items in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveUrgentItemsBatch(urgentItems: UrgentItem[]): Promise<void> {
    if (urgentItems.length === 0) return;

    const collection = this.database.get<UrgentItemModel>('urgent_items');

    const existingRecords = await collection
      .query(Q.where('id', Q.oneOf(urgentItems.map(i => i.id))))
      .fetch();

    const existingMap = new Map(existingRecords.map(r => [r.id, r]));

    const applyUpdate = (record: UrgentItemModel, item: UrgentItem) => {
      record.name = item.name;
      record.resolvedBy = item.resolvedBy;
      record.resolvedByName = item.resolvedByName;
      record.resolvedAt = item.resolvedAt;
      record.price = item.price;
      record.status = item.status;
    };

    const applyCreate = (record: UrgentItemModel, item: UrgentItem) => {
      record._raw.id = item.id;
      record.name = item.name;
      record.familyGroupId = item.familyGroupId;
      record.createdBy = item.createdBy;
      record.createdByName = item.createdByName;
      record.resolvedBy = item.resolvedBy;
      record.resolvedByName = item.resolvedByName;
      record.resolvedAt = item.resolvedAt;
      record.price = item.price;
      record.status = item.status;
    };

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const item of urgentItems) {
        const existing = existingMap.get(item.id);
        if (existing) {
          const local = urgentItemModelToType(existing);
          if (!this.hasUrgentItemChanged(local, item)) continue;
          ops.push(existing.prepareUpdate(r => applyUpdate(r as UrgentItemModel, item)));
        } else {
          ops.push(collection.prepareCreate(r => applyCreate(r, item)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveUrgentItemsBatch batch failed, falling back to individual writes');
        for (const item of urgentItems) {
          try {
            const records = await collection.query(Q.where('id', item.id)).fetch();
            const rec = records[0];
            if (rec) {
              const local = urgentItemModelToType(rec);
              if (!this.hasUrgentItemChanged(local, item)) continue;
              await rec.update(r => applyUpdate(r, item));
            } else {
              await collection.create(r => applyCreate(r, item));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveUrgentItemsBatch individual write failed for ${item.id}`);
          }
        }
      }
    }, 'saveUrgentItemsBatch');
  }

  /**
   * Get urgent item by ID
   */
  async getUrgentItem(itemId: string): Promise<UrgentItem | null> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);
      return urgentItemModelToType(itemRecord);
    } catch {
      return null;
    }
  }

  /**
   * Get active urgent items for family group
   */
  async getActiveUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const items = await urgentItemsCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('status', 'active'),
          Q.sortBy('created_at', Q.desc)
        )
        .fetch();

      return items.map((item) => urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get active urgent items: ${error.message}`);
    }
  }

  /**
   * Get resolved urgent items for family group
   */
  async getResolvedUrgentItems(
    familyGroupId: string,
    startDate?: number,
    endDate?: number
  ): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const conditions: any[] = [
        Q.where('family_group_id', familyGroupId),
        Q.where('status', 'resolved')
      ];

      if (startDate) {
        conditions.push(Q.where('resolved_at', Q.gte(startDate)));
      }
      if (endDate) {
        conditions.push(Q.where('resolved_at', Q.lte(endDate)));
      }

      conditions.push(Q.sortBy('resolved_at', Q.desc));

      const items = await urgentItemsCollection.query(...conditions).fetch();
      return items.map((item) => urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get resolved urgent items: ${error.message}`);
    }
  }

  /**
   * Get all urgent items for family group (active and resolved)
   */
  async getAllUrgentItems(familyGroupId: string): Promise<UrgentItem[]> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const items = await urgentItemsCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.sortBy('created_at', Q.desc)
        )
        .fetch();

      return items.map((item) => urgentItemModelToType(item));
    } catch (error: any) {
      throw new Error(`Failed to get all urgent items: ${error.message}`);
    }
  }

  /**
   * Update urgent item
   */
  async updateUrgentItem(itemId: string, updates: Partial<UrgentItem>): Promise<UrgentItem> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);

      await this.database.write(async () => {
        await itemRecord.update((record) => {
          if (updates.name !== undefined) record.name = updates.name;
          if (updates.resolvedBy !== undefined) record.resolvedBy = updates.resolvedBy;
          if (updates.resolvedByName !== undefined) record.resolvedByName = updates.resolvedByName;
          if (updates.resolvedAt !== undefined) record.resolvedAt = updates.resolvedAt;
          if (updates.price !== undefined) record.price = updates.price;
          if (updates.status !== undefined) record.status = updates.status;
        });
      }, 'updateUrgentItem');

      return urgentItemModelToType(itemRecord);
    } catch (error: any) {
      throw new Error(`Failed to update urgent item: ${error.message}`);
    }
  }

  /**
   * Delete urgent item
   */
  async deleteUrgentItem(itemId: string): Promise<void> {
    try {
      const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
      const itemRecord = await urgentItemsCollection.find(itemId);
      await this.database.write(async () => {
        await itemRecord.markAsDeleted();
      }, 'deleteUrgentItem');
    } catch (error: any) {
      throw new Error(`Failed to delete urgent item: ${error.message}`);
    }
  }

  /**
   * Observe active urgent items for family group
   */
  observeActiveUrgentItems(familyGroupId: string, callback: (items: UrgentItem[]) => void): () => void {
    const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
    const query = urgentItemsCollection.query(
      Q.where('family_group_id', familyGroupId)
    );

    const subscription = query.observeWithColumns(['status']).subscribe((itemModels) => {
      const items = itemModels
        .filter((model) => model.status === 'active')
        .map((model) => urgentItemModelToType(model))
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(items);
    });

    return () => subscription.unsubscribe();
  }

  /**
   * Observe resolved urgent items for a family group
   * Returns unsubscribe function
   */
  observeResolvedUrgentItems(familyGroupId: string, callback: (items: UrgentItem[]) => void): () => void {
    const urgentItemsCollection = this.database.get<UrgentItemModel>('urgent_items');
    const query = urgentItemsCollection.query(
      Q.where('family_group_id', familyGroupId)
    );

    const subscription = query.observeWithColumns(['status']).subscribe((itemModels) => {
      const items = itemModels
        .filter((model) => model.status === 'resolved')
        .map((model) => urgentItemModelToType(model))
        .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
      callback(items);
    });

    return () => subscription.unsubscribe();
  }
}

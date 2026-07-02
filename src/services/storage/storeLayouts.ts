import { Database, Q } from '@nozbe/watermelondb';
import { StoreLayout } from '../../models/types';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { CategoryType } from '../CategoryService';
import CrashReporting from '../CrashReporting';
import StoreLayoutModel from '../../database/models/StoreLayout';

/**
 * Store-layouts storage domain. Receives the shared WatermelonDB handle from
 * LocalStorageManager (the facade); all methods moved verbatim.
 */
export class StoreLayoutsStorage {
  constructor(private database: Database) {}

  async saveStoreLayout(layout: StoreLayout): Promise<StoreLayout> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      let record: StoreLayoutModel | undefined;

      await this.database.write(async () => {
        let existing: StoreLayoutModel | null = null;
        try {
          existing = await collection.find(layout.id);
        } catch {
          // Record does not exist yet
        }

        if (existing) {
          record = await existing.update((r) => {
            r.familyGroupId = layout.familyGroupId;
            r.storeName = layout.storeName;
            r.categoryOrder = JSON.stringify(layout.categoryOrder);
            r.createdBy = layout.createdBy;
            r.updatedAt = layout.updatedAt;
            r.syncStatus = layout.syncStatus;
          });
        } else {
          record = await collection.create((r) => {
            r._raw.id = layout.id;
            r.familyGroupId = layout.familyGroupId;
            r.storeName = layout.storeName;
            r.categoryOrder = JSON.stringify(layout.categoryOrder);
            r.createdBy = layout.createdBy;
            r.updatedAt = layout.updatedAt;
            r.syncStatus = layout.syncStatus;
          });
        }
      }, 'saveStoreLayout');

      if (!record) throw new Error('Failed to save store layout record');
      return this.storeLayoutModelToType(record);
    } catch (error: any) {
      throw new Error(`Failed to save store layout: ${error.message}`);
    }
  }

  async getStoreLayoutByStore(storeName: string, familyGroupId: string): Promise<StoreLayout | null> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const records = await collection
        .query(
          Q.where('store_name', storeName),
          Q.where('family_group_id', familyGroupId)
        )
        .fetch();

      if (records.length === 0) return null;
      return this.storeLayoutModelToType(records[0]);
    } catch {
      return null;
    }
  }

  async getStoreLayoutById(id: string): Promise<StoreLayout | null> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);
      return this.storeLayoutModelToType(record);
    } catch {
      return null;
    }
  }

  async updateStoreLayout(id: string, updates: Partial<StoreLayout>): Promise<StoreLayout> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);

      await this.database.write(async () => {
        await record.update((r) => {
          if (updates.categoryOrder !== undefined) r.categoryOrder = JSON.stringify(updates.categoryOrder);
          if (updates.updatedAt !== undefined) r.updatedAt = updates.updatedAt;
          if (updates.syncStatus !== undefined) r.syncStatus = updates.syncStatus;
        });
      }, 'updateStoreLayout');

      return this.storeLayoutModelToType(record);
    } catch (error: any) {
      throw new Error(`Failed to update store layout: ${error.message}`);
    }
  }

  /**
   * Batch upsert store layouts in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveStoreLayoutsBatch(
    familyGroupId: string,
    entries: Array<{ layoutId: string; data: any }>
  ): Promise<void> {
    if (entries.length === 0) return;

    const collection = this.database.get<StoreLayoutModel>('store_layouts');

    const existingRecords = await collection
      .query(Q.where('family_group_id', familyGroupId))
      .fetch();

    const existingMap = new Map<string, StoreLayoutModel>();
    for (const record of existingRecords) {
      existingMap.set(record.id, record);
    }

    const applyUpdate = (r: StoreLayoutModel, data: any) => {
      if (data.categoryOrder !== undefined) r.categoryOrder = JSON.stringify(data.categoryOrder);
      if (data.updatedAt !== undefined) r.updatedAt = data.updatedAt;
      r.syncStatus = 'synced';
    };

    const applyCreate = (r: StoreLayoutModel, layoutId: string, data: any) => {
      r._raw.id = layoutId;
      r.familyGroupId = data.familyGroupId || familyGroupId;
      r.storeName = data.storeName || '';
      r.categoryOrder = JSON.stringify(data.categoryOrder);
      r.createdBy = data.createdBy || '';
      r.updatedAt = data.updatedAt ?? Date.now();
      r.syncStatus = 'synced';
    };

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const { layoutId, data } of entries) {
        const existing = existingMap.get(layoutId);
        if (existing) {
          ops.push(existing.prepareUpdate(r => applyUpdate(r as StoreLayoutModel, data)));
        } else {
          ops.push(collection.prepareCreate(r => applyCreate(r, layoutId, data)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveStoreLayoutsBatch batch failed, falling back to individual writes');
        for (const { layoutId, data } of entries) {
          try {
            const records = await collection.query(Q.where('id', layoutId)).fetch();
            const rec = records[0];
            if (rec) {
              await rec.update(r => applyUpdate(r, data));
            } else {
              await collection.create(r => applyCreate(r, layoutId, data));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveStoreLayoutsBatch individual write failed for ${layoutId}`);
          }
        }
      }
    }, 'saveStoreLayoutsBatch');
  }

  async deleteStoreLayout(id: string): Promise<void> {
    try {
      const collection = this.database.get<StoreLayoutModel>('store_layouts');
      const record = await collection.find(id);
      await this.database.write(async () => {
        await record.destroyPermanently();
      }, 'deleteStoreLayout');
    } catch (error: any) {
      throw new Error(`Failed to delete store layout: ${error.message}`);
    }
  }

  private storeLayoutModelToType(model: StoreLayoutModel): StoreLayout {
    return {
      id: model.id,
      familyGroupId: model.familyGroupId,
      storeName: model.storeName,
      categoryOrder: safeJsonParse<CategoryType[]>(model.categoryOrder, []),
      createdBy: model.createdBy,
      createdAt: Number(model.createdAt), // @date decorator returns Date object; must convert
      updatedAt: model.updatedAt,
      syncStatus: model.syncStatus as 'synced' | 'pending' | 'failed',
    };
  }
}

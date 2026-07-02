import { Database, Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import { CategoryHistory, PriceHistoryRecord } from '../../models/types';
import CrashReporting from '../CrashReporting';
import { CategoryHistoryModel } from '../../database/models/CategoryHistory';
import { PriceHistoryModel } from '../../database/models/PriceHistory';

/**
 * History storage domain: category-usage history and price history.
 * Receives the shared WatermelonDB handle from LocalStorageManager (the
 * facade); all methods moved verbatim.
 */
export class HistoryStorage {
  constructor(private database: Database) {}

  /**
   * Save category history (create or update)
   */
  async saveCategoryHistory(categoryHistory: CategoryHistory): Promise<CategoryHistory> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');

      let historyRecord: CategoryHistoryModel | undefined;

      await this.database.write(async () => {
        try {
          historyRecord = await categoryHistoryCollection.find(categoryHistory.id);
          await historyRecord.update((record) => {
            record.usageCount = categoryHistory.usageCount;
            record.lastUsedAt = categoryHistory.lastUsedAt;
          });
        } catch {
          historyRecord = await categoryHistoryCollection.create((record) => {
            record._raw.id = categoryHistory.id;
            record.familyGroupId = categoryHistory.familyGroupId;
            record.itemNameNormalized = categoryHistory.itemNameNormalized;
            record.category = categoryHistory.category;
            record.usageCount = categoryHistory.usageCount;
            record.lastUsedAt = categoryHistory.lastUsedAt;
          });
        }
      }, 'saveCategoryHistory');

      if (!historyRecord) {
        throw new Error('Failed to create or update category history record');
      }

      return this.categoryHistoryModelToType(historyRecord);
    } catch (error: any) {
      throw new Error(`Failed to save category history: ${error.message}`);
    }
  }

  /**
   * Get category history for an item name
   */
  async getCategoryHistoryForItem(
    familyGroupId: string,
    itemNameNormalized: string
  ): Promise<CategoryHistory[]> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const records = await categoryHistoryCollection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('item_name_normalized', itemNameNormalized)
        )
        .fetch();

      return records.map((record) => this.categoryHistoryModelToType(record));
    } catch (error: any) {
      throw new Error(`Failed to get category history: ${error.message}`);
    }
  }

  /**
   * Update category history
   */
  async updateCategoryHistory(
    id: string,
    updates: Partial<Pick<CategoryHistory, 'usageCount' | 'lastUsedAt'>>
  ): Promise<void> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const record = await categoryHistoryCollection.find(id);
      await this.database.write(async () => {
        await record.update((r) => {
          if (updates.usageCount !== undefined) r.usageCount = updates.usageCount;
          if (updates.lastUsedAt !== undefined) r.lastUsedAt = updates.lastUsedAt;
        });
      }, 'updateCategoryHistory');
    } catch (error: any) {
      throw new Error(`Failed to update category history: ${error.message}`);
    }
  }

  /**
   * Delete category history record
   */
  async deleteCategoryHistory(id: string): Promise<void> {
    try {
      const categoryHistoryCollection = this.database.get<CategoryHistoryModel>('category_history');
      const record = await categoryHistoryCollection.find(id);
      await this.database.write(async () => {
        await record.markAsDeleted();
      }, 'deleteCategoryHistory');
    } catch (error: any) {
      throw new Error(`Failed to delete category history: ${error.message}`);
    }
  }

  /**
   * Batch upsert category history records in a single database.write() transaction.
   * Used by FirebaseSyncListener to avoid N individual writes on initial load.
   */
  async saveCategoryHistoryBatch(
    familyGroupId: string,
    entries: Array<{ itemHash: string; category: string; data: any }>
  ): Promise<void> {
    if (entries.length === 0) return;

    const collection = this.database.get<CategoryHistoryModel>('category_history');

    const existingRecords = await collection
      .query(Q.where('family_group_id', familyGroupId))
      .fetch();

    const existingMap = new Map<string, CategoryHistoryModel>();
    for (const record of existingRecords) {
      existingMap.set(`${record.itemNameNormalized}|${record.category}`, record);
    }

    const applyUpdate = (r: CategoryHistoryModel, data: any) => {
      r.usageCount = data.usageCount || 1;
      r.lastUsedAt = data.lastUsedAt ?? Date.now();
    };

    const applyCreate = (r: CategoryHistoryModel, itemNameNormalized: string, category: string, data: any) => {
      r._raw.id = uuidv4();
      r.familyGroupId = familyGroupId;
      r.itemNameNormalized = itemNameNormalized;
      r.category = category;
      r.usageCount = data.usageCount || 1;
      r.lastUsedAt = data.lastUsedAt ?? Date.now();
    };

    await this.database.write(async () => {
      const ops: any[] = [];
      for (const { itemHash, category, data } of entries) {
        const itemNameNormalized = itemHash.replace(/_/g, '.');
        const key = `${itemNameNormalized}|${category}`;
        const existing = existingMap.get(key);

        if (existing) {
          ops.push(existing.prepareUpdate(r => applyUpdate(r as CategoryHistoryModel, data)));
        } else {
          ops.push(collection.prepareCreate(r => applyCreate(r, itemNameNormalized, category, data)));
        }
      }
      if (ops.length === 0) return;

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'saveCategoryHistoryBatch batch failed, falling back to individual writes');
        for (const { itemHash, category, data } of entries) {
          try {
            const itemNameNormalized = itemHash.replace(/_/g, '.');
            const freshRecords = await collection
              .query(
                Q.where('family_group_id', familyGroupId),
                Q.where('item_name_normalized', itemNameNormalized),
                Q.where('category', category)
              )
              .fetch();
            const rec = freshRecords[0];
            if (rec) {
              await rec.update(r => applyUpdate(r, data));
            } else {
              await collection.create(r => applyCreate(r, itemNameNormalized, category, data));
            }
          } catch (e) {
            CrashReporting.recordError(e as Error, `saveCategoryHistoryBatch individual write failed for ${itemHash}`);
          }
        }
      }
    }, 'saveCategoryHistoryBatch');
  }

  private categoryHistoryModelToType(model: CategoryHistoryModel): CategoryHistory {
    return {
      id: model.id,
      familyGroupId: model.familyGroupId,
      itemNameNormalized: model.itemNameNormalized,
      category: model.category,
      usageCount: model.usageCount,
      lastUsedAt: model.lastUsedAt,
      createdAt: Number(model.createdAt),
    };
  }

  /**
   * Save a single price history record (create only — ID-based upsert).
   * The find() inside the write() transaction prevents TOCTOU races between
   * concurrent batch loads (once('value')) and ongoing child_added events.
   */
  async savePriceHistoryRecord(record: PriceHistoryRecord): Promise<void> {
    const collection = this.database.get<PriceHistoryModel>('price_history');
    await this.database.write(async () => {
      try {
        await collection.find(record.id);
        return;
      } catch {
        await collection.create(r => {
          r._raw.id = record.id;
          r.itemName = record.itemName;
          r.itemNameNormalized = record.itemNameNormalized;
          r.price = record.price;
          r.storeName = record.storeName;
          r.listId = record.listId;
          r.recordedAt = record.recordedAt;
          r.familyGroupId = record.familyGroupId;
        });
      }
    }, 'savePriceHistoryRecord');
  }

  /**
   * Batch save price history records, skipping any that already exist.
   * Chunks ID lookups to stay under SQLite's SQLITE_MAX_VARIABLE_NUMBER (999).
   */
  async savePriceHistoryBatch(records: PriceHistoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    const collection = this.database.get<PriceHistoryModel>('price_history');
    const CHUNK = 500;

    const existingIds = new Set<string>();
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const found = await collection.query(Q.where('id', Q.oneOf(chunk.map(r => r.id)))).fetch();
      found.forEach(m => existingIds.add(m.id));
    }

    const toCreate = records.filter(r => !existingIds.has(r.id));
    if (toCreate.length === 0) return;

    const applyCreate = (r: PriceHistoryModel, record: PriceHistoryRecord) => {
      r._raw.id = record.id;
      r.itemName = record.itemName;
      r.itemNameNormalized = record.itemNameNormalized;
      r.price = record.price;
      r.storeName = record.storeName;
      r.listId = record.listId;
      r.recordedAt = record.recordedAt;
      r.familyGroupId = record.familyGroupId;
    };

    await this.database.write(async () => {
      const ops: any[] = toCreate.map(record =>
        collection.prepareCreate(r => applyCreate(r, record))
      );

      try {
        await this.database.batch(ops);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'savePriceHistoryBatch batch failed, falling back');
        for (const record of toCreate) {
          try {
            const exists = await collection.query(Q.where('id', record.id)).fetch();
            if (exists.length > 0) continue;
            await collection.create(r => applyCreate(r, record));
          } catch (e) {
            CrashReporting.recordError(e as Error, `savePriceHistoryBatch individual create failed for ${record.id}`);
          }
        }
      }
    }, 'savePriceHistoryBatch');
  }

  /**
   * Get all price history records for a specific item (normalized name).
   * Returns records ordered oldest-first for trend analysis.
   */
  async getPriceHistoryForItem(
    familyGroupId: string,
    itemNameNormalized: string
  ): Promise<PriceHistoryRecord[]> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('item_name_normalized', itemNameNormalized),
          Q.sortBy('recorded_at', Q.asc)
        )
        .fetch();

      return records.map(r => ({
        id: r.id,
        itemName: r.itemName,
        itemNameNormalized: r.itemNameNormalized,
        price: r.price,
        storeName: r.storeName,
        listId: r.listId,
        recordedAt: r.recordedAt,
        familyGroupId: r.familyGroupId,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get price history: ${error.message}`);
    }
  }

  async getLatestPriceHistoryTimestamp(familyGroupId: string): Promise<number | null> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(Q.where('family_group_id', familyGroupId), Q.sortBy('recorded_at', Q.desc), Q.take(1))
        .fetch();
      return records[0]?.recordedAt ?? null;
    } catch {
      return null;
    }
  }

  async getDistinctTrackedItems(
    familyGroupId: string
  ): Promise<Array<{ itemName: string; itemNameNormalized: string }>> {
    try {
      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(Q.where('family_group_id', familyGroupId))
        .fetch();

      const itemMap = new Map<string, string>();
      for (const r of records) {
        if (!itemMap.has(r.itemNameNormalized)) {
          itemMap.set(r.itemNameNormalized, r.itemName);
        }
      }

      return Array.from(itemMap.entries())
        .map(([normalized, name]) => ({ itemName: name, itemNameNormalized: normalized }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
    } catch (error: any) {
      throw new Error(`Failed to get distinct tracked items: ${error.message}`);
    }
  }
}

import { Database, Q } from '@nozbe/watermelondb';
import { v4 as uuidv4 } from 'uuid';
import { CategoryHistory, PriceHistoryRecord } from '../../models/types';
import CrashReporting from '../CrashReporting';
import { CategoryHistoryModel } from '../../database/models/CategoryHistory';
import { PriceHistoryModel } from '../../database/models/PriceHistory';
import { itemGroupKey } from '../../utils/itemGrouping';

function applyPriceRecord(r: PriceHistoryModel, record: PriceHistoryRecord): void {
  r.itemName = record.itemName;
  r.itemNameNormalized = record.itemNameNormalized;
  r.price = record.price;
  r.storeName = record.storeName;
  r.listId = record.listId;
  r.recordedAt = record.recordedAt;
  r.familyGroupId = record.familyGroupId;
}

function priceRecordDiffers(m: PriceHistoryModel, record: PriceHistoryRecord): boolean {
  return (
    m.itemName !== record.itemName ||
    m.price !== record.price ||
    m.storeName !== record.storeName ||
    m.recordedAt !== record.recordedAt
  );
}

/**
 * History storage domain: category-usage history and price history.
 * Receives the shared WatermelonDB handle from LocalStorageManager (the
 * facade); all methods moved verbatim.
 */
export class HistoryStorage {
  constructor(private database: Database) {}

  /**
   * familyGroupId → group key → the stored normalized names in that group.
   * Price history is keyed on the raw normalized name, so "avocado" and
   * "avocados" are separate rows; every read resolves through this map to
   * gather the whole group. Rebuilt on the next read after any write.
   */
  private priceVariants = new Map<string, Map<string, string[]>>();

  // Bumped by every price write. A read that started before a write must not
  // store the map it built from the older rows — the sync listener streams
  // price records in while Analytics is loading, so that window is reachable,
  // and a map cached stale hides the new spelling for the rest of the session.
  // One counter rather than one per family group: a write to another group
  // then costs an in-flight read its caching, which is far cheaper than
  // tracking generations for groups that have never been read.
  private priceVariantsGeneration = 0;

  private invalidatePriceVariants(familyGroupId: string): void {
    this.priceVariants.delete(familyGroupId);
    this.priceVariantsGeneration++;
  }

  /**
   * Keep the variant cache in step with written price rows. A new row only
   * adds its name to its group, so a cached map is updated in place: dropping
   * it made the next priced check-off re-read the whole price table. A row
   * whose name changed may have taken the last use of the old name away, so
   * that still drops the cache. The generation bump stops a build that was
   * already reading from storing a map without the new row.
   */
  private notePriceRows(familyGroupId: string, createdNames: string[], renamed: boolean): void {
    const cached = this.priceVariants.get(familyGroupId);
    if (renamed || !cached) {
      if (renamed || createdNames.length > 0) this.invalidatePriceVariants(familyGroupId);
      return;
    }
    if (createdNames.length === 0) return;
    for (const name of createdNames) {
      const key = itemGroupKey(name);
      const names = cached.get(key);
      // A new array, not a push: lookups hand these to Q.oneOf, which
      // freezes them.
      if (!names) cached.set(key, [name]);
      else if (!names.includes(name)) cached.set(key, [...names, name]);
    }
    this.priceVariantsGeneration++;
  }

  /** For callers that delete price rows without going through this class. */
  clearPriceVariantCache(): void {
    this.priceVariants.clear();
    this.priceVariantsGeneration++;
  }

  private async getPriceVariants(familyGroupId: string): Promise<Map<string, string[]>> {
    const cached = this.priceVariants.get(familyGroupId);
    if (cached) return cached;

    const generation = this.priceVariantsGeneration;
    const collection = this.database.get<PriceHistoryModel>('price_history');
    const records = await collection.query(Q.where('family_group_id', familyGroupId)).fetch();

    const map = new Map<string, string[]>();
    for (const r of records) {
      const key = itemGroupKey(r.itemNameNormalized);
      const names = map.get(key);
      if (!names) map.set(key, [r.itemNameNormalized]);
      else if (!names.includes(r.itemNameNormalized)) names.push(r.itemNameNormalized);
    }

    if (this.priceVariantsGeneration === generation) {
      this.priceVariants.set(familyGroupId, map);
    }
    return map;
  }

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
          // Every foreground return re-reads the whole node; rewriting rows
          // that did not change only churned the table and its observers.
          const unchanged = existing.usageCount === (data.usageCount || 1)
            && data.lastUsedAt != null && existing.lastUsedAt === data.lastUsedAt;
          if (unchanged) continue;
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
    let created = false;
    let renamed = false;
    await this.database.write(async () => {
      const existing = await collection.query(Q.where('id', record.id)).fetch();
      if (existing.length > 0) {
        // One purchase keeps one id, so a second write for it is a correction
        // (a receipt replacing a typed price), not a new data point.
        if (priceRecordDiffers(existing[0], record)) {
          renamed = existing[0].itemNameNormalized !== record.itemNameNormalized;
          await existing[0].update(r => applyPriceRecord(r, record));
        }
        return;
      }
      await collection.create(r => {
        r._raw.id = record.id;
        applyPriceRecord(r, record);
      });
      created = true;
    }, 'savePriceHistoryRecord');

    // The echo of this phone's own write arrives here too, and changes nothing.
    this.notePriceRows(record.familyGroupId, created ? [record.itemNameNormalized] : [], renamed);
  }

  /**
   * Batch save price history records, skipping any that already exist.
   * Chunks ID lookups to stay under SQLite's SQLITE_MAX_VARIABLE_NUMBER (999).
   */
  async savePriceHistoryBatch(records: PriceHistoryRecord[]): Promise<void> {
    if (records.length === 0) return;

    const collection = this.database.get<PriceHistoryModel>('price_history');
    const CHUNK = 500;

    const existingById = new Map<string, PriceHistoryModel>();
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const found = await collection.query(Q.where('id', Q.oneOf(chunk.map(r => r.id)))).fetch();
      found.forEach(m => existingById.set(m.id, m));
    }

    const toCreate = records.filter(r => !existingById.has(r.id));
    const toUpdate = records.filter(r => {
      const m = existingById.get(r.id);
      return m != null && priceRecordDiffers(m, r);
    });
    if (toCreate.length === 0 && toUpdate.length === 0) return;
    // Read before the write below applies the new names to these models.
    const renamedGroups = new Set(toUpdate
      .filter(r => existingById.get(r.id)!.itemNameNormalized !== r.itemNameNormalized)
      .map(r => r.familyGroupId));

    const applyCreate = (r: PriceHistoryModel, record: PriceHistoryRecord) => {
      r._raw.id = record.id;
      applyPriceRecord(r, record);
    };

    await this.database.write(async () => {
      const ops: any[] = [
        ...toCreate.map(record => collection.prepareCreate(r => applyCreate(r, record))),
        ...toUpdate.map(record =>
          existingById.get(record.id)!.prepareUpdate(r => applyPriceRecord(r, record))
        ),
      ];

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

    const groups = new Set([...toCreate, ...toUpdate].map(r => r.familyGroupId));
    for (const id of groups) {
      this.notePriceRows(id, toCreate.filter(r => r.familyGroupId === id).map(r => r.itemNameNormalized), renamedGroups.has(id));
    }
  }

  /**
   * Get all price history records for a specific item (normalized name).
   * Matches every singular/plural spelling of the item, not just the one
   * passed in. Returns records ordered oldest-first for trend analysis.
   */
  async getPriceHistoryForItem(
    familyGroupId: string,
    itemNameNormalized: string
  ): Promise<PriceHistoryRecord[]> {
    try {
      const variants = await this.getPriceVariants(familyGroupId);
      const names = variants.get(itemGroupKey(itemNameNormalized)) ?? [itemNameNormalized];

      const collection = this.database.get<PriceHistoryModel>('price_history');
      const records = await collection
        .query(
          Q.where('family_group_id', familyGroupId),
          Q.where('item_name_normalized', Q.oneOf(names)),
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

      // One entry per group, so singular and plural spellings of the same item
      // are offered once. The representative is the most-recorded spelling —
      // ties broken alphabetically so the picker order is stable across reads.
      const groups = new Map<string, Map<string, { name: string; count: number }>>();
      for (const r of records) {
        const key = itemGroupKey(r.itemNameNormalized);
        let spellings = groups.get(key);
        if (!spellings) {
          spellings = new Map();
          groups.set(key, spellings);
        }
        const seen = spellings.get(r.itemNameNormalized);
        if (!seen) {
          spellings.set(r.itemNameNormalized, { name: r.itemName, count: 1 });
        } else {
          seen.count++;
          if (r.itemName.localeCompare(seen.name) < 0) seen.name = r.itemName;
        }
      }

      return Array.from(groups.values())
        .map(spellings => {
          const [normalized, { name }] = Array.from(spellings.entries()).sort(
            (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
          )[0];
          return { itemName: name, itemNameNormalized: normalized };
        })
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
    } catch (error: any) {
      throw new Error(`Failed to get distinct tracked items: ${error.message}`);
    }
  }
}

import { Database, Q } from '@nozbe/watermelondb';
import { ReceiptAliasModel } from '../../database/models/ReceiptAlias';

/**
 * Receipt-alias storage domain: what printed receipt text the family has
 * confirmed means which item ("TESCO SEMI SKM MLK" → "Milk"), so a match made
 * by hand once is made automatically on the next receipt. Local to the
 * device.
 */
export class ReceiptAliasesStorage {
  constructor(private database: Database) {}

  /** receipt key → item name, for one family group. */
  async getReceiptAliases(familyGroupId: string): Promise<Map<string, string>> {
    const rows = await this.database.get<ReceiptAliasModel>('receipt_aliases')
      .query(Q.where('family_group_id', familyGroupId))
      .fetch();
    const map = new Map<string, string>();
    rows.forEach(r => map.set(r.receiptKey, r.itemName));
    return map;
  }

  /**
   * Remember each key → name, replacing what a key meant before, and forget
   * the keys in `forget`. Keys are expected already normalised.
   */
  async saveReceiptAliases(
    familyGroupId: string,
    entries: Array<{ receiptKey: string; itemName: string }>,
    forget: string[] = [],
  ): Promise<void> {
    if (entries.length === 0 && forget.length === 0) return;
    const collection = this.database.get<ReceiptAliasModel>('receipt_aliases');
    const keys = [...new Set([...entries.map(e => e.receiptKey), ...forget])];
    const existing = await collection
      .query(Q.where('family_group_id', familyGroupId), Q.where('receipt_key', Q.oneOf(keys)))
      .fetch();
    const byKey = new Map(existing.map(r => [r.receiptKey, r]));
    const now = Date.now();

    await this.database.write(async () => {
      const ops: ReceiptAliasModel[] = [];
      const seen = new Set<string>();
      for (const { receiptKey, itemName } of entries) {
        if (seen.has(receiptKey)) continue;
        seen.add(receiptKey);
        const row = byKey.get(receiptKey);
        if (row) {
          ops.push(row.prepareUpdate(r => {
            r.itemName = itemName;
            r.useCount = (r.useCount ?? 0) + 1;
            r.updatedAt = now;
          }));
        } else {
          ops.push(collection.prepareCreate(r => {
            r.familyGroupId = familyGroupId;
            r.receiptKey = receiptKey;
            r.itemName = itemName;
            r.useCount = 1;
            r.updatedAt = now;
          }));
        }
      }
      for (const key of forget) {
        if (seen.has(key)) continue;
        const row = byKey.get(key);
        if (row) ops.push(row.prepareDestroyPermanently());
      }
      if (ops.length > 0) await this.database.batch(ops);
    }, 'saveReceiptAliases');
  }
}

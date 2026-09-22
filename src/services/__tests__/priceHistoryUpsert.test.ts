/**
 * One purchase keeps one price-history id, so a second write for that id is
 * a correction — a receipt replacing the price typed in the shop — and must
 * replace the record, not be dropped or counted again. Runs against real
 * WatermelonDB on the in-memory LokiJS adapter.
 */

import LocalStorageManager from '../LocalStorageManager';
import { PriceHistoryRecord } from '../../models/types';

const record = (
  familyGroupId: string,
  id: string,
  price: number,
  recordedAt: number,
  storeName: string | null = 'Tesco',
): PriceHistoryRecord => ({
  id,
  itemName: 'Milk',
  itemNameNormalized: 'milk',
  price,
  storeName,
  listId: 'list-1',
  recordedAt,
  familyGroupId,
});

describe('price history upsert', () => {
  it('a second single save for the same id replaces the price', async () => {
    const gid = 'upsert-group-1';
    await LocalStorageManager.savePriceHistoryRecord(record(gid, 'item_list-1_a', 1.0, 1000));
    await LocalStorageManager.savePriceHistoryRecord(record(gid, 'item_list-1_a', 1.25, 2000));
    const rows = await LocalStorageManager.getPriceHistoryForItem(gid, 'milk');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(1.25);
    expect(rows[0].recordedAt).toBe(2000);
  });

  it('a batch save updates existing ids and creates new ones', async () => {
    const gid = 'upsert-group-2';
    await LocalStorageManager.savePriceHistoryBatch([record(gid, 'r1', 1.0, 1000)]);
    await LocalStorageManager.savePriceHistoryBatch([
      record(gid, 'r1', 1.1, 1500, 'Lidl'),
      record(gid, 'r2', 0.9, 1600),
    ]);
    const rows = await LocalStorageManager.getPriceHistoryForItem(gid, 'milk');
    const byId = new Map(rows.map(r => [r.id, r]));
    expect(rows).toHaveLength(2);
    expect(byId.get('r1')?.price).toBe(1.1);
    expect(byId.get('r1')?.storeName).toBe('Lidl');
    expect(byId.get('r2')?.price).toBe(0.9);
  });

  it('an identical re-save leaves a single record', async () => {
    const gid = 'upsert-group-3';
    await LocalStorageManager.savePriceHistoryRecord(record(gid, 'same', 2, 1000));
    await LocalStorageManager.savePriceHistoryRecord(record(gid, 'same', 2, 1000));
    expect(await LocalStorageManager.getPriceHistoryForItem(gid, 'milk')).toHaveLength(1);
  });
});

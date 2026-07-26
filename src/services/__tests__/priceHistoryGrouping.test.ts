/**
 * Price history is keyed on itemName.toLowerCase().trim(), so "avocado" and
 * "avocados" are separate rows. These pin the read-path grouping that folds
 * them back together — including the cache invalidation, which nothing else
 * exercises. Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */

import LocalStorageManager from '../LocalStorageManager';
import { PriceHistoryRecord } from '../../models/types';

let idCounter = 0;
let groupCounter = 0;
const nextGroup = () => `price-group-${++groupCounter}`;

const makeRecord = (
  familyGroupId: string,
  itemName: string,
  price: number,
  storeName: string | null,
): PriceHistoryRecord => ({
  id: `price-${++idCounter}`,
  itemName,
  itemNameNormalized: itemName.toLowerCase().trim(),
  price,
  storeName,
  listId: 'list-1',
  recordedAt: 1000 + idCounter,
  familyGroupId,
});

describe('price history grouping', () => {
  it('gathers every spelling of an item, whichever one is asked for', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Avocado', 1.2, 'Tesco'),
      makeRecord(gid, 'Avocados', 0.9, 'Lidl'),
    ]);

    const fromSingular = await LocalStorageManager.getPriceHistoryForItem(gid, 'avocado');
    const fromPlural = await LocalStorageManager.getPriceHistoryForItem(gid, 'avocados');

    expect(fromSingular).toHaveLength(2);
    expect(fromSingular.map(r => r.storeName).sort()).toEqual(['Lidl', 'Tesco']);
    expect(fromPlural.map(r => r.id).sort()).toEqual(fromSingular.map(r => r.id).sort());
  });

  it('offers one picker entry per group, labelled with the most-recorded spelling', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Avocados', 0.9, 'Lidl'),
      makeRecord(gid, 'Avocados', 1.0, 'Aldi'),
      makeRecord(gid, 'Avocado', 1.2, 'Tesco'),
      makeRecord(gid, 'Milk', 1.1, 'Tesco'),
    ]);

    const items = await LocalStorageManager.getDistinctTrackedItems(gid);

    expect(items).toHaveLength(2);
    expect(items.map(i => i.itemName)).toEqual(['Avocados', 'Milk']);
  });

  it('keeps items apart that only look alike', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Glass', 3.0, 'Tesco'),
      makeRecord(gid, 'Glasses', 8.0, 'Lidl'),
    ]);

    const items = await LocalStorageManager.getDistinctTrackedItems(gid);
    const glass = await LocalStorageManager.getPriceHistoryForItem(gid, 'glass');

    expect(items).toHaveLength(2);
    expect(glass).toHaveLength(1);
    expect(glass[0].price).toBe(3.0);
  });

  it('picks up a spelling first seen after the group was cached', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([makeRecord(gid, 'Tomato', 0.5, 'Tesco')]);

    // Warms the cached spelling map before the new spelling exists.
    expect(await LocalStorageManager.getPriceHistoryForItem(gid, 'tomato')).toHaveLength(1);

    await LocalStorageManager.savePriceHistoryRecord(makeRecord(gid, 'Tomatoes', 0.4, 'Lidl'));

    expect(await LocalStorageManager.getPriceHistoryForItem(gid, 'tomato')).toHaveLength(2);
    expect(await LocalStorageManager.getDistinctTrackedItems(gid)).toHaveLength(1);
  });

  it('scopes groups to the family group', async () => {
    const mine = nextGroup();
    const theirs = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(mine, 'Bananas', 1.0, 'Tesco'),
      makeRecord(theirs, 'Banana', 2.0, 'Lidl'),
    ]);

    const records = await LocalStorageManager.getPriceHistoryForItem(mine, 'banana');

    expect(records).toHaveLength(1);
    expect(records[0].price).toBe(1.0);
  });
});

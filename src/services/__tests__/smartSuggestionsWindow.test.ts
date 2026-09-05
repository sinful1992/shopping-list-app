/**
 * Smart Savings reads all-time prices unless a window is asked for. The card
 * on Analytics asks for one, because a store that was cheapest six months ago
 * is not advice about today's shop. These pin the window and the cache key,
 * which the window would otherwise defeat: entries used to be keyed on the
 * family group alone, so the first window's answer would be served to every
 * later one. Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */

import LocalStorageManager from '../LocalStorageManager';
import PriceHistoryService, { SUGGESTION_WINDOW_DAYS } from '../PriceHistoryService';
import { PriceHistoryRecord } from '../../models/types';

const DAY = 24 * 60 * 60 * 1000;

let idCounter = 0;
let groupCounter = 0;
const nextGroup = () => `suggestion-group-${++groupCounter}`;

const makeRecord = (
  familyGroupId: string,
  itemName: string,
  price: number,
  storeName: string,
  daysAgo: number,
): PriceHistoryRecord => ({
  id: `suggestion-price-${++idCounter}`,
  itemName,
  itemNameNormalized: itemName.toLowerCase().trim(),
  price,
  storeName,
  listId: 'list-1',
  recordedAt: Date.now() - daysAgo * DAY,
  familyGroupId,
});

describe('smart suggestions window', () => {
  afterEach(() => {
    PriceHistoryService.clearSuggestionsCache();
  });

  it('ignores prices older than the window it is given', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Apple juice', 1.0, 'Lidl', 200),
      makeRecord(gid, 'Apple juice', 3.0, 'Tesco', 200),
    ]);

    const windowed = await PriceHistoryService.getSmartSuggestions(gid, ['apple juice'], SUGGESTION_WINDOW_DAYS);
    const allTime = await PriceHistoryService.getSmartSuggestions(gid, ['apple juice']);

    expect(windowed.size).toBe(0);
    expect(allTime.get('apple juice')?.bestStore).toBe('Lidl');
  });

  it('compares only the stores seen inside the window', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      // Aldi was cheapest, but not this season.
      makeRecord(gid, 'Butter', 0.5, 'Aldi', 200),
      makeRecord(gid, 'Butter', 1.0, 'Lidl', 10),
      makeRecord(gid, 'Butter', 3.0, 'Tesco', 10),
    ]);

    const suggestion = (
      await PriceHistoryService.getSmartSuggestions(gid, ['butter'], SUGGESTION_WINDOW_DAYS)
    ).get('butter');

    expect(suggestion?.bestStore).toBe('Lidl');
    expect(suggestion?.bestPrice).toBe(1.0);
    // Average of the two stores in the window, not of all three.
    expect(suggestion?.savings).toBeCloseTo(1.0);
  });

  it('does not serve one window from another window cache entry', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Rice', 1.0, 'Lidl', 200),
      makeRecord(gid, 'Rice', 3.0, 'Tesco', 200),
    ]);

    const windowed = await PriceHistoryService.getSmartSuggestions(gid, ['rice'], SUGGESTION_WINDOW_DAYS);
    const allTime = await PriceHistoryService.getSmartSuggestions(gid, ['rice']);

    expect(windowed.size).toBe(0);
    expect(allTime.size).toBe(1);
  });

  it('clears every window cached for a family group', async () => {
    const gid = nextGroup();
    await LocalStorageManager.savePriceHistoryBatch([
      makeRecord(gid, 'Pasta', 1.0, 'Lidl', 10),
      makeRecord(gid, 'Pasta', 3.0, 'Tesco', 10),
    ]);

    expect((await PriceHistoryService.getSmartSuggestions(gid, ['pasta'], SUGGESTION_WINDOW_DAYS)).size).toBe(1);

    PriceHistoryService.clearSuggestionsCache(gid);
    await LocalStorageManager.savePriceHistoryRecord(makeRecord(gid, 'Pasta', 0.4, 'Aldi', 5));

    const after = (
      await PriceHistoryService.getSmartSuggestions(gid, ['pasta'], SUGGESTION_WINDOW_DAYS)
    ).get('pasta');
    expect(after?.bestStore).toBe('Aldi');
  });
});

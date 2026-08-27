/**
 * Analytics pulls items for completed lists that have none locally, which is
 * one RTDB query per list — the round-trip storm 1.39.12 removed. What keeps
 * it bounded is the record of which lists have already been asked for, so
 * these pin that record: what goes into it, what deliberately does not, and
 * the cap on a single run.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseSyncListener from '../FirebaseSyncListener';
import { backfillMissingItems, _resetAttemptedCache } from '../analyticsItemBackfill';
import { Item } from '../../models/types';

jest.mock('../FirebaseSyncListener', () => ({
  __esModule: true,
  default: { fetchItemsOnceForHistory: jest.fn() },
}));

const fetchItems = FirebaseSyncListener.fetchItemsOnceForHistory as jest.Mock;

const GROUP = 'group-1';
const KEY = `@analytics_item_backfill_v1_${GROUP}`;

const makeItem = (listId: string): Item => ({
  id: `item-${listId}`,
  listId,
  name: 'Milk',
  quantity: null,
  price: 1,
  checked: true,
  createdBy: 'user-1',
  createdAt: 0,
  updatedAt: 0,
  syncStatus: 'synced',
});

/** The last thing written to the attempted-lists key, as a set. */
const persistedAttempts = (): Set<string> => {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(c => c[0] === KEY);
  if (calls.length === 0) return new Set();
  return new Set(JSON.parse(calls[calls.length - 1][1]));
};

beforeEach(() => {
  jest.clearAllMocks();
  _resetAttemptedCache();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});

describe('analytics item backfill', () => {
  it('fetches the lists it is given and returns what it finds', async () => {
    fetchItems.mockImplementation((_g: string, listId: string) =>
      Promise.resolve([makeItem(listId)]),
    );

    const items = await backfillMissingItems(GROUP, ['list-a', 'list-b']);

    expect(items.map(i => i.listId).sort()).toEqual(['list-a', 'list-b']);
    expect(fetchItems).toHaveBeenCalledTimes(2);
  });

  it('does not ask for a list twice in one session', async () => {
    fetchItems.mockResolvedValue([]);

    await backfillMissingItems(GROUP, ['list-a']);
    await backfillMissingItems(GROUP, ['list-a']);

    expect(fetchItems).toHaveBeenCalledTimes(1);
  });

  it('does not ask for a list recorded on a previous run', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['list-a']));
    fetchItems.mockResolvedValue([]);

    await backfillMissingItems(GROUP, ['list-a', 'list-b']);

    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(fetchItems).toHaveBeenCalledWith(GROUP, 'list-b');
    expect(persistedAttempts()).toEqual(new Set(['list-a', 'list-b']));
  });

  it('records a list that came back with nothing', async () => {
    // Firebase answering "no items" is an answer. Asking again every load
    // would be the round-trip storm, one list at a time.
    fetchItems.mockResolvedValue([]);

    await backfillMissingItems(GROUP, ['list-a']);

    expect(persistedAttempts()).toEqual(new Set(['list-a']));
  });

  it('does not record a list whose fetch failed', async () => {
    // Offline is not an answer, and recording it would blank the item half
    // of the screen permanently.
    fetchItems.mockRejectedValue(new Error('network'));

    const items = await backfillMissingItems(GROUP, ['list-a']);

    expect(items).toEqual([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    _resetAttemptedCache();
    fetchItems.mockResolvedValue([makeItem('list-a')]);
    expect(await backfillMissingItems(GROUP, ['list-a'])).toHaveLength(1);
  });

  it('records the successes from a run that also had failures', async () => {
    fetchItems.mockImplementation((_g: string, listId: string) =>
      listId === 'list-a' ? Promise.reject(new Error('network')) : Promise.resolve([]),
    );

    await backfillMissingItems(GROUP, ['list-a', 'list-b']);

    expect(persistedAttempts()).toEqual(new Set(['list-b']));
  });

  it('caps a single run and picks the rest up on the next one', async () => {
    fetchItems.mockResolvedValue([]);
    const many = Array.from({ length: 45 }, (_, i) => `list-${i}`);

    await backfillMissingItems(GROUP, many);
    expect(fetchItems).toHaveBeenCalledTimes(40);

    fetchItems.mockClear();
    await backfillMissingItems(GROUP, many);
    expect(fetchItems).toHaveBeenCalledTimes(5);
  });

  it('does nothing, and reads nothing, when no list is missing items', async () => {
    expect(await backfillMissingItems(GROUP, [])).toEqual([]);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it('survives a corrupt attempted-lists record', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{not json');
    fetchItems.mockResolvedValue([]);

    await backfillMissingItems(GROUP, ['list-a']);

    expect(fetchItems).toHaveBeenCalledTimes(1);
  });
});

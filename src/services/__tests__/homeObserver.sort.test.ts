/**
 * OPTIMISE P3: Home's subscription asks storage for active lists only and
 * shows them newest first (the completed-list filter moved into the query).
 */
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: jest.fn(() => () => {}), fetch: jest.fn(async () => ({ isConnected: true })) } }));
const mockObserveActive = jest.fn();
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { observeActiveLists: (...a: unknown[]) => mockObserveActive(...a) },
}));
jest.mock('../SyncEngine', () => ({ __esModule: true, default: {} }));

import ShoppingListManager from '../ShoppingListManager';

it('asks for active lists and sorts them newest first without touching the input', () => {
  const unsub = jest.fn();
  mockObserveActive.mockImplementation((_fam: string, cb: (l: any[]) => void) => {
    const input = [{ id: 'a', createdAt: 1 }, { id: 'c', createdAt: 3 }, { id: 'b', createdAt: 2 }];
    cb(input);
    expect(input.map(l => l.id)).toEqual(['a', 'c', 'b']);
    return unsub;
  });
  const got: string[][] = [];
  const stop = ShoppingListManager.subscribeToListChanges('fam-1', lists => got.push(lists.map(l => l.id)));
  expect(mockObserveActive).toHaveBeenCalledWith('fam-1', expect.any(Function));
  expect(got).toEqual([['c', 'b', 'a']]);
  stop();
  expect(unsub).toHaveBeenCalled();
});

/**
 * Urgent syncs between phones (task 49): a remote change of only the flag is
 * applied (hasItemChanged sees it).
 */
jest.useFakeTimers();

jest.mock('@react-native-firebase/database', () => () => ({}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('../LocalStorageManager', () => ({ default: {} }));
jest.mock('../CrashReporting', () => ({ default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';
import FirebaseSyncListener from '../FirebaseSyncListener';

afterAll(() => {
  SyncEngine.stopPeriodicRetry();
  jest.useRealTimers();
});

const item = (overrides = {}) => ({
  id: 'item-1', listId: 'list-1', name: 'Milk', checked: false,
  quantity: null, price: null, unitQty: null,
  measurementUnit: null, measurementValue: null,
  category: 'Dairy', sortOrder: 1, updatedAt: 1000, createdBy: 'u', createdAt: 1, syncStatus: 'synced',
  ...overrides,
});

const changed = (a: object, b: object): boolean => (FirebaseSyncListener as any).hasItemChanged(item(a), item(b));

describe('hasItemChanged sees the flag', () => {
  it.each([
    [{ isUrgent: false }, { isUrgent: true }, true],
    [{ isUrgent: true }, { isUrgent: false }, true],
    [{}, { isUrgent: true }, true],
    [{ isUrgent: true }, { isUrgent: true }, false],
    // An old item (no field) and one written as false are the same thing:
    // no write, no observer flicker.
    [{}, { isUrgent: false }, false],
  ])('%j → %j changed: %s', (local, incoming, expected) => {
    expect(changed(local, incoming)).toBe(expected);
  });
});

/**
 * Fable audit (task 137), F1: every return to the app restarted the Firebase
 * listeners, and each restart downloads every list of the family again.
 * Now a short trip away (under a minute) keeps the live listeners; a long one
 * still restarts them (the Feb 2026 fix for lists not arriving after a long
 * background stays). The local lists are re-read on every return.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';

const mockAppListeners: Array<(s: string) => void> = [];
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.AppState.currentState = 'active';
  RN.AppState.addEventListener = (_: string, cb: (s: string) => void) => {
    mockAppListeners.push(cb);
    return { remove: () => {} };
  };
  return RN;
});
jest.mock('../../services/FirebaseSyncListener', () => ({
  __esModule: true,
  default: {
    startListeningToLists: jest.fn(),
    stopListeningToLists: jest.fn(),
    startListeningToCategoryHistory: jest.fn(),
    stopListeningToCategoryHistory: jest.fn(),
    startListeningToStoreLayouts: jest.fn(),
    stopListeningToStoreLayouts: jest.fn(),
    startListeningToPriceHistory: jest.fn(),
    stopListeningToPriceHistory: jest.fn(),
  },
}));
jest.mock('../../services/ShoppingListManager', () => ({
  __esModule: true,
  default: {
    getAllActiveLists: jest.fn(async () => []),
    subscribeToListChanges: jest.fn(() => () => {}),
  },
}));
jest.mock('../../services/ImageStorageManager', () => ({ __esModule: true, default: { processUploadQueue: jest.fn(async () => ({})) } }));
jest.mock('../../services/PriceHistoryService', () => ({ __esModule: true, default: { backfillPriceHistory: jest.fn(async () => {}) } }));
jest.mock('../../services/UrgentNotifier', () => ({ flushUrgentOutbox: jest.fn(async () => {}) }));
jest.mock('../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn() } }));

import { useShoppingLists, LISTENER_RESTART_AFTER_MS } from '../useShoppingLists';
import FirebaseSyncListener from '../../services/FirebaseSyncListener';
import ShoppingListManager from '../../services/ShoppingListManager';

const startLists = FirebaseSyncListener.startListeningToLists as jest.Mock;
const getActive = ShoppingListManager.getAllActiveLists as jest.Mock;

function Probe() {
  useShoppingLists('fam-1', { uid: 'u1', familyGroupId: 'fam-1' } as any);
  return null;
}

let now = 1_000_000;
const send = async (state: string) => {
  await act(async () => { mockAppListeners.forEach(cb => cb(state)); });
};
const away = async (ms: number, via: 'background' | 'inactive' = 'background') => {
  if (via === 'background') await send('inactive');
  await send(via);
  now += ms;
  await send('active');
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockAppListeners.length = 0;
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  await act(async () => { create(<Probe />); });
});

afterEach(() => jest.restoreAllMocks());

it('starts the listeners once on mount', () => {
  expect(startLists).toHaveBeenCalledTimes(1);
});

it('a short trip away (10 s) keeps the live listeners: no second full download', async () => {
  await away(10_000);
  expect(startLists).toHaveBeenCalledTimes(1);
});

it('just under the limit: still no restart', async () => {
  await away(LISTENER_RESTART_AFTER_MS - 1);
  expect(startLists).toHaveBeenCalledTimes(1);
});

it('at the limit and after a long time away: the listeners restart', async () => {
  await away(LISTENER_RESTART_AFTER_MS);
  expect(startLists).toHaveBeenCalledTimes(2);
  await away(30 * 60_000);
  expect(startLists).toHaveBeenCalledTimes(3);
});

it('the notification shade (inactive only, never background) does not restart', async () => {
  await away(5 * 60_000, 'inactive');
  expect(startLists).toHaveBeenCalledTimes(1);
});

it('the local lists are re-read on every return, short or long', async () => {
  const before = getActive.mock.calls.length;
  await away(5_000);
  await away(LISTENER_RESTART_AFTER_MS + 1);
  expect(getActive.mock.calls.length - before).toBe(2);
});

it('the away time is measured from the first background, not reset by a second background event', async () => {
  await send('background');
  now += LISTENER_RESTART_AFTER_MS / 2;
  await send('background');
  now += LISTENER_RESTART_AFTER_MS / 2;
  await send('active');
  expect(startLists).toHaveBeenCalledTimes(2);
});

it('a short trip after a long one is measured on its own', async () => {
  await away(LISTENER_RESTART_AFTER_MS * 2);
  await away(1_000);
  expect(startLists).toHaveBeenCalledTimes(2);
});

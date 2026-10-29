/**
 * Logout must see a change that is still being sent (task 100, Codex P2 on
 * PR #54): pushChange writes straight to Firebase and queues the change only
 * when the write fails after its 30 s timeout, so the queue alone reads 0.
 */
jest.useFakeTimers();

const mockQueue: any[] = [];
let mockWrite: () => Promise<void> = () => new Promise<void>(() => {});

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: jest.fn(() => mockWrite()),
  remove: jest.fn(() => Promise.resolve()),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn(async (op: any) => { mockQueue.push(op); }),
    removeFromSyncQueue: jest.fn(async () => undefined),
    markSyncedIfUnchanged: jest.fn(async () => undefined),
    getSyncQueue: jest.fn(async () => [...mockQueue]),
    updateSyncQueueOperation: jest.fn(async () => undefined),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';

const item = { id: 'i1', listId: 'l1', name: 'Milk', checked: false, updatedAt: 10, syncStatus: 'pending' } as any;

beforeEach(() => {
  SyncEngine.setFamilyGroupId('famA');
  mockQueue.length = 0;
});

afterEach(async () => {
  await jest.advanceTimersByTimeAsync(31000); // let hanging sends time out
  SyncEngine.stopPeriodicRetry();
});

it('counts a change being sent, which the queue does not show yet', async () => {
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(0);
  expect((await SyncEngine.getSyncStatus()).pendingOperations).toBe(0);
  expect(SyncEngine.getInFlightCount()).toBe(1);
});

it('a send that times out moves from in flight to the queue, never counted at 0', async () => {
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(31000);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect((await SyncEngine.getSyncStatus()).pendingOperations).toBe(1);
});

it('waitForInFlight resolves when the send lands', async () => {
  let land!: () => void;
  mockWrite = () => new Promise<void>(resolve => { land = resolve; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  land();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  mockWrite = () => new Promise<void>(() => {});
});

it('waitForInFlight resolves at once with nothing in flight', async () => {
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
});

it('two sends: waits for both', async () => {
  const lands: Array<() => void> = [];
  mockWrite = () => new Promise<void>(resolve => { lands.push(resolve); });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  SyncEngine.pushChange('item', 'i2', 'update', { ...item, id: 'i2' });
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(0);
  lands[0]();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  expect(SyncEngine.getInFlightCount()).toBe(1);
  lands[1]();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
  mockWrite = () => new Promise<void>(() => {});
});

it('a send dropped by sign-out still leaves the in-flight count', async () => {
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(0);
  SyncEngine.resetForSignOut();
  await jest.advanceTimersByTimeAsync(31000);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(0);
});

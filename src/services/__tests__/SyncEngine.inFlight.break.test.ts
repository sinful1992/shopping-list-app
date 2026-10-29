/**
 * Break tests for SyncEngine in-flight counting (task 100 review).
 */
jest.useFakeTimers();

const mockQueue: any[] = [];
let mockWrite: () => Promise<void> = () => new Promise<void>(() => {});
let mockGetItem: (id: string) => Promise<any> = async () => null;
let mockAddToQueue: (op: any) => Promise<void> = async (op: any) => { mockQueue.push(op); };
let mockNetListener: ((s: any) => void) | null = null;

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path: string) => ({ path })),
  set: jest.fn(() => mockWrite()),
  remove: jest.fn(() => mockWrite()),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((cb: any) => { mockNetListener = cb; return jest.fn(); }),
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    addToSyncQueue: jest.fn((op: any) => mockAddToQueue(op)),
    removeFromSyncQueue: jest.fn(async (id: string) => {
      const i = mockQueue.findIndex(o => o.id === id);
      if (i >= 0) mockQueue.splice(i, 1);
    }),
    markSyncedIfUnchanged: jest.fn(async () => undefined),
    getSyncQueue: jest.fn(async () => [...mockQueue]),
    updateSyncQueueOperation: jest.fn(async () => undefined),
    getItem: jest.fn((id: string) => mockGetItem(id)),
    getList: jest.fn(async () => null),
    getStoreLayoutById: jest.fn(async () => null),
  },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';

const item = { id: 'i1', listId: 'l1', name: 'Milk', checked: false, updatedAt: 10, syncStatus: 'pending' } as any;
const hang = () => new Promise<void>(() => {});
const pending = async () =>
  (await SyncEngine.getSyncStatus()).pendingOperations + SyncEngine.getInFlightCount();

beforeEach(() => {
  SyncEngine.setFamilyGroupId('famA');
  mockQueue.length = 0;
  mockWrite = hang;
  mockGetItem = async () => null;
  mockAddToQueue = async (op: any) => { mockQueue.push(op); };
  (SyncEngine as any).isOnline = true;
});

afterEach(async () => {
  await jest.advanceTimersByTimeAsync(31000);
  SyncEngine.stopPeriodicRetry();
});

it('B1 write rejects immediately: queued, count back to 0, never both 0', async () => {
  mockWrite = () => Promise.reject(new Error('network error'));
  const p = SyncEngine.pushChange('item', 'i1', 'update', item);
  expect(SyncEngine.getInFlightCount()).toBe(1);
  await p;
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(1);
});

it('B2 write times out then lands late: count 0, queue drained', async () => {
  let land!: () => void;
  mockWrite = () => new Promise<void>(r => { land = r; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(31000);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(1);
  land();
  await jest.advanceTimersByTimeAsync(0);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(0);
});

it('B3 pushChange with no data: change is counted while its local read runs', async () => {
  let resolveRead!: (v: any) => void;
  mockGetItem = () => new Promise(r => { resolveRead = r; });
  SyncEngine.pushChange('item', 'i1', 'update');
  await jest.advanceTimersByTimeAsync(0);
  // logout here: neither queued nor sent
  expect(await pending()).toBeGreaterThan(0);
  resolveRead(item);
  await jest.advanceTimersByTimeAsync(0);
});

it('B3b waitForInFlight during the no-data local read waits for the send', async () => {
  let resolveRead!: (v: any) => void;
  mockGetItem = () => new Promise(r => { resolveRead = r; });
  SyncEngine.pushChange('item', 'i1', 'update');
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  resolveRead(item);
  await jest.advanceTimersByTimeAsync(0);
});

it('B4 offline path: change counted while it is being written to the queue', async () => {
  (SyncEngine as any).isOnline = false;
  let finishAdd!: () => void;
  mockAddToQueue = (op: any) => new Promise<void>(r => { finishAdd = () => { mockQueue.push(op); r(); }; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(0);
  expect(await pending()).toBeGreaterThan(0);
  finishAdd();
  await jest.advanceTimersByTimeAsync(0);
});

it('B4b offline path, plain: queued, count stays 0', async () => {
  (SyncEngine as any).isOnline = false;
  await SyncEngine.pushChange('item', 'i1', 'update', item);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(1);
});

it('B5 many concurrent sends: exact count, resolves only after last', async () => {
  const lands: Array<() => void> = [];
  mockWrite = () => new Promise<void>(r => { lands.push(r); });
  for (let i = 0; i < 50; i++) SyncEngine.pushChange('item', `i${i}`, 'update', { ...item, id: `i${i}` });
  expect(SyncEngine.getInFlightCount()).toBe(50);
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  for (let i = 0; i < 49; i++) lands[i]();
  await jest.advanceTimersByTimeAsync(0);
  expect(SyncEngine.getInFlightCount()).toBe(1);
  expect(done).toBe(false);
  lands[49]();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
  expect(SyncEngine.getInFlightCount()).toBe(0);
});

it('B6 waitForInFlight called twice: both resolve', async () => {
  let land!: () => void;
  mockWrite = () => new Promise<void>(r => { land = r; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  let a = false, b = false;
  SyncEngine.waitForInFlight().then(() => { a = true; });
  SyncEngine.waitForInFlight().then(() => { b = true; });
  land();
  await jest.advanceTimersByTimeAsync(0);
  expect([a, b]).toEqual([true, true]);
});

it('B7 waiter registered then resetForSignOut: resolves when send lands, nothing queued', async () => {
  let land!: () => void;
  mockWrite = () => new Promise<void>(r => { land = r; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  SyncEngine.resetForSignOut();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  land();
  await jest.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(0);
});

it('B7b waiter then resetForSignOut, send times out: waiter resolves at timeout', async () => {
  SyncEngine.pushChange('item', 'i1', 'update', item);
  let done = false;
  SyncEngine.waitForInFlight().then(() => { done = true; });
  SyncEngine.resetForSignOut();
  await jest.advanceTimersByTimeAsync(31000);
  expect(done).toBe(true);
  expect(SyncEngine.getInFlightCount()).toBe(0);
});

it('B8 count never negative across mixed outcomes', async () => {
  const seen: number[] = [];
  let n = 0;
  mockWrite = () => {
    const k = n++;
    if (k % 3 === 0) return Promise.resolve();
    if (k % 3 === 1) return Promise.reject(new Error('network error'));
    return hang();
  };
  const ps = [];
  for (let i = 0; i < 9; i++) ps.push(SyncEngine.pushChange('item', `i${i}`, 'update', { ...item, id: `i${i}` }).catch(() => {}));
  seen.push(SyncEngine.getInFlightCount());
  await jest.advanceTimersByTimeAsync(0);
  seen.push(SyncEngine.getInFlightCount());
  await jest.advanceTimersByTimeAsync(31000);
  seen.push(SyncEngine.getInFlightCount());
  await Promise.all(ps);
  expect(seen).toEqual([9, 3, 0]);
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
});

it('B9 queueOperation throws in catch path: count still drops, waiter resolves', async () => {
  mockWrite = () => Promise.reject(new Error('network error'));
  mockAddToQueue = async () => { throw new Error('disk full'); };
  let done = false;
  const p = SyncEngine.pushChange('item', 'i1', 'update', item);
  SyncEngine.waitForInFlight().then(() => { done = true; });
  await expect(p).rejects.toThrow('disk full');
  await jest.advanceTimersByTimeAsync(0);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(done).toBe(true);
});

it('B9b while the timed-out send is being queued, count still shows it', async () => {
  let finishAdd!: () => void;
  mockAddToQueue = (op: any) => new Promise<void>(r => { finishAdd = () => { mockQueue.push(op); r(); }; });
  SyncEngine.pushChange('item', 'i1', 'update', item);
  await jest.advanceTimersByTimeAsync(30001);
  expect(mockQueue).toHaveLength(0);
  expect(SyncEngine.getInFlightCount()).toBe(1);
  finishAdd();
  await jest.advanceTimersByTimeAsync(0);
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(1);
});

it('B10 syncToFirebase throws for null payload (data missing locally): count balanced', async () => {
  mockGetItem = async () => null;
  await SyncEngine.pushChange('item', 'gone', 'update');
  expect(SyncEngine.getInFlightCount()).toBe(0);
  expect(mockQueue).toHaveLength(1);
});

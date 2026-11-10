/**
 * SH-1 (audit 137): an older queued write of an entity must never reach the
 * server after a newer write of the same entity. Every write is the whole
 * object, so the newest one replaces all before it.
 *
 * Each "phone" is its own SyncEngine module instance with its own queue; all
 * phones share one fake server, which records the order of writes.
 */
jest.useFakeTimers();

type Phone = { queue: any[]; newestFirst: boolean; reads: number; fail: boolean; hold: Array<() => void> | null; removeThrows: boolean; readThrows: boolean };
const mockPhones: Phone[] = [];
let mockCurrent = 0; // which phone's module is being loaded
const mockServer: Record<string, any> = {};
const mockWrites: string[] = [];

jest.mock('@react-native-firebase/database', () => {
  const me = mockCurrent;
  const send = (apply: () => void) => {
    const p = mockPhones[me];
    if (p.fail) return Promise.reject(new Error('network error'));
    if (p.hold) return new Promise<void>(resolve => p.hold!.push(() => { apply(); resolve(); }));
    apply();
    return Promise.resolve();
  };
  return {
    getDatabase: jest.fn(() => ({})),
    ref: jest.fn((_db: unknown, path: string) => ({ path })),
    set: jest.fn((r: { path: string }, data: any) => send(() => { mockServer[r.path] = data; mockWrites.push(`set ${r.path} ${data.updatedAt}`); })),
    remove: jest.fn((r: { path: string }) => send(() => { delete mockServer[r.path]; mockWrites.push(`remove ${r.path}`); })),
  };
});
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));
jest.mock('../LocalStorageManager', () => {
  const p = mockPhones[mockCurrent];
  return {
    __esModule: true,
    default: {
      addToSyncQueue: jest.fn(async (op: any) => { p.queue.push(op); }),
      removeFromSyncQueue: jest.fn(async (id: string) => {
        const i = p.queue.findIndex(o => o.id === id);
        if (i < 0 || p.removeThrows) throw new Error('Failed to remove from sync queue: Record not found');
        p.queue.splice(i, 1);
      }),
      markSyncedIfUnchanged: jest.fn(async () => undefined),
      getSyncQueue: jest.fn(async () => {
        p.reads++;
        if (p.readThrows) throw new Error('Failed to get sync queue: database is closed');
        const sorted = [...p.queue].sort((a, b) => a.timestamp - b.timestamp);
        return p.newestFirst ? sorted.reverse() : sorted;
      }),
      updateSyncQueueOperation: jest.fn(async (id: string, updates: any) => {
        const op = p.queue.find(o => o.id === id);
        if (!op) throw new Error('Failed to update sync queue operation: Record not found');
        Object.assign(op, updates);
      }),
      updateItem: jest.fn(async () => undefined),
      updateList: jest.fn(async () => undefined),
      updateStoreLayout: jest.fn(async () => undefined),
      getItem: jest.fn(async () => null),
      getList: jest.fn(async () => null),
      getStoreLayoutById: jest.fn(async () => null),
    },
  };
});
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

const engines: any[] = [];

/** A fresh phone: its own engine, queue and connection, signed in to the same family. */
function newPhone(stored: any[] = []): { engine: any; phone: Phone } {
  const phone: Phone = { queue: [...stored], newestFirst: false, reads: 0, fail: false, hold: null, removeThrows: false, readThrows: false };
  mockPhones.push(phone);
  mockCurrent = mockPhones.length - 1;
  let engine: any;
  jest.isolateModules(() => { engine = require('../SyncEngine').default; });
  engine.setFamilyGroupId('famA');
  engine.isOnline = true;
  engines.push(engine);
  return { engine, phone };
}

const PATH = '/familyGroups/famA/items/i1';
const item = (updatedAt: number, extra: object = {}) =>
  ({ id: 'i1', listId: 'l1', name: 'Milk', createdBy: 'u', checked: updatedAt % 20 !== 0, updatedAt, syncStatus: 'pending', ...extra } as any);
const queuedRow = (id: string, entityType: string, entityId: string, operation: string, data: any, timestamp: number, extra: object = {}) =>
  ({ id, entityType, entityId, operation, data, timestamp, retryCount: 0, ...extra });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  for (const k of Object.keys(mockServer)) delete mockServer[k];
  mockWrites.length = 0;
});
afterEach(() => { engines.splice(0).forEach(e => e.stopPeriodicRetry()); });

describe('SH-1 one phone', () => {
  it('a queued older write is not replayed after a newer write went straight through (the audit repro)', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    expect(phone.queue).toHaveLength(1);

    phone.fail = false;
    await engine.pushChange('item', 'i1', 'update', item(20));
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(phone.queue).toHaveLength(0); // the old copy left the queue at once, not at the next tick

    await engine.processOperationQueue();
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
  });

  it('two offline changes of one item leave one queued operation, the newest', async () => {
    const { engine, phone } = newPhone();
    engine.isOnline = false;
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.pushChange('item', 'i1', 'update', item(20));
    await engine.pushChange('item', 'i1', 'update', item(30));
    expect(phone.queue.map(o => o.data.updatedAt)).toEqual([30]);

    engine.isOnline = true;
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([`set ${PATH} 30`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('an older copy waiting in back-off cannot land after the newer one (sent out of order before)', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.processOperationQueue(); // fails again: back-off set on the old copy
    expect(phone.queue[0].nextRetryAt).toBeGreaterThan(Date.now());
    await engine.pushChange('item', 'i1', 'update', item(20)); // fails too: queued, no back-off
    expect(phone.queue.map(o => o.data.updatedAt)).toEqual([20]);

    phone.fail = false;
    await engine.processOperationQueue();
    jest.advanceTimersByTime(10 * 60 * 1000);
    await flush();
    await engine.processOperationQueue();
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
  });

  it('a delete after a queued update: the update never brings the item back', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    await engine.pushChange('item', 'i1', 'delete');
    expect(phone.queue).toHaveLength(0);
    await engine.processOperationQueue();
    expect(mockServer[PATH]).toBeUndefined();
    expect(mockWrites).toEqual([`remove ${PATH}`]);
  });

  it('an update after a queued delete: the newer write stands, the delete is not replayed (as an unqueued write does today)', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'delete');
    expect(phone.queue).toHaveLength(1);
    phone.fail = false;
    await engine.pushChange('item', 'i1', 'update', item(20));
    await engine.processOperationQueue();
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(phone.queue).toHaveLength(0);
  });

  it('a queued delete then an offline delete keeps one delete', async () => {
    const { engine, phone } = newPhone();
    engine.isOnline = false;
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.pushChange('item', 'i1', 'delete');
    expect(phone.queue.map(o => o.operation)).toEqual(['delete']);
  });

  it('only the same entity is touched: another item, and a list with the same id, stay queued', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.pushChange('item', 'i2', 'update', item(11, { id: 'i2' }));
    await engine.pushChange('list', 'i1', 'update', { id: 'i1', name: 'L', status: 'active', updatedAt: 12 } as any);
    await engine.pushChange('storeLayout', 'i1', 'update', { id: 'i1', updatedAt: 13 } as any);
    phone.fail = false;
    await engine.pushChange('item', 'i1', 'update', item(20));
    expect(phone.queue.map(o => `${o.entityType}/${o.entityId}`).sort()).toEqual(['item/i2', 'list/i1', 'storeLayout/i1']);
    await engine.processOperationQueue();
    expect(phone.queue).toHaveLength(0);
    expect(mockServer['/familyGroups/famA/items/i2'].updatedAt).toBe(11);
    expect(mockServer['/familyGroups/famA/lists/i1'].updatedAt).toBe(12);
    expect(mockServer['/familyGroups/famA/storeLayouts/i1'].updatedAt).toBe(13);
  });

  it('a newer write that is still being sent stops the retry tick from sending the old copy', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    phone.hold = []; // slow connection: sends wait
    const newer = engine.pushChange('item', 'i1', 'update', item(20));
    await flush();
    expect(phone.hold).toHaveLength(1);

    await engine.processOperationQueue(); // the 60 s tick while the newer write is on its way
    expect(phone.hold).toHaveLength(1);   // the old copy was not sent behind it
    phone.hold.splice(0).forEach(go => go());
    await newer;
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('a newer write made while the tick is working through its copy of the queue wins', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i0', 'update', item(5, { id: 'i0' }));
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    phone.hold = [];
    const tick = engine.processOperationQueue(); // has read [i0, i1@10], is sending i0
    await flush();
    expect(phone.hold).toHaveLength(1);
    const newer = engine.pushChange('item', 'i1', 'update', item(20));
    await flush();
    while (phone.hold.length) { phone.hold.splice(0).forEach(go => go()); await flush(); }
    await Promise.all([tick, newer]);
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(mockWrites.filter(w => w.includes('/i1'))).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('a newer write that fails while an older one is still being sent is the one that stays queued', async () => {
    const { engine, phone } = newPhone();
    phone.hold = [];
    const older = engine.pushChange('item', 'i1', 'update', item(10));
    await flush();
    phone.hold = null;
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(20)); // queued
    jest.advanceTimersByTime(31000);                            // the older send times out
    await older;
    expect(phone.queue.map(o => o.data.updatedAt)).toEqual([20]);
  });

  it('the queue write-back survives an operation that is already gone, and goes on to the next one', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.pushChange('item', 'i2', 'update', item(11, { id: 'i2' }));
    phone.fail = false;
    phone.removeThrows = true; // every remove says "not found"
    const result = await engine.processOperationQueue();
    expect(result.processed).toBe(2);
    expect(mockWrites).toHaveLength(2);
  });

  it('a queue that cannot be read after a good send does not fail the write; the tick still skips the old copy', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    phone.readThrows = true;
    await expect(engine.pushChange('item', 'i1', 'update', item(20))).resolves.toBeUndefined();
    expect(phone.queue).toHaveLength(1); // could not be cleaned now
    phone.readThrows = false;
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('two changes queued in the same millisecond: the later tap wins even when storage returns them the other way round', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    phone.readThrows = true; // nothing can be cleaned at queue time: both stay stored
    await engine.pushChange('item', 'i1', 'update', item(10));
    await engine.pushChange('item', 'i1', 'update', item(20));
    expect(phone.queue).toHaveLength(2);
    expect(phone.queue[0].timestamp).toBe(phone.queue[1].timestamp);
    phone.fail = false;
    phone.readThrows = false;
    phone.newestFirst = true;
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('an old copy whose retry fails while a newer change is on its way gets no further retry', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    phone.hold = [];
    const tick = engine.processOperationQueue(); // sending the old copy
    await flush();
    expect(phone.hold).toHaveLength(1);
    const newer = engine.pushChange('item', 'i1', 'update', item(20));
    await flush();
    jest.advanceTimersByTime(31000); // both sends time out
    await Promise.all([tick, newer]);
    expect(phone.queue.map(o => o.data.updatedAt)).toEqual([20]);
    expect(phone.queue[0].retryCount).toBe(0);
  });

  it('offline, a change still reading its data when a newer one is made is not queued behind it', async () => {
    const { engine, phone } = newPhone();
    engine.isOnline = false;
    const first = engine.pushChange('item', 'i1', 'update');       // no data: reads the item first
    const second = engine.pushChange('item', 'i1', 'update', item(20));
    await Promise.all([first, second]);
    expect(phone.queue.map(o => o.data?.updatedAt)).toEqual([20]);
  });

  it('with an empty queue a write reads the queue once, then not again until something is queued', async () => {
    const { engine, phone } = newPhone();
    await engine.pushChange('item', 'i1', 'update', item(10));
    expect(phone.reads).toBe(1);
    await engine.pushChange('item', 'i1', 'update', item(20));
    await engine.pushChange('item', 'i2', 'update', item(21, { id: 'i2' }));
    expect(phone.reads).toBe(1);
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(30)); // queued: the queue is read again from now on
    expect(phone.reads).toBe(2);
    phone.fail = false;
    await engine.pushChange('item', 'i2', 'update', item(31, { id: 'i2' }));
    expect(phone.reads).toBe(3);
    expect(phone.queue.map(o => o.data.updatedAt)).toEqual([30]);
  });
});

describe('SH-1 a queue stored by an older build (1.53.22 format, several operations for one item)', () => {
  it('loads, sends only the newest operation of each entity and empties the queue', async () => {
    const { engine, phone } = newPhone([
      queuedRow('a', 'item', 'i1', 'update', item(10), 1000),
      queuedRow('b', 'item', 'i2', 'create', item(11, { id: 'i2' }), 1001),
      queuedRow('c', 'item', 'i1', 'update', item(20), 1002),
    ]);
    const result = await engine.processOperationQueue();
    expect(result.processed).toBe(2);
    expect(mockServer[PATH].updatedAt).toBe(20);
    expect(mockWrites.filter(w => w.includes('/i1'))).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('the older stored copy is dropped even when the newer one waits in back-off', async () => {
    const { engine, phone } = newPhone([
      queuedRow('a', 'item', 'i1', 'update', item(10), 1000),
      queuedRow('c', 'item', 'i1', 'update', item(20), 1002, { retryCount: 2, nextRetryAt: Date.now() + 60000 }),
    ]);
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([]);
    expect(phone.queue.map(o => o.id)).toEqual(['c']);
    jest.advanceTimersByTime(61000); // the engine's own 60 s tick fires in here
    await flush();
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
    expect(phone.queue).toHaveLength(0);
  });

  it('a stored update followed by a stored delete ends deleted; a stored delete followed by a stored create ends created', async () => {
    const { engine } = newPhone([
      queuedRow('a', 'item', 'i1', 'update', item(10), 1000),
      queuedRow('b', 'item', 'i1', 'delete', null, 1001),
      queuedRow('c', 'item', 'i2', 'delete', null, 1002),
      queuedRow('d', 'item', 'i2', 'create', item(20, { id: 'i2' }), 1003),
    ]);
    mockServer[PATH] = item(1);
    await engine.processOperationQueue();
    expect(mockServer[PATH]).toBeUndefined();
    expect(mockServer['/familyGroups/famA/items/i2'].updatedAt).toBe(20);
  });

  it('a stored operation is older than the first write of this run for the same item', async () => {
    const { engine, phone } = newPhone([queuedRow('a', 'item', 'i1', 'update', item(10), 1000)]);
    await engine.pushChange('item', 'i1', 'update', item(20));
    expect(phone.queue).toHaveLength(0);
    await engine.processOperationQueue();
    expect(mockWrites).toEqual([`set ${PATH} 20`]);
  });
});

describe('SH-1 sign-out', () => {
  it('nothing is dropped or queued for the old account after sign-out, and the next account starts clean', async () => {
    const { engine, phone } = newPhone();
    phone.fail = true;
    await engine.pushChange('item', 'i1', 'update', item(10));
    phone.fail = false;
    phone.hold = [];
    const pending = engine.pushChange('item', 'i1', 'update', item(20));
    await flush();
    engine.resetForSignOut();
    phone.hold.splice(0).forEach(go => go());
    await pending;
    expect(phone.queue).toHaveLength(1); // left for the sign-out code, which clears the queue itself
    expect((engine as any).latestWrite.size).toBe(0);
    expect((engine as any).queuedSeq.size).toBe(0);
  });
});

describe('SH-1 two phones, one server', () => {
  it('phone A\'s old queued tick cannot undo what phone B changed after A\'s newer write', async () => {
    const a = newPhone();
    const b = newPhone();
    a.phone.fail = true;
    await a.engine.pushChange('item', 'i1', 'update', item(10)); // A ticks Milk on weak Wi-Fi
    a.phone.fail = false;
    await a.engine.pushChange('item', 'i1', 'update', item(20)); // A changes it again, goes through
    await b.engine.pushChange('item', 'i1', 'update', item(30)); // B edits after seeing A's change
    await a.engine.processOperationQueue();                      // A's 60 s retry
    await b.engine.processOperationQueue();
    expect(mockServer[PATH].updatedAt).toBe(30);
    expect(mockWrites).toEqual([`set ${PATH} 20`, `set ${PATH} 30`]);
  });

  it('each phone keeps its own queue: B\'s write does not drop A\'s queued change of another item', async () => {
    const a = newPhone();
    const b = newPhone();
    a.phone.fail = true;
    await a.engine.pushChange('item', 'i2', 'update', item(10, { id: 'i2' }));
    await b.engine.pushChange('item', 'i2', 'update', item(5, { id: 'i2' }));
    expect(a.phone.queue).toHaveLength(1);
    expect(b.phone.queue).toHaveLength(0);
  });

  // Not closed by SH-1 (plan rank 20, needs a compare on the server or field-level writes):
  // A never wrote the item again, so on A the queued copy IS the newest; only B's is newer.
  it.failing('KNOWN LIMIT: an offline phone\'s only queued change still lands over another phone\'s newer one', async () => {
    const a = newPhone();
    const b = newPhone();
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', item(10));
    await b.engine.pushChange('item', 'i1', 'update', item(30));
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH].updatedAt).toBe(30);
  });
});

export {};

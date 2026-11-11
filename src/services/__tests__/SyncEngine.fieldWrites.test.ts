/**
 * Rank 20 (audit 137, task 142/143): an update is sent as the fields that changed against the
 * server copy the change was made on, not as the whole object. Each "phone" is its own SyncEngine
 * (own queue, own server copies); all share one fake RTDB that applies set / update / remove the
 * way RTDB does (update merges children, a null child is removed).
 */
jest.useFakeTimers();

type Phone = { queue: any[]; fail: boolean; hold?: Array<() => void> };
const mockPhones: Phone[] = [];
let mockCurrent = 0;
const mockServer: Record<string, any> = {};
const mockWrites: Array<{ op: string; path: string; data?: any }> = [];

const mockTxnOptions: any[] = [];
jest.mock('@react-native-firebase/database', () => {
  const me = mockCurrent;
  const send = (apply: () => void) => {
    if (mockPhones[me].fail) return Promise.reject(new Error('network error'));
    const h = mockPhones[me].hold;
    if (h) return new Promise<void>(res => h.push(() => { apply(); res(); }));
    apply();
    return Promise.resolve();
  };
  return {
    getDatabase: jest.fn(() => ({})),
    ref: jest.fn((_db: unknown, path: string) => ({ path })),
    set: jest.fn((r: { path: string }, data: any) => send(() => {
      mockServer[r.path] = JSON.parse(JSON.stringify(data));
      mockWrites.push({ op: 'set', path: r.path, data });
    })),
    update: jest.fn((r: { path: string }, data: any) => send(() => {
      const cur = { ...(mockServer[r.path] ?? {}) };
      for (const [k, v] of Object.entries(data)) { if (v === null) delete cur[k]; else cur[k] = JSON.parse(JSON.stringify(v)); }
      mockServer[r.path] = cur;
      mockWrites.push({ op: 'update', path: r.path, data });
    })),
    remove: jest.fn((r: { path: string }) => send(() => { delete mockServer[r.path]; mockWrites.push({ op: 'remove', path: r.path }); })),
    // task 145: a queued replay is a transaction on the server's copy; recorded as the fields it changed
    runTransaction: jest.fn((r: { path: string }, fn: (current: any) => any, options?: any) => {
      mockTxnOptions.push(options);
      let committed = false;
      return send(() => {
        const before = mockServer[r.path] ?? null;
        const next = fn(before === null ? null : JSON.parse(JSON.stringify(before)));
        if (next === undefined) return;
        committed = true;
        if (next === null) { delete mockServer[r.path]; mockWrites.push({ op: 'remove', path: r.path }); return; }
        mockServer[r.path] = JSON.parse(JSON.stringify(next));
        if (before === null) { mockWrites.push({ op: 'set', path: r.path, data: next }); return; }
        const diff: any = {};
        for (const k of new Set([...Object.keys(before), ...Object.keys(next)])) {
          if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) diff[k] = next[k] === undefined ? null : next[k];
        }
        mockWrites.push({ op: 'update', path: r.path, data: diff });
      }).then(() => ({ committed, snapshot: { val: () => mockServer[r.path] ?? null } }));
    }),
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
        if (i < 0) throw new Error('Failed to remove from sync queue: Record not found');
        p.queue.splice(i, 1);
      }),
      markSyncedIfUnchanged: jest.fn(async () => undefined),
      getSyncQueue: jest.fn(async () => [...p.queue].sort((a, b) => a.timestamp - b.timestamp)),
      updateSyncQueueOperation: jest.fn(async (id: string, u: any) => { Object.assign(p.queue.find(o => o.id === id) ?? {}, u); }),
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
function newPhone(): { engine: any; phone: Phone } {
  const phone: Phone = { queue: [], fail: false };
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
const LPATH = '/familyGroups/famA/lists/l1';
const base = { id: 'i1', listId: 'l1', name: 'Milk', quantity: null, price: 1.2, checked: false, createdBy: 'u', createdAt: 1, updatedAt: 5,
  category: null, sortOrder: 1, unitQty: null, measurementUnit: null, measurementValue: null, isUrgent: false };
const local = (extra: object) => ({ ...base, syncStatus: 'pending', ...extra } as any);
/** What the listener does when it sees the server: the phone's engine learns the server copy. */
const sees = (engine: any, type: 'item' | 'list', id: string, path: string) =>
  engine.noteServerCopy(type, id, { ...mockServer[path], syncStatus: 'synced' });

beforeEach(() => {
  for (const k of Object.keys(mockServer)) delete mockServer[k];
  mockWrites.length = 0;
  mockServer[PATH] = { ...base };
});
afterAll(() => { engines.forEach(e => e.stopPeriodicRetry()); jest.useRealTimers(); });

describe('rank 20: two phones edit different fields of one item', () => {
  it('a tick on A and a rename on B both survive', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'update', local({ name: 'Oat milk', updatedAt: 11 })); // B had not seen A's tick yet
    expect(mockServer[PATH]).toMatchObject({ name: 'Oat milk', checked: true, updatedAt: 11 });
  });

  it('offline A ticks, B renames meanwhile, A comes back: both survive', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'update', local({ name: 'Bread', updatedAt: 30 }));
    sees(a.engine, 'item', 'i1', PATH);            // A's listener gets B's rename before A is back online
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ name: 'Bread', checked: true });
  });

  it('offline A renames then ticks (two queued changes, the older dropped): both fields arrive, B\'s quantity stays', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ name: 'Semi-skimmed', updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'update', local({ quantity: '2', updatedAt: 12 }));
    sees(a.engine, 'item', 'i1', PATH);            // A sees B's quantity, but its own local copy still has none
    await a.engine.pushChange('item', 'i1', 'update', local({ name: 'Semi-skimmed', checked: true, updatedAt: 14 }));
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ name: 'Semi-skimmed', checked: true, quantity: '2' });
    expect(a.phone.queue).toHaveLength(0);
  });
});

describe('rank 20: what an update sends', () => {
  it('only the changed fields and updatedAt, never syncStatus', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    expect(mockWrites).toEqual([{ op: 'update', path: PATH, data: { checked: true, updatedAt: 10 } }]);
  });

  it('a cleared field is sent as null and so removed on the server', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i1', 'update', local({ price: null, updatedAt: 10 }));
    expect(mockWrites[0].data).toEqual({ price: null, updatedAt: 10 });
    expect('price' in mockServer[PATH]).toBe(false);
  });

  it('a field the local object does not carry is left alone on the server', async () => {
    const a = newPhone();
    mockServer[PATH] = { ...base, addedByOlderApp: 'x' };
    sees(a.engine, 'item', 'i1', PATH);
    const { measurementUnit: _drop, ...noUnit } = local({ checked: true, updatedAt: 10 });
    await a.engine.pushChange('item', 'i1', 'update', noUnit);
    expect(mockServer[PATH]).toMatchObject({ addedByOlderApp: 'x', checked: true });
  });

  it('no server copy known (first write after a restart): the whole object, as before', async () => {
    const a = newPhone();
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    expect(mockWrites.map(w => w.op)).toEqual(['set']);
  });

  it('create and delete are unchanged: set and remove', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i2', 'create', local({ id: 'i2', updatedAt: 10 }));
    await a.engine.pushChange('item', 'i1', 'delete', null);
    expect(mockWrites.map(w => w.op)).toEqual(['set', 'remove']);
  });

  it('nothing changed: nothing sent', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i1', 'update', local({}));
    expect(mockWrites).toHaveLength(0);
  });

  it('a list tick does not re-send the receipt that came back in RTDB\'s own shape', async () => {
    const a = newPhone();
    const receipt = { lineItems: [{ description: 'MILK', price: 1.2, quantity: null }], discounts: [], total: 1.2 };
    mockServer[LPATH] = { id: 'l1', name: 'Tesco', status: 'active', receiptData: { total: 1.2, lineItems: [{ price: 1.2, description: 'MILK' }] } };
    sees(a.engine, 'list', 'l1', LPATH);
    await a.engine.pushChange('list', 'l1', 'update', { id: 'l1', name: 'Tesco big shop', status: 'active', receiptData: receipt, syncStatus: 'pending' } as any);
    expect(mockWrites).toEqual([{ op: 'update', path: LPATH, data: { name: 'Tesco big shop' } }]);
  });

  it('after its own write lands, the next edit is diffed against the new copy (no re-send)', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, name: 'Milk 2L', updatedAt: 11 }));
    expect(mockWrites[1].data).toEqual({ name: 'Milk 2L', updatedAt: 11 });
  });

  it('sign-out forgets every server copy: the next account writes whole objects', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    a.engine.resetForSignOut();
    a.engine.setFamilyGroupId('famA');
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    expect(mockWrites.map(w => w.op)).toEqual(['set']);
  });

  it('a change that failed and was queued keeps its base: a retry after the listener saw another phone\'s field does not send it back', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    a.phone.fail = true;
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    a.phone.fail = false;
    sees(b.engine, 'item', 'i1', PATH);
    await b.engine.pushChange('item', 'i1', 'update', local({ price: 2.5, updatedAt: 20 }));
    sees(a.engine, 'item', 'i1', PATH);
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ checked: true, price: 2.5 });
  });

  it('a whole write still in flight (no copy known) keeps later edits whole too, so they cannot diff against a copy this phone never built on', async () => {
    const a = newPhone(); const b = newPhone();
    a.phone.hold = [];
    const first = a.engine.pushChange('item', 'i1', 'update', local({ name: 'Semi', updatedAt: 20 })); // no copy: set, held
    await Promise.resolve(); await Promise.resolve();
    sees(b.engine, 'item', 'i1', PATH);
    await b.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 15 }));
    sees(a.engine, 'item', 'i1', PATH);                // A's listener now has B's tick
    const second = a.engine.pushChange('item', 'i1', 'update', local({ name: 'Semi', quantity: '2', updatedAt: 21 }));
    await Promise.resolve(); await Promise.resolve();
    a.phone.hold.splice(0).forEach(go => go());
    await first; await jest.advanceTimersByTimeAsync(0);
    a.phone.hold.splice(0).forEach(go => go());
    await second;
    expect(mockWrites.filter(w => w.path === PATH && w.data?.updatedAt === 21).map(w => w.op)).toEqual(['set']);
  });
});

// A module, not a script: without this the two field-write test files share one global scope and tsc fails (TS2393).
export {};

describe('left note 138 (task 145): an offline change and a newer change of the SAME field', () => {
  it('A sets quantity offline, B sets quantity later online: B\'s newer value stays when A comes back', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ quantity: '2', updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'update', local({ quantity: '5', updatedAt: 30 }));
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ quantity: '5', updatedAt: 30 });
    expect(a.phone.queue).toHaveLength(0); // dropped, not retried for ever
    // the replay's transaction never shows its first guess locally (ada #10737)
    expect(mockTxnOptions.at(-1)).toEqual({ applyLocally: false });
  });

  it('same field AND another field: B keeps its quantity, A\'s tick still lands', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ quantity: '2', checked: true, updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'update', local({ quantity: '5', updatedAt: 30 }));
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ quantity: '5', checked: true, updatedAt: 30 });
  });

  it('nothing newer on the server: A\'s offline change lands as before', async () => {
    const a = newPhone();
    sees(a.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ quantity: '2', updatedAt: 10 }));
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toMatchObject({ quantity: '2', updatedAt: 10 });
  });

  it('B deleted the item meanwhile: A\'s field change does not bring back half an item', async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 10 }));
    await b.engine.pushChange('item', 'i1', 'delete', null);
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[PATH]).toBeUndefined();
    expect(a.phone.queue).toHaveLength(0);
  });

  it('a list: offline A renames, B renames later; B\'s name stays, A\'s other field lands', async () => {
    const a = newPhone(); const b = newPhone();
    const list = { id: 'l1', name: 'Weekly', createdBy: 'u', createdAt: 1, updatedAt: 5, status: 'active', familyGroupId: 'famA' };
    mockServer[LPATH] = { ...list };
    sees(a.engine, 'list', 'l1', LPATH); sees(b.engine, 'list', 'l1', LPATH);
    a.engine.isOnline = false;
    await a.engine.pushChange('list', 'l1', 'update', { ...list, name: 'Saturday', storeName: 'Tesco', updatedAt: 10, syncStatus: 'pending' } as any);
    await b.engine.pushChange('list', 'l1', 'update', { ...list, name: 'Big shop', updatedAt: 30, syncStatus: 'pending' } as any);
    a.engine.isOnline = true;
    await a.engine.processOperationQueue();
    expect(mockServer[LPATH]).toMatchObject({ name: 'Big shop', storeName: 'Tesco', updatedAt: 30 });
  });
});

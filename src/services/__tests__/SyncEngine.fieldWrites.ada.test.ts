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


describe('ada break: two edits in flight before the first lands', () => {
  it("B's tick seen by A's listener while A's rename is in flight survives A's second edit", async () => {
    const a = newPhone(); const b = newPhone();
    sees(a.engine, 'item', 'i1', PATH); sees(b.engine, 'item', 'i1', PATH);
    a.phone.hold = [];
    const p1 = a.engine.pushChange('item', 'i1', 'update', local({ name: 'Oat milk', updatedAt: 20 }));
    await Promise.resolve(); await Promise.resolve();
    await b.engine.pushChange('item', 'i1', 'update', local({ checked: true, updatedAt: 15 })); // B's tick lands first
    sees(a.engine, 'item', 'i1', PATH);   // A's listener notes the server copy; A's pending local (newer) keeps checked:false
    const p2 = a.engine.pushChange('item', 'i1', 'update', local({ name: 'Oat milk', quantity: '2', updatedAt: 21 }));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const held = a.phone.hold; a.phone.hold = undefined; held.forEach(f => f());
    await p1; await p2;
    console.log(JSON.stringify(mockWrites.filter(w => w.path === PATH)));
    expect(mockServer[PATH]).toMatchObject({ name: 'Oat milk', quantity: '2', checked: true });
  });
});

// A module, not a script: without this the two field-write test files share one global scope and tsc fails (TS2393).
export {};

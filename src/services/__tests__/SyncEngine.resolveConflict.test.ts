jest.mock('@react-native-firebase/database', () => () => ({}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('../LocalStorageManager', () => ({ default: {} }));
jest.mock('../CrashReporting', () => ({ default: { recordError: jest.fn(), log: jest.fn() } }));

import SyncEngine from '../SyncEngine';

afterAll(() => SyncEngine.stopPeriodicRetry());

const item = (overrides = {}) => ({
  id: 'item-1', name: 'Milk', checked: false,
  quantity: null, price: null, unitQty: null,
  measurementUnit: null, measurementValue: null,
  category: 'Dairy', sortOrder: 1, updatedAt: 1000,
  ...overrides,
});

const list = (overrides = {}) => ({
  id: 'list-1', name: 'Weekly Shop', status: 'active',
  isLocked: false, lockedBy: null, lockedAt: null, updatedAt: 1000,
  ...overrides,
});

describe('SyncEngine.resolveConflict — items', () => {
  it('both checked: returns the more recently updated one', async () => {
    const local  = item({ checked: true, updatedAt: 2000 });
    const remote = item({ checked: true, updatedAt: 1000 });
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(local);
  });

  it('both checked: returns remote when remote is more recent', async () => {
    const local  = item({ checked: true, updatedAt: 1000 });
    const remote = item({ checked: true, updatedAt: 2000 });
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(remote);
  });

  it('local checked, remote not: local wins regardless of timestamp', async () => {
    const local  = item({ checked: true,  updatedAt: 1000 });
    const remote = item({ checked: false, updatedAt: 9999 });
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(local);
  });

  it('remote checked, local not: remote wins regardless of timestamp', async () => {
    const local  = item({ checked: false, updatedAt: 9999 });
    const remote = item({ checked: true,  updatedAt: 1000 });
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(remote);
  });

  it('neither checked, local newer: merges name, quantity, price into remote base', async () => {
    const local  = item({ checked: false, name: 'Whole Milk', price: 1.5, quantity: '2', updatedAt: 2000 });
    const remote = item({ checked: false, name: 'Milk',       price: 1.0, quantity: '1', updatedAt: 1000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.name).toBe('Whole Milk');
    expect(result.price).toBe(1.5);
    expect(result.quantity).toBe('2');
    expect(result.updatedAt).toBe(2000);
  });

  it('neither checked, local newer: does NOT merge category or sortOrder (system-managed)', async () => {
    const local  = item({ checked: false, category: 'Produce', sortOrder: 10, updatedAt: 2000 });
    const remote = item({ checked: false, category: 'Dairy',   sortOrder: 1,  updatedAt: 1000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.category).toBe('Dairy');
    expect(result.sortOrder).toBe(1);
  });

  it('neither checked, remote newer: returns remote unchanged', async () => {
    const local  = item({ checked: false, name: 'Whole Milk', updatedAt: 1000 });
    const remote = item({ checked: false, name: 'Milk',       updatedAt: 2000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.name).toBe('Milk');
  });

  it('neither checked, local newer: merges measurement fields', async () => {
    const local  = item({ checked: false, measurementUnit: 'kg', measurementValue: 2, updatedAt: 2000 });
    const remote = item({ checked: false, measurementUnit: 'g',  measurementValue: 500, updatedAt: 1000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.measurementUnit).toBe('kg');
    expect(result.measurementValue).toBe(2);
  });
});

describe('SyncEngine.resolveConflict — lists', () => {
  it('deleted beats active', async () => {
    const result = await SyncEngine.resolveConflict(
      list({ status: 'deleted' }),
      list({ status: 'active' })
    );
    expect(result.status).toBe('deleted');
  });

  it('remote deleted beats local active', async () => {
    const result = await SyncEngine.resolveConflict(
      list({ status: 'active' }),
      list({ status: 'deleted' })
    );
    expect(result.status).toBe('deleted');
  });

  it('deleted beats completed', async () => {
    const result = await SyncEngine.resolveConflict(
      list({ status: 'completed' }),
      list({ status: 'deleted' })
    );
    expect(result.status).toBe('deleted');
  });

  it('completed beats active', async () => {
    const result = await SyncEngine.resolveConflict(
      list({ status: 'active' }),
      list({ status: 'completed' })
    );
    expect(result.status).toBe('completed');
  });

  it('local completed beats remote active', async () => {
    const result = await SyncEngine.resolveConflict(
      list({ status: 'completed' }),
      list({ status: 'active' })
    );
    expect(result.status).toBe('completed');
  });

  it('both active: more recent lock wins', async () => {
    const local  = list({ isLocked: true,  lockedBy: 'user-1', lockedAt: 2000, updatedAt: 2000 });
    const remote = list({ isLocked: false, lockedBy: null,      lockedAt: null, updatedAt: 1000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.isLocked).toBe(true);
    expect(result.lockedBy).toBe('user-1');
  });

  it('both active: remote newer lock beats older local lock', async () => {
    const local  = list({ isLocked: true,  lockedBy: 'user-1', lockedAt: 1000, updatedAt: 1000 });
    const remote = list({ isLocked: true,  lockedBy: 'user-2', lockedAt: 2000, updatedAt: 2000 });
    const result = await SyncEngine.resolveConflict(local, remote);
    expect(result.lockedBy).toBe('user-2');
  });
});

describe('SyncEngine.resolveConflict — default (no checked/status)', () => {
  it('local newer: local wins', async () => {
    const local  = { id: '1', updatedAt: 2000 };
    const remote = { id: '1', updatedAt: 1000 };
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(local);
  });

  it('remote newer: remote wins', async () => {
    const local  = { id: '1', updatedAt: 1000 };
    const remote = { id: '1', updatedAt: 2000 };
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(remote);
  });

  it('neither has updatedAt: remote wins', async () => {
    const local  = { id: '1' };
    const remote = { id: '2' };
    expect(await SyncEngine.resolveConflict(local, remote)).toBe(remote);
  });
});

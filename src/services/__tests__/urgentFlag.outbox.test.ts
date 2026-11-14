/**
 * Fable audit (task 137), F2: an item marked urgent while offline sent no push.
 * The call failed on the network, was reported, and the marking was gone.
 * Now it waits in an outbox on the phone and goes out when the connection
 * returns or the app next starts, while it still applies.
 */
const mockInvoke = jest.fn();
const mockCurrentUser = { current: { uid: 'user-1' } as { uid: string } | null };
const mockStore = new Map<string, string>();
const mockNetListeners: Array<(s: { isConnected: boolean }) => void> = [];
const mockItems = new Map<string, { id: string; isUrgent: boolean }>();
const mockUser = { current: { familyGroupId: 'fam-1', displayName: 'Giedrius' } as any };

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ get currentUser() { return mockCurrentUser.current; } }),
  getIdToken: jest.fn(async () => 'id-token'),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn((cb: any) => { mockNetListeners.push(cb); return () => {}; }) },
}));
jest.mock('../SupabaseClient', () => ({ __esModule: true, default: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } } }));
jest.mock('../AuthenticationModule', () => ({
  __esModule: true,
  default: { getCurrentUser: jest.fn(async () => mockUser.current) },
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async (id: string) => mockItems.get(id) ?? null) },
}));
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a) } }));

import * as Notifier from '../UrgentNotifier';
import { getIdToken } from '@react-native-firebase/auth';

const { notifyItemUrgent } = Notifier;
// On the old module these do not exist: the tests below must fail there.
const flushUrgentOutbox = (Notifier as any).flushUrgentOutbox as () => Promise<void>;
const reset = (Notifier as any).__resetUrgentNotifierForTests as (() => void) | undefined;
const OUTBOX_KEY = '@urgent_outbox';

const offline = () => ({ error: Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' }) });
const ok = () => ({ error: null });
const item = { id: 'item-9', listId: 'list-1', name: 'Nappies', isUrgent: true } as any;
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); };
const outbox = () => JSON.parse(mockStore.get(OUTBOX_KEY) ?? '[]');
const goOnline = async () => {
  mockNetListeners.forEach(cb => cb({ isConnected: false }));
  mockNetListeners.forEach(cb => cb({ isConnected: true }));
  await settle();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockNetListeners.length = 0;
  mockItems.clear();
  mockItems.set('item-9', { id: 'item-9', isUrgent: true });
  mockCurrentUser.current = { uid: 'user-1' };
  mockUser.current = { familyGroupId: 'fam-1', displayName: 'Giedrius' };
  mockInvoke.mockResolvedValue(ok());
  reset?.();
});

it('online: sends once and keeps nothing', async () => {
  notifyItemUrgent(item);
  await settle();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
});

it('offline: the marking waits and is sent when the connection returns, with the same row id', async () => {
  mockInvoke.mockResolvedValueOnce(offline());
  notifyItemUrgent(item);
  await settle();
  expect(outbox()).toHaveLength(1);
  const firstId = mockInvoke.mock.calls[0][1].body.id;

  await goOnline();
  expect(mockInvoke).toHaveBeenCalledTimes(2);
  expect(mockInvoke.mock.calls[1][1].body).toEqual(expect.objectContaining({
    id: firstId, name: 'Nappies', family_group_id: 'fam-1', created_by: 'user-1', idToken: 'id-token', status: 'active',
  }));
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
  expect(mockRecordError).not.toHaveBeenCalled();
});

it('a marking waiting from the last session is sent at app start', async () => {
  mockStore.set(OUTBOX_KEY, JSON.stringify([{ id: 'row-1', itemId: 'item-9', name: 'Nappies', familyGroupId: 'fam-1', uid: 'user-1', createdByName: 'G', createdAt: Date.now() - 1000 }]));
  await flushUrgentOutbox();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke.mock.calls[0][1].body.id).toBe('row-1');
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
});

it('still offline at flush: it stays for the next try', async () => {
  mockStore.set(OUTBOX_KEY, JSON.stringify([{ id: 'row-1', itemId: 'item-9', name: 'Nappies', familyGroupId: 'fam-1', uid: 'user-1', createdByName: 'G', createdAt: Date.now() }]));
  mockInvoke.mockResolvedValue(offline());
  await flushUrgentOutbox();
  expect(outbox()).toHaveLength(1);
});

it('the server refusing (not a network failure) is reported and not kept', async () => {
  mockInvoke.mockResolvedValueOnce({ error: Object.assign(new Error('403'), { name: 'FunctionsHttpError' }) });
  notifyItemUrgent(item);
  await settle();
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
  expect(mockRecordError).toHaveBeenCalledTimes(1);
});

it.each([
  ['the item is no longer urgent', () => { mockItems.set('item-9', { id: 'item-9', isUrgent: false }); }],
  ['the item was deleted', () => { mockItems.delete('item-9'); }],
  ['another account signed in', () => { mockCurrentUser.current = { uid: 'user-2' }; }],
  ['signed out', () => { mockCurrentUser.current = null; }],
  ['the phone moved to another family', () => { mockUser.current = { familyGroupId: 'fam-2' }; }],
])('dropped, not sent, when %s', async (_label, change) => {
  mockInvoke.mockResolvedValueOnce(offline());
  notifyItemUrgent(item);
  await settle();
  expect(outbox()).toHaveLength(1);
  change();
  await flushUrgentOutbox();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
});

it('older than 12 hours: dropped', async () => {
  mockStore.set(OUTBOX_KEY, JSON.stringify([{ id: 'row-1', itemId: 'item-9', name: 'Nappies', familyGroupId: 'fam-1', uid: 'user-1', createdByName: 'G', createdAt: Date.now() - 13 * 3600 * 1000 }]));
  await flushUrgentOutbox();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
});

it('two items marked offline, then one flush: both go out once each, nothing lost or doubled', async () => {
  mockItems.set('item-10', { id: 'item-10', isUrgent: true });
  mockInvoke.mockResolvedValueOnce(offline()).mockResolvedValueOnce(offline());
  notifyItemUrgent(item);
  notifyItemUrgent({ ...item, id: 'item-10', name: 'Wipes' });
  await settle();
  expect(outbox()).toHaveLength(2);
  await Promise.all([flushUrgentOutbox(), flushUrgentOutbox()]);
  expect(mockInvoke).toHaveBeenCalledTimes(4);
  const sentIds = mockInvoke.mock.calls.slice(2).map(c => c[1].body.id);
  expect(new Set(sentIds).size).toBe(2);
});

it('a login token that cannot be refreshed offline keeps the marking (Fable review)', async () => {
  const tokenOffline = () => Object.assign(new Error('[auth/network-request-failed] A network error'), { code: 'auth/network-request-failed' });
  (getIdToken as jest.Mock).mockRejectedValueOnce(tokenOffline());
  notifyItemUrgent(item);
  await settle();
  expect(outbox()).toHaveLength(1);
  (getIdToken as jest.Mock).mockRejectedValueOnce(tokenOffline());
  await flushUrgentOutbox();
  expect(outbox()).toHaveLength(1);
  await flushUrgentOutbox();
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('rate limited (429) is kept for later; another refusal is not', async () => {
  const http = (status: number) => ({ error: Object.assign(new Error(String(status)), { name: 'FunctionsHttpError', context: { status } }) });
  mockInvoke.mockResolvedValueOnce(http(429));
  notifyItemUrgent(item);
  await settle();
  expect(outbox()).toHaveLength(1);
  mockInvoke.mockResolvedValueOnce(http(401));
  await flushUrgentOutbox();
  expect(mockStore.has(OUTBOX_KEY)).toBe(false);
});

it('the same item marked urgent twice offline waits as one push', async () => {
  mockInvoke.mockResolvedValue(offline());
  notifyItemUrgent(item);
  await settle();
  notifyItemUrgent(item);
  notifyItemUrgent({ ...item, id: 'item-10', name: 'Wipes' });
  await settle();
  expect(outbox().map((p: any) => p.itemId).sort()).toEqual(['item-10', 'item-9']);
});

it('the outbox keeps at most 20 markings (newest kept)', async () => {
  mockInvoke.mockResolvedValue(offline());
  for (let i = 0; i < 25; i++) notifyItemUrgent({ ...item, id: `item-n${i}`, name: `n${i}` });
  await settle();
  const names = outbox().map((p: any) => p.name);
  expect(names).toHaveLength(20);
  expect(names[19]).toBe('n24');
});

it('a broken stored outbox is treated as empty', async () => {
  mockStore.set(OUTBOX_KEY, '{not json');
  await flushUrgentOutbox();
  expect(mockInvoke).not.toHaveBeenCalled();
  mockStore.set(OUTBOX_KEY, '{"a":1}');
  await expect(flushUrgentOutbox()).resolves.toBeUndefined();
});

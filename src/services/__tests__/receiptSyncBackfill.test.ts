/**
 * runReceiptSyncBackfill (App start, once): lists that hold a receipt but are
 * marked synced are marked pending so they are sent again. At most 3 tries.
 * Was 0 % covered (Fable audit task 137). Real WatermelonDB (in-memory).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  },
}));

import { InteractionManager } from 'react-native';
import LocalStorageManager from '../LocalStorageManager';
import { runReceiptSyncBackfill } from '../receiptSyncBackfill';

const FLAG = '@receipt_sync_backfill_v1';
let n = 0;
const list = (over: Record<string, unknown>) => ({
  id: `l-bf-${++n}`, name: 'L', familyGroupId: 'fam-bf', createdBy: 'u1', createdAt: n, status: 'completed',
  completedAt: n, completedBy: 'u1', receiptUrl: null, receiptData: null, syncStatus: 'synced', isLocked: false,
  lockedBy: null, lockedByName: null, lockedByRole: null, lockedAt: null, budget: null, storeName: null,
  archived: false, layoutApplied: false, totalAmount: null, merchantName: null, purchaseDate: null, currency: null, ...over,
}) as any;

beforeEach(() => {
  mockStore.clear();
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((cb: () => void) => { cb(); return { cancel: () => {} }; }) as any);
});
afterEach(() => jest.restoreAllMocks());

it('marks synced lists that hold a receipt as pending, leaves the rest, and records done', async () => {
  const withReceipt = list({ receiptData: { lineItems: [] }, syncStatus: 'synced' });
  const failedWithReceipt = list({ receiptData: { lineItems: [] }, syncStatus: 'failed' });
  const noReceipt = list({ syncStatus: 'synced' });
  const alreadyPending = list({ receiptData: { lineItems: [] }, syncStatus: 'pending' });
  await LocalStorageManager.saveListsBatch([withReceipt, failedWithReceipt, noReceipt, alreadyPending]);

  await runReceiptSyncBackfill();

  expect((await LocalStorageManager.getList(withReceipt.id))!.syncStatus).toBe('pending');
  expect((await LocalStorageManager.getList(failedWithReceipt.id))!.syncStatus).toBe('pending');
  expect((await LocalStorageManager.getList(noReceipt.id))!.syncStatus).toBe('synced');
  expect((await LocalStorageManager.getList(alreadyPending.id))!.syncStatus).toBe('pending');
  expect(mockStore.get(FLAG)).toBe('done');
});

it('done or failed before: does nothing', async () => {
  for (const flag of ['done', 'failed']) {
    mockStore.set(FLAG, flag);
    const l = list({ receiptData: { lineItems: [] } });
    await LocalStorageManager.saveListsBatch([l]);
    await runReceiptSyncBackfill();
    expect((await LocalStorageManager.getList(l.id))!.syncStatus).toBe('synced');
    expect(mockStore.get(FLAG)).toBe(flag);
  }
});

it('three tries used up, or a damaged flag: marked failed, nothing changed', async () => {
  for (const flag of ['3', 'garbage']) {
    mockStore.set(FLAG, flag);
    await runReceiptSyncBackfill();
    expect(mockStore.get(FLAG)).toBe('failed');
  }
});

it('a failing run counts the try, and the third failing try marks failed', async () => {
  const spy = jest.spyOn(LocalStorageManager, 'getDatabase').mockImplementation(() => { throw new Error('db'); });
  await runReceiptSyncBackfill();
  expect(mockStore.get(FLAG)).toBe('1');
  await runReceiptSyncBackfill();
  expect(mockStore.get(FLAG)).toBe('2');
  await runReceiptSyncBackfill();
  expect(mockStore.get(FLAG)).toBe('failed');
  spy.mockRestore();
});

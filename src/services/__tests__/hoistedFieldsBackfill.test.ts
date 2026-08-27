/**
 * The schema-v15 hoist moved receipt totals out of the receiptData JSON and
 * into first-class columns, with a one-time repair for rows written before
 * it. The repair matched only rows whose total_amount was NULL — but the
 * completion path it existed to repair stored 0 when the running total was
 * not yet known, so those rows kept a total nothing read and counted as £0
 * spend everywhere. These pin both shapes as repairable, and pin that a
 * total already on the column is never touched.
 *
 * Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import LocalStorageManager from '../LocalStorageManager';
import { runHoistedFieldsBackfill } from '../hoistedFieldsBackfill';
import { ReceiptData, ShoppingList } from '../../models/types';

let idCounter = 0;

/**
 * The pre-v15 receiptData shape, which is what the stranded rows hold — v15
 * took totalAmount, merchantName and currency out of ReceiptData precisely
 * because it moved them to columns, so the current type cannot express it.
 * The mapper stringifies this into the column verbatim.
 */
const legacyReceipt = (totalAmount: number) => ({
  merchantName: 'Tesco',
  extractedAt: 1,
  totalAmount,
  currency: '£',
  confidence: 1,
}) as unknown as ReceiptData;

const makeList = (overrides: Partial<ShoppingList> = {}): ShoppingList => ({
  id: `hoist-list-${++idCounter}`,
  name: 'Shop',
  familyGroupId: 'hoist-group',
  createdBy: 'user-1',
  createdAt: 1000,
  status: 'completed',
  completedAt: 1000,
  completedBy: 'user-1',
  receiptUrl: null,
  receiptData: null,
  syncStatus: 'synced',
  isLocked: false,
  lockedBy: null,
  lockedByName: null,
  lockedByRole: null,
  lockedAt: null,
  budget: null,
  storeName: 'Tesco',
  totalAmount: null,
  merchantName: null,
  purchaseDate: null,
  currency: null,
  ...overrides,
});

const totalOf = async (id: string): Promise<number | null> => {
  const list = await LocalStorageManager.getList(id);
  return list?.totalAmount ?? null;
};

beforeEach(() => {
  // The flag is per-key and the module reads it fresh; a null read means
  // "never run", which is the state a device upgrading into v16 is in.
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

describe('hoisted fields backfill', () => {
  it('hoists a receipt total onto a row whose column is zero', async () => {
    const zeroed = makeList({ totalAmount: 0, receiptData: legacyReceipt(88.31) });
    await LocalStorageManager.saveList(zeroed);

    await runHoistedFieldsBackfill();

    expect(await totalOf(zeroed.id)).toBe(88.31);
  });

  it('still hoists onto a row whose column is null', async () => {
    const nulled = makeList({ totalAmount: null, receiptData: legacyReceipt(12.5) });
    await LocalStorageManager.saveList(nulled);

    await runHoistedFieldsBackfill();

    expect(await totalOf(nulled.id)).toBe(12.5);
  });

  it('leaves a total that is already on the column alone', async () => {
    // The JSON is not more authoritative than a column that has a value —
    // re-running must not rewrite a total someone has since corrected.
    const priced = makeList({ totalAmount: 20, receiptData: legacyReceipt(88.31) });
    await LocalStorageManager.saveList(priced);

    await runHoistedFieldsBackfill();

    expect(await totalOf(priced.id)).toBe(20);
  });

  it('fills the merchant and currency the same rows never got either', async () => {
    const zeroed = makeList({ totalAmount: 0, receiptData: legacyReceipt(40) });
    await LocalStorageManager.saveList(zeroed);

    await runHoistedFieldsBackfill();

    const list = await LocalStorageManager.getList(zeroed.id);
    expect(list?.merchantName).toBe('Tesco');
    expect(list?.currency).toBe('£');
  });

  it('does not run again once it has recorded done', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('done');
    const zeroed = makeList({ totalAmount: 0, receiptData: legacyReceipt(99) });
    await LocalStorageManager.saveList(zeroed);

    await runHoistedFieldsBackfill();

    expect(await totalOf(zeroed.id)).toBe(0);
  });
});

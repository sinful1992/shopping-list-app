/**
 * One purchase keeps one price-history record. A purchase recorded before ids
 * were stable must have that old record corrected, not a second one added.
 */

import { pickPurchaseRecordId, purchaseRecordId } from '../PriceHistoryService';
import { PriceHistoryRecord } from '../../models/types';

const rec = (id: string, listId: string, name = 'milk'): PriceHistoryRecord => ({
  id,
  itemName: name,
  itemNameNormalized: name,
  price: 1,
  storeName: null,
  listId,
  recordedAt: 0,
  familyGroupId: 'g',
});

describe('pickPurchaseRecordId', () => {
  it('uses the stable id when nothing is recorded', () => {
    expect(pickPurchaseRecordId([], 'L', 'I', 'milk')).toBe(purchaseRecordId('L', 'I'));
  });

  it('keeps the stable id once it exists, even beside a legacy record', () => {
    const own = purchaseRecordId('L', 'I');
    expect(pickPurchaseRecordId([rec('uuid-1', 'L'), rec(own, 'L')], 'L', 'I', 'milk')).toBe(own);
  });

  it('reuses a random-id record from a check-off on the same list', () => {
    expect(pickPurchaseRecordId([rec('uuid-1', 'L')], 'L', 'I', 'milk')).toBe('uuid-1');
  });

  it('reuses a backfill record on the same list', () => {
    expect(pickPurchaseRecordId([rec('backfill_L_I', 'L')], 'L', 'I', 'milk')).toBe('backfill_L_I');
  });

  it('ignores records from other lists, other names, and other items', () => {
    const records = [rec('uuid-1', 'other'), rec('uuid-2', 'L', 'oat milk'), rec(purchaseRecordId('L', 'J'), 'L')];
    expect(pickPurchaseRecordId(records, 'L', 'I', 'milk')).toBe(purchaseRecordId('L', 'I'));
  });
});

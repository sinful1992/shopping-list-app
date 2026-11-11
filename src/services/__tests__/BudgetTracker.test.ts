/**
 * BudgetTracker: the Budget screen's totals and per-trip breakdown.
 * Was 0 % covered (Fable audit task 137).
 */
const mockGetCompleted = jest.fn();
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { getCompletedLists: (...a: unknown[]) => mockGetCompleted(...a) },
}));

import BudgetTracker from '../BudgetTracker';

const trip = (over: Record<string, unknown>) => ({
  id: 'l', name: 'Trip', createdBy: 'u1', completedAt: 100, merchantName: 'Tesco',
  totalAmount: 10, receiptUrl: 'receipts/x.jpg', ...over,
});

beforeEach(() => mockGetCompleted.mockReset());

describe('calculateExpenditureForDateRange', () => {
  it('sums trips with an amount and counts the ones without', async () => {
    mockGetCompleted.mockResolvedValue([
      trip({ id: 'a', totalAmount: 12.5 }),
      trip({ id: 'b', totalAmount: 0 }),
      trip({ id: 'c', totalAmount: null }),
      trip({ id: 'd', totalAmount: undefined }),
    ]);
    const r = await BudgetTracker.calculateExpenditureForDateRange('fam', 1, 2);
    expect(mockGetCompleted).toHaveBeenCalledWith('fam', 1, 2);
    expect(r).toEqual(expect.objectContaining({
      totalAmount: 12.5, listCount: 4, listsWithReceipts: 2, listsWithoutReceipts: 2, dateRange: { start: 1, end: 2 },
    }));
  });

  it('no trips: zero', async () => {
    mockGetCompleted.mockResolvedValue([]);
    const r = await BudgetTracker.calculateExpenditureForDateRange('fam', 1, 2);
    expect(r.totalAmount).toBe(0);
    expect(r.listCount).toBe(0);
  });

  it('a storage error is reported with context', async () => {
    mockGetCompleted.mockRejectedValue(new Error('db'));
    await expect(BudgetTracker.calculateExpenditureForDateRange('fam', 1, 2)).rejects.toThrow('Failed to calculate expenditure: db');
  });
});

describe('getExpenditureBreakdown', () => {
  it('maps each trip', async () => {
    mockGetCompleted.mockResolvedValue([trip({ id: 'a', name: 'Sat', completedAt: 5, totalAmount: 7.2 })]);
    expect(await BudgetTracker.getExpenditureBreakdown('fam', 1, 2)).toEqual([{
      listId: 'a', listName: 'Sat', completedAt: 5, merchantName: 'Tesco', totalAmount: 7.2, createdBy: 'u1', hasReceipt: true,
    }]);
  });

  it('a £0.00 trip keeps its 0 amount (it is not "no amount")', async () => {
    mockGetCompleted.mockResolvedValue([trip({ totalAmount: 0 })]);
    expect((await BudgetTracker.getExpenditureBreakdown('fam', 1, 2))[0].totalAmount).toBe(0);
  });

  it('missing values become null / 0; no receipt image means hasReceipt false', async () => {
    mockGetCompleted.mockResolvedValue([trip({ completedAt: null, merchantName: '', totalAmount: null, receiptUrl: null })]);
    expect((await BudgetTracker.getExpenditureBreakdown('fam', 1, 2))[0]).toEqual(expect.objectContaining({
      completedAt: 0, merchantName: null, totalAmount: null, hasReceipt: false,
    }));
  });

  it('a storage error is reported with context', async () => {
    mockGetCompleted.mockRejectedValue(new Error('db'));
    await expect(BudgetTracker.getExpenditureBreakdown('fam', 1, 2)).rejects.toThrow('Failed to get expenditure breakdown: db');
  });
});

describe('getExpenditureByMember', () => {
  it('counts only the trips that member created', async () => {
    mockGetCompleted.mockResolvedValue([
      trip({ createdBy: 'u1', totalAmount: 5 }),
      trip({ createdBy: 'u2', totalAmount: 100 }),
      trip({ createdBy: 'u1', totalAmount: null }),
    ]);
    const r = await BudgetTracker.getExpenditureByMember('fam', 1, 2, 'u1');
    expect(r).toEqual(expect.objectContaining({ totalAmount: 5, listCount: 2, listsWithReceipts: 1, listsWithoutReceipts: 1 }));
  });

  it('a storage error is reported with context', async () => {
    mockGetCompleted.mockRejectedValue(new Error('db'));
    await expect(BudgetTracker.getExpenditureByMember('fam', 1, 2, 'u1')).rejects.toThrow('Failed to calculate member expenditure: db');
  });
});

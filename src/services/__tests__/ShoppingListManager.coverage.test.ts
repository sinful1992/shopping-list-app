/**
 * ShoppingListManager: list create, rename, store, lock, complete and the
 * shopping lock check. Was 19 % covered (Fable audit task 137).
 */
jest.mock('react-native-get-random-values', () => ({}));
const mockLSM = {
  saveList: jest.fn(async () => {}),
  getAllLists: jest.fn(),
  getActiveLists: jest.fn(),
  getList: jest.fn(),
  updateList: jest.fn(),
};
jest.mock('../LocalStorageManager', () => ({ __esModule: true, get default() { return mockLSM; } }));
const mockPush = jest.fn<Promise<void>, unknown[]>(async () => {});
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { pushChange: (...a: unknown[]) => mockPush(...a) } }));
const mockCanCreate = jest.fn();
const mockIncrement = jest.fn();
jest.mock('../UsageTracker', () => ({
  __esModule: true,
  default: { canCreateList: (...a: unknown[]) => mockCanCreate(...a), incrementListCounter: (...a: unknown[]) => mockIncrement(...a) },
}));
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a), log: jest.fn() } }));

import ShoppingListManager from '../ShoppingListManager';

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const settle = () => new Promise(r => setTimeout(r, 0));
const user = { uid: 'u1', familyGroupId: 'fam' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockLSM.updateList.mockImplementation(async (id: string, u: object) => ({ id, ...u }));
  mockCanCreate.mockResolvedValue({ allowed: true });
  mockPush.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('createList', () => {
  it('a refusal from the usage check stops creation with its reason', async () => {
    mockCanCreate.mockResolvedValueOnce({ allowed: false, reason: 'Limit reached' });
    await expect(ShoppingListManager.createList('Sat', 'u1', 'fam', user)).rejects.toThrow('Limit reached');
    mockCanCreate.mockResolvedValueOnce({ allowed: false });
    await expect(ShoppingListManager.createList('Sat', 'u1', 'fam', user)).rejects.toThrow('Cannot create list');
    expect(mockLSM.saveList).not.toHaveBeenCalled();
  });

  it('counts the list and syncs it', async () => {
    const l = await ShoppingListManager.createList(' Saturday ', 'u1', 'fam', user);
    expect(l.name).toBe('Saturday');
    expect(mockIncrement).toHaveBeenCalledWith('u1');
    expect(mockPush).toHaveBeenCalledWith('list', l.id, 'create', l);
  });
});

describe('createListOptimistic', () => {
  it('saves at once with the given id and runs the rest in the background', async () => {
    let release!: (v: unknown) => void;
    mockCanCreate.mockReturnValueOnce(new Promise(r => { release = r; }));
    const l = await ShoppingListManager.createListOptimistic('Weekly', 'u1', 'fam', user, 'fixed-id');
    expect(l).toEqual(expect.objectContaining({ id: 'fixed-id', name: 'Weekly', status: 'active', syncStatus: 'pending', createdAt: NOW }));
    expect(mockLSM.saveList).toHaveBeenCalledWith(l);
    expect(mockPush).not.toHaveBeenCalled();
    release({ allowed: true });
    await settle(); await settle();
    expect(mockIncrement).toHaveBeenCalledWith('u1');
    expect(mockPush).toHaveBeenCalledWith('list', 'fixed-id', 'create');
  });

  it('no id given: a fresh one; blank name refused', async () => {
    const l = await ShoppingListManager.createListOptimistic('A', 'u1', 'fam', user);
    expect(l.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(ShoppingListManager.createListOptimistic('  ', 'u1', 'fam', user)).rejects.toThrow('List name is required');
  });

  it('a failing background step is reported, the list stays', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    await ShoppingListManager.createListOptimistic('A', 'u1', 'fam', user);
    await settle(); await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ShoppingListManager performBackgroundCreationTasks');
  });
});

describe('reads', () => {
  it('getAllLists newest first; active lists and one list pass through', async () => {
    mockLSM.getAllLists.mockResolvedValue([{ id: 'a', createdAt: 1 }, { id: 'c', createdAt: 3 }, { id: 'b', createdAt: 2 }]);
    expect((await ShoppingListManager.getAllLists('fam')).map(l => l.id)).toEqual(['c', 'b', 'a']);
    mockLSM.getActiveLists.mockResolvedValue([{ id: 'x' }]);
    expect(await ShoppingListManager.getAllActiveLists('fam')).toEqual([{ id: 'x' }]);
    mockLSM.getList.mockResolvedValue({ id: 'y' });
    expect(await ShoppingListManager.getListById('y')).toEqual({ id: 'y' });
  });
});

describe('updates', () => {
  it('updateList marks pending and syncs without waiting; a failing sync is reported', async () => {
    mockPush.mockRejectedValueOnce(new Error('offline'));
    const l = await ShoppingListManager.updateList('l1', { budget: 50 } as any);
    expect(mockLSM.updateList).toHaveBeenCalledWith('l1', { budget: 50, syncStatus: 'pending' });
    expect(mockPush).toHaveBeenCalledWith('list', 'l1', 'update', l);
    await settle();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'ShoppingListManager updateList sync');
  });

  it('rename cleans the name; blank refused', async () => {
    await ShoppingListManager.updateListName('l1', '  Big shop  ');
    expect(mockLSM.updateList).toHaveBeenCalledWith('l1', expect.objectContaining({ name: 'Big shop' }));
    await expect(ShoppingListManager.updateListName('l1', '   ')).rejects.toThrow('List name is required');
  });

  it('a new store resets the applied layout; a blank store clears it', async () => {
    await ShoppingListManager.updateListStoreName('l1', ' Aldi ');
    expect(mockLSM.updateList).toHaveBeenLastCalledWith('l1', expect.objectContaining({ storeName: 'Aldi', layoutApplied: false }));
    await ShoppingListManager.updateListStoreName('l1', '  ');
    expect(mockLSM.updateList).toHaveBeenLastCalledWith('l1', expect.objectContaining({ storeName: null, layoutApplied: false }));
  });

  it('lockListForShopping records who and when', async () => {
    await ShoppingListManager.lockListForShopping('l1', 'u1', 'Anna', 'Mum');
    expect(mockLSM.updateList).toHaveBeenCalledWith('l1', expect.objectContaining({
      isLocked: true, lockedBy: 'u1', lockedByName: 'Anna', lockedByRole: 'Mum', lockedAt: NOW,
    }));
  });
});

describe('completing a trip', () => {
  const unlocked = { isLocked: false, lockedBy: null, lockedByName: null, lockedByRole: null, lockedAt: null };

  it('completeFromReceipt completes and unlocks, leaving the receipt fields alone', async () => {
    await ShoppingListManager.completeFromReceipt('l1', 'u1', 2);
    const sent = mockLSM.updateList.mock.calls[0][1];
    expect(sent).toEqual(expect.objectContaining({ status: 'completed', completedAt: NOW, completedBy: 'u1', uncheckedItemsCount: 2, ...unlocked }));
    expect(sent).not.toHaveProperty('receiptData');
    expect(sent).not.toHaveProperty('totalAmount');
  });

  it('completeShoppingFast with a total writes it, £, the store, and a placeholder receipt', async () => {
    await ShoppingListManager.completeShoppingFast('l1', 'u1', 23.4, 'Tesco', 3);
    const sent = mockLSM.updateList.mock.calls[0][1];
    expect(sent).toEqual(expect.objectContaining({
      status: 'completed', totalAmount: 23.4, currency: '£', merchantName: 'Tesco', purchaseDate: null, uncheckedItemsCount: 3, ...unlocked,
      receiptData: expect.objectContaining({ lineItems: [], confidence: 1, extractedAt: NOW }),
    }));
  });

  it('completeShoppingFast with no total writes no receipt; no count leaves the count out', async () => {
    await ShoppingListManager.completeShoppingFast('l1', 'u1', 0, null);
    const sent = mockLSM.updateList.mock.calls[0][1];
    expect(sent).not.toHaveProperty('receiptData');
    expect(sent).not.toHaveProperty('uncheckedItemsCount');
    expect(sent.totalAmount).toBe(0);
    await ShoppingListManager.completeShoppingFast('l1', 'u1', 5, null, 0);
    expect(mockLSM.updateList.mock.calls[1][1].uncheckedItemsCount).toBe(0);
  });
});

describe('isListLockedForUser', () => {
  const list = (over: Record<string, unknown>) => mockLSM.getList.mockResolvedValue({ id: 'l1', isLocked: true, lockedBy: 'u2', lockedAt: NOW - HOUR, ...over });

  it('not found or not locked: free', async () => {
    mockLSM.getList.mockResolvedValue(null);
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(false);
    list({ isLocked: false });
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(false);
  });

  it('locked by me: free for me', async () => {
    list({ lockedBy: 'u1' });
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(false);
  });

  it('locked by someone else within 2 hours: locked, nothing written', async () => {
    list({ lockedAt: NOW - 2 * HOUR });
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(true);
    expect(mockLSM.updateList).not.toHaveBeenCalled();
  });

  it('a lock older than 2 hours is released and counts as free', async () => {
    list({ lockedAt: NOW - 2 * HOUR - 1 });
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(false);
    expect(mockLSM.updateList).toHaveBeenCalledWith('l1', expect.objectContaining({ isLocked: false, lockedBy: null, lockedAt: null }));
  });

  it('a lock with no time on it stays locked', async () => {
    list({ lockedAt: null });
    expect(await ShoppingListManager.isListLockedForUser('l1', 'u1')).toBe(true);
  });
});

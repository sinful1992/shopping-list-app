// Task 158 test 6: after sign-out (clearAllData) and sign-in, the lists from
// Firebase must come back. clearAllData soft-deletes rows; saveListsBatch must
// not trip over those tombstones.
const recorded: string[] = [];
jest.mock('../../src/services/CrashReporting', () => ({
  __esModule: true,
  default: { recordError: (e: Error, ctx?: string) => { recorded.push(`${ctx}: ${e.message}`); }, log: () => {} },
}));

import localStorageManager from '../../src/services/LocalStorageManager';
import { ShoppingList } from '../../src/models/types';
import { v4 as uuidv4 } from 'uuid';

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: uuidv4(), name: 'Weekly Shop', familyGroupId: 'fam-158', createdBy: 'user-1',
    createdAt: 1000, status: 'active', completedAt: null, completedBy: null,
    receiptUrl: null, receiptData: null, syncStatus: 'synced', isLocked: false,
    lockedBy: null, lockedByName: null, lockedByRole: null, lockedAt: null,
    budget: null, totalAmount: null, merchantName: null, purchaseDate: null, currency: null,
    ...overrides,
  } as ShoppingList;
}

describe('sign-out then sign-in restores lists (task 158 test 6)', () => {
  // it.failing until the fix: flip to it() in the sign-in task.
  it.failing('saveListsBatch brings back a list that clearAllData removed', async () => {
    const list = makeList();
    await localStorageManager.saveListsBatch([list]);
    expect((await localStorageManager.getAllLists('fam-158')).map(l => l.id)).toEqual([list.id]);

    await localStorageManager.clearAllData();
    expect(await localStorageManager.getAllLists('fam-158')).toEqual([]);

    await localStorageManager.saveListsBatch([list]);
    const back = await localStorageManager.getAllLists('fam-158');
    expect(back.map(l => l.id)).toEqual([list.id]);
    expect(back[0].name).toBe('Weekly Shop');
    expect(recorded).toEqual([]);
  });
});

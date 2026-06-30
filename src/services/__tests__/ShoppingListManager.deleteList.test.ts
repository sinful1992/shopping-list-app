/**
 * Regression test for the offline-delete "ghost list" bug.
 *
 * deleteList must soft-delete only: mark status='deleted' and sync that via an
 * 'update' op (Firebase node kept). It must NOT push a 'delete' op, which would
 * hard-remove the Firebase node and orphan devices that were offline at delete
 * time (their upsert-only cold-start load cannot prune a list absent from the
 * snapshot, leaving a stale "active" ghost).
 */
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('../UsageTracker', () => ({ default: {} }));
jest.mock('../CrashReporting', () => ({ default: { recordError: jest.fn(), log: jest.fn() } }));

const mockUpdateList = jest.fn();
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { updateList: (...args: any[]) => mockUpdateList(...args) },
}));

const mockPushChange = jest.fn().mockResolvedValue(undefined);
jest.mock('../SyncEngine', () => ({
  __esModule: true,
  default: { pushChange: (...args: any[]) => mockPushChange(...args) },
}));

import ShoppingListManager from '../ShoppingListManager';

describe('ShoppingListManager.deleteList — soft delete reconciles offline devices', () => {
  beforeEach(() => {
    mockUpdateList.mockReset();
    mockPushChange.mockReset().mockResolvedValue(undefined);
  });

  it('syncs status=deleted via an update op and never pushes a hard delete', async () => {
    mockUpdateList.mockResolvedValue({ id: 'list-1', status: 'deleted' });

    await ShoppingListManager.deleteList('list-1');

    // Local record marked deleted (pending sync).
    expect(mockUpdateList).toHaveBeenCalledWith(
      'list-1',
      expect.objectContaining({ status: 'deleted', syncStatus: 'pending' }),
    );

    // The Firebase write is an 'update' carrying status=deleted (node kept)...
    expect(mockPushChange).toHaveBeenCalledWith(
      'list',
      'list-1',
      'update',
      expect.objectContaining({ status: 'deleted' }),
    );

    // ...and crucially NOT a hard-remove 'delete' op.
    const pushedDelete = mockPushChange.mock.calls.some(
      ([entity, , operation]) => entity === 'list' && operation === 'delete',
    );
    expect(pushedDelete).toBe(false);
  });
});

/**
 * Review #2 (task 100): signing out deletes this phone's copy of the data, so
 * changes that never reached Firebase would be lost silently. logout() tries to
 * send them first and only signs out with some still waiting when forced.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useSettings } from '../useSettings';
import AuthenticationModule from '../../services/AuthenticationModule';
import SyncEngine from '../../services/SyncEngine';

jest.mock('../../contexts/UserContext', () => ({ useUser: () => null }));
jest.mock('../../services/AuthenticationModule', () => ({
  __esModule: true,
  default: { signOut: jest.fn(async () => undefined), getCurrentUser: jest.fn(async () => null) },
}));
jest.mock('../../services/SyncEngine', () => ({
  __esModule: true,
  default: { syncPendingChanges: jest.fn(), getSyncStatus: jest.fn(), waitForInFlight: jest.fn(), getInFlightCount: jest.fn(() => 0) },
}));
// Only so this file also runs against the old hook, which imported it.
jest.mock('../../services/NotificationManager', () => ({ __esModule: true, default: { clearToken: jest.fn(async () => undefined) } }));
jest.mock('../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn() } }));
jest.mock('../../services/FamilyMembers', () => ({ loadFamilyMembers: jest.fn(async () => []) }));
jest.mock('../../services/ReceiptOCRService', () => ({
  __esModule: true,
  default: { getServerUrl: jest.fn(async () => ''), setServerUrl: jest.fn() },
}));
jest.mock('@react-native-firebase/database', () => ({
  getDatabase: jest.fn(), ref: jest.fn(), update: jest.fn(), updateProfile: jest.fn(),
}));

const signOut = AuthenticationModule.signOut as jest.Mock;
const sync = SyncEngine as unknown as { syncPendingChanges: jest.Mock; getSyncStatus: jest.Mock; waitForInFlight: jest.Mock; getInFlightCount: jest.Mock };
const pending = (n: number) => sync.getSyncStatus.mockResolvedValue({ isOnline: true, pendingOperations: n, lastSyncTimestamp: null });

async function hook() {
  const result = { current: null as unknown as ReturnType<typeof useSettings> };
  const Harness = () => { result.current = useSettings(); return null; };
  await act(async () => { create(<Harness />); });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  sync.syncPendingChanges.mockResolvedValue({ success: true });
  sync.waitForInFlight.mockResolvedValue(undefined);
  sync.getInFlightCount.mockReturnValue(0);
});

describe('useSettings.logout (review #2)', () => {
  it('signs out when every change was sent', async () => {
    pending(0);
    const r = await hook();
    await expect(r.current.logout()).resolves.toEqual({ signedOut: true, pending: 0 });
    expect(sync.syncPendingChanges).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('stops and reports the count when changes are still waiting (offline)', async () => {
    pending(3);
    const r = await hook();
    await expect(r.current.logout()).resolves.toEqual({ signedOut: false, pending: 3 });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out with changes waiting only when forced, without trying to send again', async () => {
    pending(3);
    const r = await hook();
    await expect(r.current.logout({ force: true })).resolves.toEqual({ signedOut: true, pending: 0 });
    expect(sync.syncPendingChanges).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('a failed send still counts what is left instead of signing out blindly', async () => {
    sync.syncPendingChanges.mockRejectedValue(new Error('timed out'));
    pending(1);
    const r = await hook();
    await expect(r.current.logout()).resolves.toEqual({ signedOut: false, pending: 1 });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('fails the sign-out when the queue cannot be read (never deletes uncounted changes)', async () => {
    sync.getSyncStatus.mockRejectedValue(new Error('db locked'));
    const r = await hook();
    await expect(r.current.logout()).rejects.toThrow('db locked');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('gives up sending after 10 s on Wi-Fi with no internet and asks, instead of hanging', async () => {
    jest.useFakeTimers();
    try {
      sync.syncPendingChanges.mockReturnValue(new Promise(() => {}));
      pending(2);
      const r = await hook();
      const done = r.current.logout();
      await act(async () => { jest.advanceTimersByTime(10000); });
      await expect(done).resolves.toEqual({ signedOut: false, pending: 2 });
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // Codex P2 on PR #54: an edit made just before Logout is still being sent,
  // not queued, so the queue looked empty and the edit was lost unannounced.
  it('waits for a change still being sent before counting what is left', async () => {
    let finishSend!: () => void;
    sync.waitForInFlight.mockReturnValue(new Promise<void>(r => { finishSend = () => { sync.getInFlightCount.mockReturnValue(0); r(); }; }));
    sync.getInFlightCount.mockReturnValue(1);
    pending(0);
    const r = await hook();
    let settled = false;
    const done = r.current.logout().then(v => { settled = true; return v; });
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => { finishSend(); });
    await expect(done).resolves.toEqual({ signedOut: true, pending: 0 });
  });

  it('a send that never finishes is counted after 10 s and the user is asked', async () => {
    jest.useFakeTimers();
    try {
      sync.waitForInFlight.mockReturnValue(new Promise(() => {}));
      sync.getInFlightCount.mockReturnValue(1);
      pending(0);
      const r = await hook();
      const done = r.current.logout();
      await act(async () => { jest.advanceTimersByTime(10000); });
      await expect(done).resolves.toEqual({ signedOut: false, pending: 1 });
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // ada's review of 1.53.15: the send times out during the queue read and
  // moves into the queue after it was read. Counting in-flight first catches it.
  it('a send that moves into the queue while the queue is being read is still counted', async () => {
    jest.useFakeTimers();
    try {
      sync.waitForInFlight.mockReturnValue(new Promise(() => {}));
      sync.getInFlightCount.mockReturnValue(1);
      sync.getSyncStatus.mockImplementation(async () => {
        // The queue was read as empty; then the timed-out send is queued and
        // leaves the in-flight count.
        sync.getInFlightCount.mockReturnValue(0);
        return { isOnline: true, pendingOperations: 0, lastSyncTimestamp: null };
      });
      const r = await hook();
      const done = r.current.logout();
      await act(async () => { jest.advanceTimersByTime(10000); });
      await expect(done).resolves.toEqual({ signedOut: false, pending: 1 });
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

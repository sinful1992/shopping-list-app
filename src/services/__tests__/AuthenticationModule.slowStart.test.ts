/**
 * Slow start in low signal (USER, task 139).
 *
 * The splash screen stays until onAuthStateChanged reports a user. It used to
 * report one only when the server answered the read of /users/{uid}; in low
 * signal that answer takes many seconds or never comes, although the same
 * profile sits in encrypted storage on the phone. These tests play a server
 * that answers late, never, or with bad news, and measure when the app is told.
 */

// @env is synthesised by the dotenv babel plugin, so there is no real module
// for jest to resolve — it has to be declared virtual.
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'test-client-id' }), { virtual: true });
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), signOut: jest.fn(() => Promise.resolve()) },
  isSuccessResponse: jest.fn(() => false),
  isCancelledResponse: jest.fn(() => false),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: {},
}));
jest.mock('../SecureStorage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { clearAllData: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../NotificationManager', () => ({
  __esModule: true,
  default: { clearToken: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../FirebaseSyncListener', () => ({
  __esModule: true,
  default: { stopAllListeners: jest.fn() },
}));
jest.mock('../SyncEngine', () => ({
  __esModule: true,
  default: { resetForSignOut: jest.fn() },
}));
jest.mock('../ImageStorageManager', () => ({
  __esModule: true,
  default: { clearUploadQueue: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));


let mockAuthListener: ((user: { uid: string } | null) => unknown) | null = null;
/** onValue listeners by path, so a test decides when "the server" answers. */
let mockValueListeners: Record<string, Array<(snapshot: unknown) => void>> = {};
let mockUnsubscribed: string[] = [];
let mockTree: Record<string, unknown> = {};

jest.mock('@react-native-firebase/database', () => {
  const snapshot = (value: unknown) => ({
    val: () => (value === undefined ? null : value),
    exists: () => value !== undefined && value !== null,
  });
  return {
    getAuth: jest.fn(() => ({ currentUser: { uid: 'bob-uid', email: 'bob@example.com', providerData: [] } })),
    createUserWithEmailAndPassword: jest.fn(),
    signInWithEmailAndPassword: jest.fn(),
    signInWithCredential: jest.fn(),
    signOut: jest.fn(() => Promise.resolve()),
    onAuthStateChanged: jest.fn((_auth: unknown, cb: (user: { uid: string } | null) => unknown) => {
      mockAuthListener = cb;
      return () => { mockAuthListener = null; };
    }),
    getIdToken: jest.fn(() => Promise.resolve('id-token')),
    updateProfile: jest.fn(),
    GoogleAuthProvider: { credential: jest.fn() },
    EmailAuthProvider: { credential: jest.fn() },
    reauthenticateWithCredential: jest.fn(),
    getStorage: jest.fn(() => ({})),
    deleteObject: jest.fn(() => Promise.resolve()),
    getDatabase: jest.fn(() => ({})),
    ref: jest.fn((_db: unknown, path?: string) => ({ path: path ?? '' })),
    get: jest.fn((r: { path: string }) => Promise.resolve(snapshot(mockTree[r.path]))),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    query: jest.fn((r: unknown) => r),
    orderByChild: jest.fn(),
    equalTo: jest.fn(),
    push: jest.fn(() => ({ key: 'new-key' })),
    // The profile repair: never completes here, as on a phone with no signal.
    runTransaction: jest.fn(() => new Promise(() => {})),
    onValue: jest.fn((r: { path: string }, cb: (snapshot: unknown) => void) => {
      (mockValueListeners[r.path] ||= []).push(cb);
      return () => {
        mockUnsubscribed.push(r.path);
        mockValueListeners[r.path] = (mockValueListeners[r.path] || []).filter(l => l !== cb);
      };
    }),
  };
});

import AuthenticationModule from '../AuthenticationModule';
import SecureStorage from '../SecureStorage';
import CrashReporting from '../CrashReporting';
import { User } from '../../models/types';

const BOB = 'bob-uid';
const bob = (overrides: Partial<User> = {}): User => ({
  uid: BOB,
  email: 'bob@example.com',
  displayName: 'Bob',
  familyGroupId: '-Ngroup123',
  createdAt: 1700000000000,
  usageCounters: { listsCreated: 0, ocrProcessed: 0, urgentItemsCreated: 0, lastResetDate: 1700000000000 },
  ...overrides,
});
const snap = (value: unknown) => ({ val: () => value ?? null, exists: () => value != null });
const serverAnswers = (uid: string, value: unknown) =>
  (mockValueListeners[`/users/${uid}`] || []).forEach(l => l(snap(value)));
const saved = (value: unknown, delayMs = 0) =>
  (SecureStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    new Promise(resolve => setTimeout(() => resolve(key === '@user' ? value : null), delayMs)));

/** Signs the phone in and returns what the app is told, with the time of each call. */
function start(uid: string | null = BOB) {
  const t0 = Date.now();
  const told: Array<{ at: number; user: User | null }> = [];
  const unsubscribe = AuthenticationModule.onAuthStateChanged(user => told.push({ at: Date.now() - t0, user }));
  mockAuthListener?.(uid ? { uid } : null);
  return { told, unsubscribe };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuthListener = null;
  mockValueListeners = {};
  mockUnsubscribed = [];
  mockTree = {};
  (SecureStorage.getItem as jest.Mock).mockImplementation(() => Promise.resolve(null));
  (SecureStorage.setItem as jest.Mock).mockImplementation(() => Promise.resolve());
});
afterEach(() => jest.useRealTimers());

describe('start with a saved profile and a slow server', () => {
  it('reports the saved profile at once when the server answers after 10 s', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(50);
    // measured on dev 35d9b60: nothing is reported here; the first report comes at 10000 ms
    expect(told.map(t => t.user?.uid)).toEqual([BOB]);
    expect(told[0].at).toBeLessThan(100);

    await jest.advanceTimersByTimeAsync(9950);
    serverAnswers(BOB, bob({ displayName: 'Bob (server)' }));
    expect(told).toHaveLength(2);
    expect(told[1].user?.displayName).toBe('Bob (server)');
    expect(told[1].at).toBeGreaterThanOrEqual(10000);
  });

  it('reports the saved profile when the server never answers', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    // measured on dev 35d9b60: still nothing after an hour, the splash never leaves
    expect(told.map(t => t.user?.uid)).toEqual([BOB]);
    expect(told[0].at).toBeLessThan(100);
  });

  it('does not write the saved profile back to storage, only the server one', async () => {
    saved(JSON.stringify(bob()));
    start();
    await jest.advanceTimersByTimeAsync(50);
    expect(SecureStorage.setItem).not.toHaveBeenCalled();
    serverAnswers(BOB, bob({ displayName: 'New name' }));
    expect(SecureStorage.setItem).toHaveBeenCalledWith('@user', JSON.stringify(bob({ displayName: 'New name' })));
  });
});

describe('what a saved profile must never do', () => {
  it('first sign-in (nothing saved): waits for the server as before', async () => {
    const { told } = start();
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
    serverAnswers(BOB, bob());
    expect(told.map(t => t.user?.uid)).toEqual([BOB]);
  });

  it('a profile saved for another account is not reported', async () => {
    saved(JSON.stringify(bob({ uid: 'alice-uid', email: 'alice@example.com' })));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
  });

  it.each([
    ['broken JSON', '{"uid":"bob-uid","ema'],
    ['empty text', ''],
    ['the word null', 'null'],
    ['a profile with no uid', JSON.stringify({ email: 'bob@example.com' })],
    ['a list', '[]'],
    ['a number', '7'],
  ])('unreadable storage (%s) is ignored and nothing throws', async (_name, value) => {
    saved(value);
    const { told } = start();
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
    serverAnswers(BOB, bob());
    expect(told.map(t => t.user?.uid)).toEqual([BOB]);
  });

  it('storage that rejects is ignored', async () => {
    (SecureStorage.getItem as jest.Mock).mockImplementation(() => Promise.reject(new Error('keystore locked')));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
    serverAnswers(BOB, bob());
    expect(told).toHaveLength(1);
  });

  it('the server answering first wins: slow storage does not put the old profile back', async () => {
    saved(JSON.stringify(bob({ displayName: 'Old name' })), 2000);
    const { told } = start();
    await jest.advanceTimersByTimeAsync(500);
    serverAnswers(BOB, bob({ displayName: 'New name' }));
    await jest.advanceTimersByTimeAsync(5000);
    expect(told.map(t => t.user?.displayName)).toEqual(['New name']);
  });

  it('signed out while storage was still being read: the old profile is not reported after the sign-out', async () => {
    saved(JSON.stringify(bob()), 2000);
    const { told } = start();
    await jest.advanceTimersByTimeAsync(500);
    mockAuthListener?.(null);
    await jest.advanceTimersByTimeAsync(5000);
    expect(told.map(t => t.user)).toEqual([null]);
  });

  it('another account signed in while storage was still being read: the first profile is not reported', async () => {
    saved(JSON.stringify(bob()), 2000);
    const { told } = start();
    await jest.advanceTimersByTimeAsync(500);
    mockAuthListener?.({ uid: 'alice-uid' });
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
  });

  it('no saved profile is reported after the listener was removed', async () => {
    saved(JSON.stringify(bob()), 2000);
    const { told, unsubscribe } = start();
    await jest.advanceTimersByTimeAsync(500);
    unsubscribe();
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toEqual([]);
    expect(mockUnsubscribed).toContain(`/users/${BOB}`);
  });

  it('signed out from the start: reports no user, storage is not read', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start(null);
    await jest.advanceTimersByTimeAsync(5000);
    expect(told.map(t => t.user)).toEqual([null]);
    expect(SecureStorage.getItem).not.toHaveBeenCalled();
  });

  it('the same sign-in event twice reports the saved profile once', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    mockAuthListener?.({ uid: BOB });
    await jest.advanceTimersByTimeAsync(5000);
    expect(told).toHaveLength(1);
  });
});

describe('a screen that throws while it is told', () => {
  it('is recorded, not left as an unhandled rejection, and the server answer still gets through', async () => {
    saved(JSON.stringify(bob()));
    let calls = 0;
    const told: Array<User | null> = [];
    AuthenticationModule.onAuthStateChanged(user => {
      calls += 1;
      if (calls === 1) throw new Error('render failed');
      told.push(user);
    });
    mockAuthListener?.({ uid: BOB });
    await jest.advanceTimersByTimeAsync(50);
    expect(CrashReporting.recordError).toHaveBeenCalledWith(expect.any(Error), 'AuthenticationModule saved profile at start');
    serverAnswers(BOB, bob({ displayName: 'Server' }));
    expect(told.map(u => u?.displayName)).toEqual(['Server']);
  });
});

describe('bad news from the server still arrives, late', () => {
  it('the profile is gone on the server and cannot be repaired: signed out when the server says so twice', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(50);
    expect(told.map(t => t.user?.uid)).toEqual([BOB]);
    serverAnswers(BOB, null); // first: the repair is tried
    serverAnswers(BOB, null); // second: nothing came of it
    expect(told.at(-1)?.user).toBeNull();
  });

  it('the server takes the family away: the app is told the new state', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(50);
    expect(told[0].user?.familyGroupId).toBe('-Ngroup123');
    serverAnswers(BOB, bob({ familyGroupId: null }));
    expect(told.at(-1)?.user?.familyGroupId).toBeNull();
  });

  it('a session that ends later (token revoked) reports no user', async () => {
    saved(JSON.stringify(bob()));
    const { told } = start();
    await jest.advanceTimersByTimeAsync(50);
    mockAuthListener?.(null);
    expect(told.at(-1)?.user).toBeNull();
    expect(mockUnsubscribed).toContain(`/users/${BOB}`);
  });
});

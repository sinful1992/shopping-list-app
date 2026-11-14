/**
 * ada break tests for review #2/#3 (task 100): AuthenticationModule.signOut()
 * removes the push token (best effort), stops listeners, clears local data and
 * the upload queue, then signs out of Firebase.
 */
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'test-client-id' }), { virtual: true });

const mockCalls: string[] = [];
let mockClearToken: () => Promise<void> = () => Promise.resolve();
const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'alice' } };

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    revokeAccess: jest.fn(() => Promise.reject(new Error('not a google user'))),
    signOut: jest.fn(() => Promise.resolve()),
  },
  isSuccessResponse: jest.fn(),
  isCancelledResponse: jest.fn(),
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
  default: { clearAllData: jest.fn(() => { mockCalls.push('clearAllData'); return Promise.resolve(); }) },
}));
jest.mock('../NotificationManager', () => ({
  __esModule: true,
  default: { clearToken: jest.fn(() => { mockCalls.push('clearToken'); return mockClearToken(); }) },
}));
jest.mock('../FirebaseSyncListener', () => ({
  __esModule: true,
  default: { stopAllListeners: jest.fn(() => { mockCalls.push('stopAllListeners'); }) },
}));
jest.mock('../SyncEngine', () => ({
  __esModule: true,
  default: { resetForSignOut: jest.fn(() => { mockCalls.push('resetForSignOut'); }) },
}));
jest.mock('../ImageStorageManager', () => ({
  __esModule: true,
  default: { clearUploadQueue: jest.fn(() => { mockCalls.push('clearUploadQueue'); return Promise.resolve(); }) },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));
jest.mock('@react-native-firebase/database', () => ({
  getAuth: jest.fn(() => mockAuth),
  // Like RNFirebase: signing out with nobody signed in rejects (auth/no-current-user).
  signOut: jest.fn(async () => {
    mockCalls.push('firebaseSignOut');
    if (!mockAuth.currentUser) throw new Error('[auth/no-current-user] No user currently signed in.');
    mockAuth.currentUser = null;
  }),
  onAuthStateChanged: jest.fn(),
  getDatabase: jest.fn(() => ({})),
  getStorage: jest.fn(() => ({})),
  GoogleAuthProvider: { credential: jest.fn() },
  EmailAuthProvider: { credential: jest.fn() },
}));

import AuthenticationModule from '../AuthenticationModule';

const settlesWithin = (p: Promise<unknown>, ms: number) =>
  Promise.race([
    p.then(() => 'settled', () => 'settled'),
    new Promise(resolve => setTimeout(() => resolve('hung'), ms)),
  ]);

beforeEach(() => {
  mockCalls.length = 0;
  mockClearToken = () => Promise.resolve();
  mockAuth.currentUser = { uid: 'alice' };
});

describe('adabreak #2/#3 AuthenticationModule.signOut', () => {
  it('does not hang when removing the push token never answers (deleteToken stuck offline)', async () => {
    mockClearToken = () => new Promise<void>(() => {});
    const result = await settlesWithin(AuthenticationModule.signOut(), 2000);
    expect(result).toBe('settled');
    expect(mockCalls).toContain('clearAllData');
  }, 10000);

  it('a failing token removal is best effort: data still cleared and the user signed out', async () => {
    mockClearToken = () => Promise.reject(new Error('keystore gone'));
    await AuthenticationModule.signOut().catch(() => undefined);
    expect(mockCalls).toEqual(expect.arrayContaining(['clearAllData', 'clearUploadQueue', 'firebaseSignOut']));
  });

  it('double tap: two sign-outs at once both succeed (no error alert after a good sign-out)', async () => {
    const first = AuthenticationModule.signOut();
    const second = AuthenticationModule.signOut();
    const results = await Promise.allSettled([first, second]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });
});

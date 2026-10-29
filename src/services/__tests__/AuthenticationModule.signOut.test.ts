/**
 * Review #2/#3 (task 100): signing out must leave nothing of the old account on
 * the phone for the next one. The order is the point: the push token goes while
 * the session still exists, listeners stop before the local clear (a late
 * Firebase event would write rows back), and the clear happens before the
 * Firebase sign-out so a failed clear leaves the user signed in, not signed out
 * with the data still there.
 */
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'test-client-id' }), { virtual: true });

const mockCalls: string[] = [];
let mockClearFails = false;

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
    removeItem: jest.fn((k: string) => { mockCalls.push(`secure.remove ${k}`); return Promise.resolve(); }),
  },
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: {
    clearAllData: jest.fn(() => {
      mockCalls.push('clearAllData');
      return mockClearFails ? Promise.reject(new Error('db locked')) : Promise.resolve();
    }),
  },
}));
jest.mock('../NotificationManager', () => ({
  __esModule: true,
  default: { clearToken: jest.fn(() => { mockCalls.push('clearToken'); return Promise.resolve(); }) },
}));
jest.mock('../FirebaseSyncListener', () => ({
  __esModule: true,
  default: { stopAllListeners: jest.fn(() => { mockCalls.push('stopAllListeners'); }) },
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
  getAuth: jest.fn(() => ({ currentUser: { uid: 'alice' } })),
  signOut: jest.fn(() => { mockCalls.push('firebaseSignOut'); return Promise.resolve(); }),
  onAuthStateChanged: jest.fn(),
  getDatabase: jest.fn(() => ({})),
  getStorage: jest.fn(() => ({})),
  GoogleAuthProvider: { credential: jest.fn() },
  EmailAuthProvider: { credential: jest.fn() },
}));

import AuthenticationModule from '../AuthenticationModule';

beforeEach(() => {
  mockCalls.length = 0;
  mockClearFails = false;
});

describe('AuthenticationModule.signOut (review #2/#3)', () => {
  it('removes the push token, stops listeners, clears local data and the upload queue, then signs out', async () => {
    await AuthenticationModule.signOut();
    const order = mockCalls.filter(c => !c.startsWith('secure.'));
    expect(order).toEqual(['clearToken', 'stopAllListeners', 'clearAllData', 'clearUploadQueue', 'firebaseSignOut']);
  });

  it('clears the push token on every caller, not only the Settings button', async () => {
    // TermsAcceptanceScreen calls AuthenticationModule.signOut() directly.
    await AuthenticationModule.signOut();
    expect(mockCalls).toContain('clearToken');
  });

  it('does not sign out of Firebase when the local clear fails (the data would stay for the next account)', async () => {
    mockClearFails = true;
    await expect(AuthenticationModule.signOut()).rejects.toThrow('Sign out failed: db locked');
    expect(mockCalls).not.toContain('firebaseSignOut');
  });

  it('still removes the saved session keys after a normal sign-out', async () => {
    await AuthenticationModule.signOut();
    expect(mockCalls.filter(c => c.startsWith('secure.remove')).length).toBeGreaterThanOrEqual(2);
  });
});

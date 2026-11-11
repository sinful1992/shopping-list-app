/**
 * Left note 139 (audit 137, task 145): the server says this account is no longer in the family the
 * phone has saved (it left on another phone, or moved to another family). That family's local data
 * and the changes waiting for it must leave the phone. Before, they stayed on it.
 */
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'test-client-id' }), { virtual: true });
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn() },
  isSuccessResponse: jest.fn(), isCancelledResponse: jest.fn(), isErrorWithCode: jest.fn(), statusCodes: {},
}));
let mockSaved: string | null = null;
jest.mock('../SecureStorage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn((_k: string, v: string) => { mockSaved = v; return Promise.resolve(); }),
    getItem: jest.fn(() => Promise.resolve(mockSaved)),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { clearAllData: jest.fn(() => Promise.resolve()), clearFamilyData: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../NotificationManager', () => ({ __esModule: true, default: { clearToken: jest.fn(() => Promise.resolve()) } }));
jest.mock('../FirebaseSyncListener', () => ({ __esModule: true, default: { stopAllListeners: jest.fn() } }));
jest.mock('../SyncEngine', () => ({ __esModule: true, default: { resetForSignOut: jest.fn() } }));
jest.mock('../ImageStorageManager', () => ({ __esModule: true, default: { clearUploadQueue: jest.fn(() => Promise.resolve()) } }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

let mockAuthListener: ((u: any) => void) | null = null;
let mockValueListeners: Record<string, Array<(s: any) => void>> = {};
jest.mock('@react-native-firebase/database', () => ({
  getAuth: jest.fn(() => ({ currentUser: { uid: 'bob-uid', email: 'b@x', providerData: [] } })),
  onAuthStateChanged: jest.fn((_a: unknown, cb: (u: any) => void) => { mockAuthListener = cb; return () => { mockAuthListener = null; }; }),
  getIdToken: jest.fn(() => Promise.resolve('t')),
  signOut: jest.fn(() => Promise.resolve()),
  getDatabase: jest.fn(() => ({})),
  ref: jest.fn((_db: unknown, path?: string) => ({ path: path ?? '' })),
  get: jest.fn(() => Promise.resolve({ val: () => null, exists: () => false })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  runTransaction: jest.fn(() => new Promise(() => {})),
  onValue: jest.fn((r: { path: string }, l: (s: any) => void) => {
    (mockValueListeners[r.path] ??= []).push(l);
    return () => { mockValueListeners[r.path] = (mockValueListeners[r.path] ?? []).filter(x => x !== l); };
  }),
}));

import AuthenticationModule from '../AuthenticationModule';
import LocalStorageManager from '../LocalStorageManager';

const UID = 'bob-uid';
const profile = (familyGroupId: string | null, uid = UID) => ({ uid, email: 'b@x', displayName: 'Bob', familyGroupId, createdAt: 1 });
const answer = (value: unknown) =>
  (mockValueListeners[`/users/${UID}`] ?? []).forEach(l => l({ val: () => value, exists: () => value != null }));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const clearFamily = LocalStorageManager.clearFamilyData as jest.Mock;

function start() {
  const told: any[] = [];
  const unsubscribe = AuthenticationModule.onAuthStateChanged(u => told.push(u));
  mockAuthListener?.({ uid: UID });
  return { told, unsubscribe };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSaved = null;
  mockValueListeners = {};
  mockAuthListener = null;
});

describe('left note 139: the server says the account left its family', () => {
  it('saved famA, the server answers no family: famA\'s local data is cleared', async () => {
    mockSaved = JSON.stringify(profile('famA'));
    start();
    answer(profile(null));
    await flush();
    expect(clearFamily).toHaveBeenCalledWith('famA');
    expect(JSON.parse(mockSaved!).familyGroupId).toBeNull();
  });

  it('saved famA, the server answers famB: famA\'s data goes, famB\'s stays', async () => {
    mockSaved = JSON.stringify(profile('famA'));
    start();
    answer(profile('famB'));
    await flush();
    expect(clearFamily).toHaveBeenCalledTimes(1);
    expect(clearFamily).toHaveBeenCalledWith('famA');
  });

  it('the same family on every answer clears nothing', async () => {
    mockSaved = JSON.stringify(profile('famA'));
    start();
    answer(profile('famA'));
    answer({ ...profile('famA'), displayName: 'Robert' });
    await flush();
    expect(clearFamily).not.toHaveBeenCalled();
  });

  it('a first sign-in (nothing saved) and a join (no family -> famA) clear nothing', async () => {
    start();
    answer(profile(null));
    answer(profile('famA'));
    await flush();
    expect(clearFamily).not.toHaveBeenCalled();
  });

  it('a profile saved by ANOTHER account clears nothing (sign-out already cleared it)', async () => {
    mockSaved = JSON.stringify(profile('famZ', 'alice-uid'));
    start();
    answer(profile(null));
    await flush();
    expect(clearFamily).not.toHaveBeenCalled();
  });

  it('two answers in a row (famA -> famB -> no family) clear each old family once, in order', async () => {
    mockSaved = JSON.stringify(profile('famA'));
    start();
    answer(profile('famB'));
    answer(profile(null));
    await flush();
    expect(clearFamily.mock.calls).toEqual([['famA'], ['famB']]);
  });

  it('a failing clear is reported, and the next answer is still saved', async () => {
    mockSaved = JSON.stringify(profile('famA'));
    clearFamily.mockRejectedValueOnce(new Error('db closed'));
    start();
    answer(profile(null));
    await flush();
    answer({ ...profile(null), displayName: 'Later' });
    await flush();
    expect(JSON.parse(mockSaved!).displayName).toBe('Later');
  });
});

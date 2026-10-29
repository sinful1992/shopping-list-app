/**
 * Task 49 part C, P1. The family group node also holds every list, item and
 * price record of the family, and the rules give members read on the whole
 * node, so a get() of it downloads all of that. Home ran two such reads on
 * each load. The group's existence and its own fields are read one child at a
 * time instead. The mocks are the membership suite's, with a get() that
 * answers from a nested tree and logs every path it was asked for.
 */
// @env is synthesised by the dotenv babel plugin, so there is no real module
// for jest to resolve — it has to be declared virtual.
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'test-client-id' }), { virtual: true });
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({
      data: { idToken: 'google-id-token', user: { email: mockGoogleEmail } },
    })),
    getTokens: jest.fn(() => Promise.resolve({ accessToken: 'google-access-token' })),
    revokeAccess: jest.fn(() => Promise.reject(new Error('not a google user'))),
    signOut: jest.fn(() => Promise.resolve()),
  },
  // Driven by a flag rather than mockReturnValue: clearAllMocks does not undo a
  // return value set inside a test, so one would leak into the next.
  isSuccessResponse: jest.fn(() => mockGoogleOutcome === 'success'),
  isCancelledResponse: jest.fn(() => mockGoogleOutcome === 'cancelled'),
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
jest.mock('../ImageStorageManager', () => ({
  __esModule: true,
  default: { clearUploadQueue: jest.fn(() => Promise.resolve()) },
}));
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

/** The database, nested as RTDB holds it. */
let mockTree: any = {};
/** Every path get() was asked for. */
const mockReads: string[] = [];
const mockAt = (path: string): unknown =>
  path.split('/').filter(Boolean).reduce((node: any, key) => (node == null ? undefined : node[key]), mockTree);
/** Every write, in order, so ordering between them can be asserted. */
let mockWrites: Array<{ op: string; path: string; value: unknown }> = [];
/** Paths whose writes are rejected, standing in for a rules denial. */
let mockDenied: Set<string> = new Set();
/** What the Google prompt does when the deletion preflight opens it. */
let mockGoogleOutcome: 'success' | 'cancelled' = 'success';
/** Which account that prompt comes back with. */
let mockGoogleEmail = 'bob@example.com';
/** Rejection for the next reauthenticateWithCredential, e.g. a wrong password. */
let mockReauthError: { code?: string; message: string } | null = null;

const mockCurrentUser = {
  uid: 'bob-uid',
  email: 'bob@example.com',
  providerData: [{ providerId: 'password', email: 'bob@example.com' }] as Array<{
    providerId: string;
    email?: string | null;
  }>,
  delete: jest.fn(() => Promise.resolve()),
};

// jest.config.js maps every `@react-native-firebase/*` specifier onto the one
// stub file, so auth, database and storage all resolve to the same module — a
// factory per package silently collides and only the last registered survives.
// One factory carrying every export the module imports is the way to override
// it. This is why the auth mock appeared to be ignored when it was declared
// separately.
jest.mock('@react-native-firebase/database', () => {
  const snapshot = (value: unknown) => ({
    val: () => (value === undefined ? null : value),
    exists: () => value !== undefined && value !== null,
  });
  return {
    // auth
    getAuth: jest.fn(() => ({ currentUser: mockCurrentUser })),
    createUserWithEmailAndPassword: jest.fn(),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: mockCurrentUser })),
    signInWithCredential: jest.fn(),
    signOut: jest.fn(() => Promise.resolve()),
    onAuthStateChanged: jest.fn(),
    getIdToken: jest.fn(() => Promise.resolve('id-token')),
    updateProfile: jest.fn(),
    GoogleAuthProvider: {
      credential: jest.fn((idToken: string, accessToken: string) => ({
        providerId: 'google.com', idToken, accessToken,
      })),
    },
    EmailAuthProvider: {
      credential: jest.fn((email: string, password: string) => ({
        providerId: 'password', email, password,
      })),
    },
    // Recorded into mockWrites rather than a list of its own: proving the
    // account is present has to happen before the first destructive write, and
    // ordering between writes is what this list already answers.
    reauthenticateWithCredential: jest.fn((_user: unknown, credential: unknown) => {
      if (mockReauthError) {
        return Promise.reject(mockReauthError);
      }
      mockWrites.push({ op: 'reauth', path: '', value: credential });
      return Promise.resolve({});
    }),

    // storage
    getStorage: jest.fn(() => ({})),
    deleteObject: jest.fn(() => Promise.resolve()),

    // database. The path is the whole identity of a ref here; `update(ref(db),
    // {...})` passes no path at all, which is what makes it multi-path.
    getDatabase: jest.fn(() => ({})),
    ref: jest.fn((_db: unknown, path?: string) => ({ path: path ?? '' })),
    get: jest.fn((r: { path: string }) => { mockReads.push(r.path); return Promise.resolve(snapshot(mockAt(r.path))); }),
    set: jest.fn((r: { path: string }, value: unknown) => {
      if (mockDenied.has(r.path)) return Promise.reject(new Error('permission_denied'));
      mockWrites.push({ op: 'set', path: r.path, value });
      return Promise.resolve();
    }),
    update: jest.fn((r: { path: string }, value: unknown) => {
      if (mockDenied.has(r.path)) return Promise.reject(new Error('permission_denied'));
      mockWrites.push({ op: 'update', path: r.path, value });
      return Promise.resolve();
    }),
    remove: jest.fn((r: { path: string }) => {
      if (mockDenied.has(r.path)) return Promise.reject(new Error('permission_denied'));
      mockWrites.push({ op: 'remove', path: r.path, value: null });
      return Promise.resolve();
    }),
    query: jest.fn((r: unknown) => r),
    orderByChild: jest.fn(),
    equalTo: jest.fn(),
    push: jest.fn(() => ({ key: 'new-key' })),
    // Real enough to matter: the updater must be able to abort on an existing
    // value, which is the whole reason the profile repair is a transaction.
    runTransaction: jest.fn((r: { path: string }, updater: (current: unknown) => unknown) => {
      const current = mockTree[r.path] ?? null;
      const next = updater(current);
      if (next === undefined) {
        return Promise.resolve({ committed: false, snapshot: snapshot(current) });
      }
      if (mockDenied.has(r.path)) return Promise.reject(new Error('permission_denied'));
      mockTree[r.path] = next;
      mockWrites.push({ op: 'transaction', path: r.path, value: next });
      return Promise.resolve({ committed: true, snapshot: snapshot(next) });
    }),
    onValue: jest.fn(),
  };
});

import AuthenticationModule from '../AuthenticationModule';

const GROUP = '-Ngroup123';
const group = {
  name: 'The Smiths', invitationCode: 'ABCD2345', createdBy: 'alice', createdAt: 1700000000000,
  subscriptionTier: 'family', memberIds: { alice: true, bob: true },
  lists: { l1: { name: 'Weekly', receiptData: '…a big blob…' } },
  items: { i1: { name: 'Milk' } },
  priceHistory: { p1: { price: 1 } },
};

beforeEach(() => {
  mockReads.length = 0;
  mockTree = { users: { bob: { familyGroupId: GROUP } }, familyGroups: { [GROUP]: group } };
});

const readsOfWholeGroup = () => mockReads.filter(p => p.replace(/\/$/, '') === `/familyGroups/${GROUP}`);

describe('family group reads never download the group node', () => {
  it('validateFamilyGroupExists reads createdAt only', async () => {
    expect(await AuthenticationModule.validateFamilyGroupExists(GROUP)).toBe(true);
    expect(mockReads).toEqual([`/familyGroups/${GROUP}/createdAt`]);
  });

  it('a deleted group does not exist', async () => {
    mockTree = { familyGroups: {} };
    expect(await AuthenticationModule.validateFamilyGroupExists(GROUP)).toBe(false);
  });

  it('getUserFamilyGroup returns the group fields and nothing of the family data', async () => {
    const g = await AuthenticationModule.getUserFamilyGroup('bob');
    expect(g).toEqual({
      id: GROUP, name: 'The Smiths', invitationCode: 'ABCD2345', createdBy: 'alice',
      createdAt: 1700000000000, subscriptionTier: 'family', memberIds: { alice: true, bob: true },
    });
    expect(readsOfWholeGroup()).toEqual([]);
    expect(mockReads.every(p => !/\/(lists|items|priceHistory)/.test(p))).toBe(true);
  });

  it('a group with no invitation code yet comes back without one (Settings then makes one)', async () => {
    const { invitationCode: _, ...noCode } = group;
    mockTree = { users: { bob: { familyGroupId: GROUP } }, familyGroups: { [GROUP]: noCode } };
    const g = await AuthenticationModule.getUserFamilyGroup('bob');
    expect(g?.invitationCode).toBeUndefined();
    expect(g?.name).toBe('The Smiths');
  });

  it('a deleted group, or a user without one, is null', async () => {
    mockTree = { users: { bob: { familyGroupId: GROUP } }, familyGroups: {} };
    expect(await AuthenticationModule.getUserFamilyGroup('bob')).toBeNull();
    mockTree = { users: { bob: {} } };
    expect(await AuthenticationModule.getUserFamilyGroup('bob')).toBeNull();
  });
});

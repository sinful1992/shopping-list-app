/**
 * Membership is the one flow in this module that no single account can carry
 * out alone: the approver writes `memberIds/{uid}`, and only the requester may
 * write their own `/users/{uid}/familyGroupId`. What holds it together is the
 * *shape* of the multi-path updates — a request paired with its pointer, a
 * claim paired with the pointer's removal — so that is what these assert.
 *
 * The deletion branches are here because that is where the defect was: sending
 * two cleanups as one atomic update meant the leg that was legitimately denied
 * took the other one down with it.
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
jest.mock('react-native-encrypted-storage', () => ({
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
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn(), log: jest.fn() },
}));

/** Paths whose reads are answered, keyed exactly as the module builds them. */
let mockTree: Record<string, unknown> = {};
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
    signInWithEmailAndPassword: jest.fn(),
    signInWithCredential: jest.fn(),
    signOut: jest.fn(() => Promise.resolve()),
    onAuthStateChanged: jest.fn(),
    getIdToken: jest.fn(),
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
    get: jest.fn((r: { path: string }) => Promise.resolve(snapshot(mockTree[r.path]))),
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
    runTransaction: jest.fn(),
    onValue: jest.fn(),
  };
});

import AuthenticationModule from '../AuthenticationModule';
import { User } from '../../models/types';

const BOB = 'bob-uid';
const GROUP = '-Ngroup123';
const PASSWORD = 'correct-horse';

const bob = (overrides: Partial<User> = {}): User => ({
  uid: BOB,
  email: 'bob@example.com',
  displayName: 'Bob',
  familyGroupId: null,
  createdAt: 1700000000000,
  usageCounters: {
    listsCreated: 0,
    ocrProcessed: 0,
    urgentItemsCreated: 0,
    lastResetDate: 1700000000000,
  },
  ...overrides,
});

const pathsWritten = () => mockWrites.map(w => `${w.op} ${w.path}`);
const multiPathUpdate = () =>
  mockWrites.find(w => w.op === 'update' && w.path === '')?.value as Record<string, unknown>;

beforeEach(() => {
  mockTree = {};
  mockWrites = [];
  mockDenied = new Set();
  mockGoogleOutcome = 'success';
  mockGoogleEmail = 'bob@example.com';
  mockReauthError = null;
  mockCurrentUser.providerData = [{ providerId: 'password', email: 'bob@example.com' }];
  jest.clearAllMocks();
  // clearAllMocks drops call records, not implementations a test installed.
  mockCurrentUser.delete.mockImplementation(() => Promise.resolve());
});

describe('submitJoinRequest', () => {
  beforeEach(() => {
    mockTree['/invitations/ABCD2345'] = { groupId: GROUP, groupName: 'Test Family' };
    mockTree[`/users/${BOB}`] = bob();
  });

  // The request alone records nothing the account can find afterwards: it lives
  // under a group a non-member cannot read. The pointer is the only durable
  // trace, so the two must not be separable.
  it('writes the request and the pointer in one update', async () => {
    await AuthenticationModule.submitJoinRequest('ABCD2345', BOB);

    const update = multiPathUpdate();
    expect(Object.keys(update).sort()).toEqual([
      `/familyGroups/${GROUP}/joinRequests/${BOB}`,
      `/users/${BOB}/pendingGroupId`,
    ]);
    expect(update[`/users/${BOB}/pendingGroupId`]).toBe(GROUP);
  });

  // The rule binds this field to auth.token.email, so reading it from the
  // profile rather than the token would make the write fail by construction.
  it('takes the email from the auth token, not the profile', async () => {
    mockTree[`/users/${BOB}`] = bob({ email: 'stale@example.com' });

    await AuthenticationModule.submitJoinRequest('ABCD2345', BOB);

    const request = multiPathUpdate()[`/familyGroups/${GROUP}/joinRequests/${BOB}`] as {
      email: string;
    };
    expect(request.email).toBe('bob@example.com');
  });

  it('refuses an account already in a group', async () => {
    mockTree[`/users/${BOB}`] = bob({ familyGroupId: 'other-group' });

    await expect(AuthenticationModule.submitJoinRequest('ABCD2345', BOB)).rejects.toThrow(
      /already in a family group/,
    );
    expect(mockWrites).toHaveLength(0);
  });
});

describe('cancelJoinRequest', () => {
  // A pointer left behind restores the waiting screen for a request that is
  // no longer there.
  it('clears the request and the pointer in one update', async () => {
    await AuthenticationModule.cancelJoinRequest(GROUP, BOB);

    expect(multiPathUpdate()).toEqual({
      [`/familyGroups/${GROUP}/joinRequests/${BOB}`]: null,
      [`/users/${BOB}/pendingGroupId`]: null,
    });
  });
});

describe('completeJoinAfterApproval', () => {
  it('claims the group and clears the pointer in one update', async () => {
    mockTree[`/familyGroups/${GROUP}`] = { id: GROUP, name: 'Test Family' };

    await AuthenticationModule.completeJoinAfterApproval(GROUP, BOB);

    expect(multiPathUpdate()).toEqual({
      [`/users/${BOB}/familyGroupId`]: GROUP,
      [`/users/${BOB}/pendingGroupId`]: null,
    });
  });
});

describe('reconcilePendingMembership', () => {
  it('does nothing without a pointer', async () => {
    expect(await AuthenticationModule.reconcilePendingMembership(bob())).toBe(false);
    expect(mockWrites).toHaveLength(0);
  });

  it('does nothing when the account already has a group', async () => {
    const user = bob({ familyGroupId: GROUP, pendingGroupId: GROUP });
    expect(await AuthenticationModule.reconcilePendingMembership(user)).toBe(false);
    expect(mockWrites).toHaveLength(0);
  });

  // A request still awaiting approval, which is the ordinary case: the pointer
  // exists and must not be acted on until the approver has written the entry.
  it('does nothing while the approval has not landed', async () => {
    const user = bob({ pendingGroupId: GROUP });
    expect(await AuthenticationModule.reconcilePendingMembership(user)).toBe(false);
    expect(mockWrites).toHaveLength(0);
  });

  it('completes the join once the entry is there', async () => {
    mockTree[`/familyGroups/${GROUP}/memberIds/${BOB}`] = true;
    mockTree[`/familyGroups/${GROUP}`] = { id: GROUP, name: 'Test Family' };
    const user = bob({ pendingGroupId: GROUP });

    expect(await AuthenticationModule.reconcilePendingMembership(user)).toBe(true);
    expect(multiPathUpdate()).toEqual({
      [`/users/${BOB}/familyGroupId`]: GROUP,
      [`/users/${BOB}/pendingGroupId`]: null,
    });
  });
});

describe('deleteUserAccount', () => {
  // The regression this file exists for. An unapproved request has no memberIds
  // entry, so removing one is denied — and while both cleanups travelled as a
  // single atomic update, that denial took the request with it and left it in
  // the group pointing at an account that no longer existed.
  it('clears the request even when there is no memberIds entry to remove', async () => {
    mockTree[`/users/${BOB}`] = bob({ pendingGroupId: GROUP });
    mockDenied.add(`/familyGroups/${GROUP}/memberIds/${BOB}`);

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    expect(pathsWritten()).toContain(`remove /familyGroups/${GROUP}/joinRequests/${BOB}`);
    expect(pathsWritten()).toContain(`remove /users/${BOB}`);
  });

  // Order matters when the app dies between the two: an orphaned request can
  // still be rejected by a member, whereas a memberIds entry left behind by a
  // deleted account is one nothing is permitted to remove.
  it('removes the memberIds entry before the request', async () => {
    mockTree[`/users/${BOB}`] = bob({ pendingGroupId: GROUP });

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    const written = pathsWritten();
    expect(written.indexOf(`remove /familyGroups/${GROUP}/memberIds/${BOB}`)).toBeLessThan(
      written.indexOf(`remove /familyGroups/${GROUP}/joinRequests/${BOB}`),
    );
  });

  it('touches no group at all for an account that never joined or asked', async () => {
    mockTree[`/users/${BOB}`] = bob();

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    expect(pathsWritten().filter(p => p.includes('/familyGroups/'))).toEqual([]);
    expect(pathsWritten()).toContain(`remove /users/${BOB}`);
  });

  // The joined branch retires the invitation while still a member, because the
  // rule permitting that delete requires membership.
  it('retires the invitation before dropping the last member', async () => {
    mockTree[`/users/${BOB}`] = bob({ familyGroupId: GROUP });
    mockTree[`/familyGroups/${GROUP}/lists`] = null;
    mockTree[`/familyGroups/${GROUP}/items`] = null;
    mockTree[`/urgentItems/${GROUP}`] = null;
    mockTree[`/familyGroups/${GROUP}`] = {
      id: GROUP,
      memberIds: { [BOB]: true },
      invitationCode: 'ABCD2345',
    };

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    const written = pathsWritten();
    expect(written.indexOf('remove /invitations/ABCD2345')).toBeGreaterThanOrEqual(0);
    expect(written.indexOf('remove /invitations/ABCD2345')).toBeLessThan(
      written.indexOf(`remove /familyGroups/${GROUP}/memberIds/${BOB}`),
    );
  });

  // A group with someone else left in it keeps its invitation.
  it('leaves the invitation alone when other members remain', async () => {
    mockTree[`/users/${BOB}`] = bob({ familyGroupId: GROUP });
    mockTree[`/familyGroups/${GROUP}`] = {
      id: GROUP,
      memberIds: { [BOB]: true, 'alice-uid': true },
      invitationCode: 'ABCD2345',
    };

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    expect(pathsWritten()).not.toContain('remove /invitations/ABCD2345');
    expect(pathsWritten()).toContain(`remove /familyGroups/${GROUP}/memberIds/${BOB}`);
  });
});

/**
 * Deleting the account is the tenth of ten steps, and Firebase only accepts it
 * shortly after a sign-in. Left where it was, the nine destructive steps ran
 * and then the tenth was refused with auth/requires-recent-login — data gone,
 * account still there, and no profile left for the app to load.
 */
describe('deleteUserAccount re-authentication', () => {
  const authMock = jest.requireMock('@react-native-firebase/database');

  const asGoogleAccount = () => {
    mockCurrentUser.providerData = [{ providerId: 'google.com', email: 'bob@example.com' }];
  };

  it('proves the account is present before the first destructive write', async () => {
    mockTree[`/users/${BOB}`] = bob();

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    expect(pathsWritten()[0]).toBe('reauth ');
  });

  it('sends the typed password, not one read from anywhere else', async () => {
    mockTree[`/users/${BOB}`] = bob();

    await AuthenticationModule.deleteUserAccount(PASSWORD);

    expect(authMock.EmailAuthProvider.credential).toHaveBeenCalledWith('bob@example.com', PASSWORD);
  });

  it('deletes nothing when the password is wrong', async () => {
    mockTree[`/users/${BOB}`] = bob({ familyGroupId: GROUP });
    mockReauthError = { code: 'auth/wrong-password', message: 'wrong password' };

    await expect(AuthenticationModule.deleteUserAccount('guess')).rejects.toThrow(
      /Incorrect password/,
    );
    expect(mockWrites).toHaveLength(0);
    expect(mockCurrentUser.delete).not.toHaveBeenCalled();
  });

  it('deletes nothing when no password was collected', async () => {
    mockTree[`/users/${BOB}`] = bob();

    await expect(AuthenticationModule.deleteUserAccount()).rejects.toThrow(/Password is required/);
    expect(mockWrites).toHaveLength(0);
  });

  // Backing out of the Google prompt is not a failure: nothing was deleted, so
  // the caller must not report success either.
  it('reports a cancelled Google prompt as no deletion rather than an error', async () => {
    asGoogleAccount();
    mockGoogleOutcome = 'cancelled';
    mockTree[`/users/${BOB}`] = bob();

    expect(await AuthenticationModule.deleteUserAccount()).toBe(false);
    expect(mockWrites).toHaveLength(0);
    expect(mockCurrentUser.delete).not.toHaveBeenCalled();
  });

  // A device with several Google accounts can hand back a different one, which
  // would be refused after the data was already gone.
  it('deletes nothing when the Google prompt returns a different account', async () => {
    asGoogleAccount();
    mockGoogleEmail = 'someone-else@example.com';
    mockTree[`/users/${BOB}`] = bob();

    await expect(AuthenticationModule.deleteUserAccount()).rejects.toThrow(
      /same Google account/,
    );
    expect(mockWrites).toHaveLength(0);
  });

  it('deletes a Google account without asking for a password', async () => {
    asGoogleAccount();
    mockTree[`/users/${BOB}`] = bob();

    expect(await AuthenticationModule.deleteUserAccount()).toBe(true);
    expect(mockCurrentUser.delete).toHaveBeenCalled();
  });

  // The preflight resets the window, but the cleanup between it and the
  // deletion is many round-trips. Presenting the same credential again costs
  // the user nothing; asking them to prove themselves twice would.
  it('retries once with the credential it already holds', async () => {
    mockTree[`/users/${BOB}`] = bob();
    mockCurrentUser.delete
      .mockRejectedValueOnce(Object.assign(new Error('recent login required'), {
        code: 'auth/requires-recent-login',
      }))
      .mockResolvedValueOnce(undefined);

    expect(await AuthenticationModule.deleteUserAccount(PASSWORD)).toBe(true);
    expect(mockCurrentUser.delete).toHaveBeenCalledTimes(2);
    expect(pathsWritten().filter(p => p === 'reauth ')).toHaveLength(2);
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  // The state this whole change exists to prevent: authenticated, with no
  // profile to load. The app has no screen for it — it sits on "Loading…"
  // forever, and the deletion cannot be retried because step 1 reads the
  // profile that is already gone. Signing out is the only way back.
  it('signs out rather than leaving an account with no profile behind', async () => {
    mockTree[`/users/${BOB}`] = bob();
    mockCurrentUser.delete.mockRejectedValue(Object.assign(new Error('recent login required'), {
      code: 'auth/requires-recent-login',
    }));

    await expect(AuthenticationModule.deleteUserAccount(PASSWORD)).rejects.toThrow(
      /Your data was deleted/,
    );
    expect(authMock.signOut).toHaveBeenCalled();
  });
});

describe('getReauthMethod', () => {
  it('reports the password provider', () => {
    expect(AuthenticationModule.getReauthMethod()).toBe('password');
  });

  it('reports google', () => {
    mockCurrentUser.providerData = [{ providerId: 'google.com', email: 'bob@example.com' }];
    expect(AuthenticationModule.getReauthMethod()).toBe('google');
  });

  // Prompting for a password an account linked to Google may not even have set
  // would be a dead end; the Google flow needs nothing collected in advance.
  it('prefers google when both are linked', () => {
    mockCurrentUser.providerData = [
      { providerId: 'password', email: 'bob@example.com' },
      { providerId: 'google.com', email: 'bob@example.com' },
    ];
    expect(AuthenticationModule.getReauthMethod()).toBe('google');
  });
});

/**
 * Fable review of PR #71 (pre-existing bug): validateFamilyGroupExists said
 * "gone" on ANY read error, so an offline app start made Home tell the user
 * their family no longer exists and detach them from it (the write landed
 * once back online). Now only a refused read means gone; other errors throw.
 */
const mockGet = jest.fn();
function mockFirebase() {
  return {
    getDatabase: () => ({}),
    ref: (_d: unknown, p: string) => p,
    get: (...a: unknown[]) => mockGet(...a),
    getAuth: () => ({ currentUser: null }),
    onAuthStateChanged: jest.fn(),
  };
}
jest.mock('@react-native-firebase/database', () => mockFirebase());
jest.mock('@react-native-firebase/auth', () => mockFirebase());
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('@env', () => ({ GOOGLE_WEB_CLIENT_ID: 'x' }), { virtual: true });
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: { configure: jest.fn() }, statusCodes: {} }));
jest.mock('../SecureStorage', () => ({ __esModule: true, default: { setItem: jest.fn(), getItem: jest.fn(async () => null), removeItem: jest.fn() } }));
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../NotificationManager', () => ({ __esModule: true, default: {} }));
jest.mock('../FirebaseSyncListener', () => ({ __esModule: true, default: {} }));
jest.mock('../SyncEngine', () => ({ __esModule: true, default: {} }));
jest.mock('../ImageStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import AuthenticationModule from '../AuthenticationModule';

beforeEach(() => mockGet.mockReset());

it('present: exists; absent: gone', async () => {
  mockGet.mockResolvedValueOnce({ exists: () => true });
  expect(await AuthenticationModule.validateFamilyGroupExists('fam')).toBe(true);
  mockGet.mockResolvedValueOnce({ exists: () => false });
  expect(await AuthenticationModule.validateFamilyGroupExists('fam')).toBe(false);
  expect(mockGet).toHaveBeenCalledWith('/familyGroups/fam/createdAt');
});

it('a refused read (no longer a member) counts as gone', async () => {
  mockGet.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'database/permission-denied' }));
  expect(await AuthenticationModule.validateFamilyGroupExists('fam')).toBe(false);
});

it.each([
  ['offline', 'database/unavailable'],
  ['a network error', 'database/network-error'],
  ['no code', undefined],
])('%s is not an answer: it throws instead of saying gone', async (_l, code) => {
  mockGet.mockRejectedValueOnce(Object.assign(new Error('x'), code ? { code } : {}));
  await expect(AuthenticationModule.validateFamilyGroupExists('fam')).rejects.toThrow('x');
});

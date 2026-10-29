/**
 * Review #3 (task 100): a sign-out that can't revoke the push token (offline)
 * must not let the next account on the phone reuse it. The device_tokens row
 * is keyed by (user_id, fcm_token), so a reused token stays registered to the
 * old family too, and the new account gets that family's pushes.
 */
const mockDeleteToken = jest.fn();
const mockGetToken = jest.fn();
const mockInvoke = jest.fn(async () => ({ error: null }));
const mockStore = new Map<string, string>();

// Every @react-native-firebase/* specifier maps onto one stub file in
// jest.config.js, so one factory carries both the messaging and auth exports.
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  requestPermission: jest.fn(async () => 1),
  getToken: (...a: unknown[]) => mockGetToken(...a),
  deleteToken: (...a: unknown[]) => mockDeleteToken(...a),
  onMessage: jest.fn(() => jest.fn()),
  onTokenRefresh: jest.fn(() => jest.fn()),
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getAuth: jest.fn(() => ({ currentUser: { uid: 'bob' } })),
  getIdToken: jest.fn(async () => 'id-token'),
}));
jest.mock('../SecureStorage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));
jest.mock('../SupabaseClient', () => ({ __esModule: true, default: { functions: { invoke: (...a: unknown[]) => mockInvoke(...(a as [])) } } }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn() } }));

import NotificationManager from '../NotificationManager';

const registeredTokens = () => mockInvoke.mock.calls.map((c: any[]) => c[1].body.fcm_token);

beforeEach(async () => {
  jest.clearAllMocks();
  mockStore.clear();
  mockDeleteToken.mockResolvedValue(undefined);
  // Start each test signed out with nothing cached.
  await NotificationManager.clearToken();
  mockStore.clear();
  jest.clearAllMocks();
});

describe('NotificationManager push token on sign-out (review #3)', () => {
  it('offline sign-out: the next account does not get the old token', async () => {
    mockGetToken.mockResolvedValueOnce('tok-alice');
    await NotificationManager.registerToken('alice', 'famA');
    expect(registeredTokens()).toEqual(['tok-alice']);

    mockDeleteToken.mockRejectedValueOnce(new Error('offline'));
    await NotificationManager.clearToken();

    // Back online: revoking now works, FCM hands out a fresh token.
    mockGetToken.mockResolvedValueOnce('tok-bob');
    await NotificationManager.registerToken('bob', 'famB');
    expect(mockDeleteToken).toHaveBeenCalledTimes(2);
    expect(registeredTokens()).toEqual(['tok-alice', 'tok-bob']);
  });

  it('still offline at the next sign-in: registers nothing rather than the old token', async () => {
    mockGetToken.mockResolvedValue('tok-alice');
    await NotificationManager.registerToken('alice', 'famA');
    mockDeleteToken.mockRejectedValue(new Error('offline'));
    await NotificationManager.clearToken();
    await NotificationManager.registerToken('bob', 'famB');
    expect(registeredTokens()).toEqual(['tok-alice']);
  });

  it('clearToken never throws, even when storage fails too', async () => {
    mockDeleteToken.mockRejectedValue(new Error('offline'));
    const SecureStorage = jest.requireMock('../SecureStorage').default;
    SecureStorage.removeItem.mockRejectedValueOnce(new Error('keystore'));
    SecureStorage.setItem.mockRejectedValueOnce(new Error('keystore'));
    await expect(NotificationManager.clearToken()).resolves.toBeUndefined();
  });

  it('online sign-out: no stale mark, the next sign-in does not revoke again', async () => {
    mockGetToken.mockResolvedValueOnce('tok-alice');
    await NotificationManager.registerToken('alice', 'famA');
    await NotificationManager.clearToken();
    mockGetToken.mockResolvedValueOnce('tok-bob');
    await NotificationManager.registerToken('bob', 'famB');
    expect(mockDeleteToken).toHaveBeenCalledTimes(1);
    expect(registeredTokens()).toEqual(['tok-alice', 'tok-bob']);
  });
});

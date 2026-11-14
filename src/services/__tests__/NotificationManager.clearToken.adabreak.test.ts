/**
 * ada break test for review #3 (task 100): clearToken now runs inside every
 * signOut, so it must always finish. deleteToken has no timeout here.
 */
const mockDeleteToken = jest.fn();
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  requestPermission: jest.fn(async () => 1),
  getToken: jest.fn(),
  deleteToken: (...a: unknown[]) => mockDeleteToken(...a),
  onMessage: jest.fn(() => jest.fn()),
  onTokenRefresh: jest.fn(() => jest.fn()),
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getAuth: jest.fn(() => ({ currentUser: { uid: 'bob' } })),
  getIdToken: jest.fn(async () => 'id-token'),
}));
jest.mock('../SecureStorage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));
jest.mock('../SupabaseClient', () => ({ __esModule: true, default: { functions: { invoke: jest.fn() } } }));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn() } }));

import NotificationManager from '../NotificationManager';

describe('adabreak #3 NotificationManager.clearToken', () => {
  it('finishes even when deleteToken never answers (offline, FCM stuck)', async () => {
    mockDeleteToken.mockReturnValue(new Promise(() => {}));
    const result = await Promise.race([
      NotificationManager.clearToken().then(() => 'settled'),
      new Promise(r => setTimeout(() => r('hung'), 2000)),
    ]);
    expect(result).toBe('settled');
  }, 10000);
});

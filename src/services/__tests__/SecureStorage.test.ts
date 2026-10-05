// SecureStorage: keychain-backed storage with a one-time move out of
// react-native-encrypted-storage. Each test loads a fresh module, so the
// per-process migration memo starts empty, as on a new launch.

const mockLegacy: Record<string, string> = {};
const mockLegacyGet = jest.fn(async (k: string): Promise<string | null> => mockLegacy[k] ?? null);
const mockLegacyRemove = jest.fn(async (k: string) => { delete mockLegacy[k]; });

jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockLegacyGet(k),
    setItem: jest.fn(),
    removeItem: (k: string) => mockLegacyRemove(k),
  },
}));

const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({
  __esModule: true,
  default: { recordError: (...args: unknown[]) => mockRecordError(...args) },
}));

type Store = typeof import('../SecureStorage').default;
let keychain = require('react-native-keychain');

const load = (): Store => {
  let store!: Store;
  jest.isolateModules(() => {
    store = require('../SecureStorage').default;
    keychain = require('react-native-keychain');
  });
  return store;
};

const stored = (key: string): string | undefined =>
  keychain.__entries.get(`fsl.${key}`)?.password;

beforeEach(() => {
  mockLegacyGet.mockImplementation(async (k: string) => mockLegacy[k] ?? null);
  keychain.__entries.clear();
  Object.keys(mockLegacy).forEach(k => delete mockLegacy[k]);
  jest.clearAllMocks();
});

describe('SecureStorage', () => {
  it('moves a legacy value into the keychain and deletes the old copy', async () => {
    mockLegacy['@user'] = '{"uid":"u1"}';
    const store = load();

    expect(await store.getItem('@user')).toBe('{"uid":"u1"}');
    expect(stored('@user')).toBe('{"uid":"u1"}');
    expect(mockLegacy['@user']).toBeUndefined();
  });

  it('reads the old store once per launch, then never again', async () => {
    mockLegacy['@auth_token'] = 't1';
    const store = load();

    await store.getItem('@auth_token');
    await store.getItem('@auth_token');
    await store.setItem('@auth_token', 't2');

    expect(mockLegacyGet).toHaveBeenCalledTimes(1);
    expect(await store.getItem('@auth_token')).toBe('t2');
  });

  it('is a no-op on the next launch once migrated', async () => {
    mockLegacy['@fcm_token'] = 'f1';
    await load().getItem('@fcm_token');
    mockLegacyGet.mockClear();

    expect(await load().getItem('@fcm_token')).toBe('f1');
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it('a failing old read writes nothing, logs once, and retries only on the next launch', async () => {
    mockLegacyGet.mockRejectedValue(new Error('Keystore key gone'));
    const store = load();

    expect(await store.getItem('@upload_queue')).toBeNull();
    expect(await store.getItem('@upload_queue')).toBeNull();
    expect(stored('@upload_queue')).toBeUndefined();
    expect(mockLegacyGet).toHaveBeenCalledTimes(1);
    expect(mockRecordError).toHaveBeenCalledTimes(1);

    mockLegacyGet.mockImplementation(async (k: string) => mockLegacy[k] ?? null);
    mockLegacy['@upload_queue'] = '[{"id":"a"}]';
    expect(await load().getItem('@upload_queue')).toBe('[{"id":"a"}]');
  });

  it('keeps the new value when an old copy lingers, and removeItem clears both', async () => {
    keychain.__entries.set('fsl.@user', { username: 'value', password: 'new', service: 'fsl.@user' });
    mockLegacy['@user'] = 'old';
    const store = load();

    expect(await store.getItem('@user')).toBe('new');
    expect(mockLegacyGet).not.toHaveBeenCalled();

    await store.removeItem('@user');
    expect(stored('@user')).toBeUndefined();
    expect(mockLegacy['@user']).toBeUndefined();
  });

  // The old read is slowed so the migration is still in flight when the
  // second call arrives.
  const slowLegacyRead = () =>
    mockLegacyGet.mockImplementation((k: string) => {
      const value = mockLegacy[k] ?? null;
      return new Promise(resolve => setTimeout(() => resolve(value), 10));
    });
  const legacyReadStarted = () => new Promise(resolve => setTimeout(resolve, 1));

  it('a write racing the first read is not overwritten by the legacy value', async () => {
    mockLegacy['@upload_queue'] = '[]';
    slowLegacyRead();
    const store = load();

    const read = store.getItem('@upload_queue');
    await legacyReadStarted();
    await store.setItem('@upload_queue', '[{"id":"new"}]');
    await read;

    expect(stored('@upload_queue')).toBe('[{"id":"new"}]');
    expect(await store.getItem('@upload_queue')).toBe('[{"id":"new"}]');
  });

  it('a remove during the migration leaves both stores empty', async () => {
    mockLegacy['@auth_token'] = 't1';
    slowLegacyRead();
    const store = load();

    const read = store.getItem('@auth_token');
    await legacyReadStarted();
    await store.removeItem('@auth_token');
    await read;

    expect(stored('@auth_token')).toBeUndefined();
    expect(mockLegacy['@auth_token']).toBeUndefined();
    expect(await store.getItem('@auth_token')).toBeNull();
  });

  it.each(['', null, undefined])('setItem(%p) removes the entry and never stores "null"', async value => {
    const store = load();
    await store.setItem('@fcm_token_data', 'x');

    await store.setItem('@fcm_token_data', value);

    expect(stored('@fcm_token_data')).toBeUndefined();
    expect(await store.getItem('@fcm_token_data')).toBeNull();
  });

  it('pins every entry to its own fsl. service with no-auth AES-GCM storage', async () => {
    const store = load();
    await store.setItem('@user', 'a');
    await store.setItem('@auth_token', 'b');

    expect(stored('@user')).toBe('a');
    expect(stored('@auth_token')).toBe('b');
    for (const [, , options] of keychain.setGenericPassword.mock.calls) {
      expect(options).toEqual({ service: expect.stringMatching(/^fsl\./), storage: 'KeystoreAESGCM_NoAuth' });
    }
  });
});

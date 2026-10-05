// In-memory stand-in for react-native-keychain (native, can't run in Node.js).
// One entry per options.service, like the real generic-password store. The
// map is shared across jest.isolateModules loads, as the device store
// outlives an app launch.
globalThis.__keychainEntries = globalThis.__keychainEntries || new Map();
const entries = globalThis.__keychainEntries;

module.exports = {
  STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
  setGenericPassword: jest.fn(async (username, password, options = {}) => {
    if (!username || !password) {
      throw new Error('E_EMPTY_PARAMETERS');
    }
    entries.set(options.service, { username, password, service: options.service });
    return { service: options.service, storage: options.storage };
  }),
  getGenericPassword: jest.fn(async (options = {}) => entries.get(options.service) ?? false),
  resetGenericPassword: jest.fn(async (options = {}) => {
    entries.delete(options.service);
    return true;
  }),
  __entries: entries,
};

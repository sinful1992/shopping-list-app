// Stub for all @react-native-firebase/* packages.
// Returns a function that when called returns an object with no-op methods,
// matching the crashlytics() / database() / auth() call pattern Firebase uses.
const stub = () => ({
  setCrashlyticsCollectionEnabled: jest.fn().mockResolvedValue(undefined),
  recordError: jest.fn(),
  log: jest.fn(),
  crash: jest.fn(),
  setUserId: jest.fn().mockResolvedValue(undefined),
  setAttributes: jest.fn().mockResolvedValue(undefined),
  ref: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
});

module.exports = stub;
module.exports.default = stub;

// Modular-API named exports (Firebase v24). The callable default above covers
// the legacy auth()/database() pattern; these cover `import { getAuth } from
// '@react-native-firebase/auth'`, which resolves to undefined without them.
module.exports.getAuth = jest.fn(() => ({
  currentUser: { uid: 'test-uid', email: 'test@example.com' },
}));
module.exports.getIdToken = jest.fn().mockResolvedValue('test-id-token');
module.exports.getIdTokenResult = jest.fn().mockResolvedValue({
  token: 'test-id-token',
  claims: {},
});
module.exports.getDatabase = stub;

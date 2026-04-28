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

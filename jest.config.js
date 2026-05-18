module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/__tests__/setup.js'],
  moduleNameMapper: {
    // Redirect native SQLite adapter to in-memory LokiJS for Node.js tests
    '^@nozbe/watermelondb/adapters/sqlite$': '<rootDir>/__tests__/__mocks__/sqliteAdapter.js',
    // Stub Firebase modules (native, can't run in Node.js)
    '^@react-native-firebase/(.*)$': '<rootDir>/__tests__/__mocks__/firebase.js',
    // Stub other native modules that may be transitively imported
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__mocks__/asyncStorage.js',
  },
  // uuid v14 ships ESM-only; allow Babel to transform it
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|uuid)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/__tests__/__mocks__/', '/__tests__/setup\\.js'],
  modulePathIgnorePatterns: ['/.claude/'],
  watchPathIgnorePatterns: ['/.claude/'],
};

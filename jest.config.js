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
    '^react-native-keychain$': '<rootDir>/__tests__/__mocks__/keychain.js',
  },
  // uuid v14 ships ESM-only; allow Babel to transform it
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|uuid)/)',
  ],
  // Count every source file, not only the ones some test happens to import:
  // without this, the 80 files no test loads (screens, App.tsx) were left out
  // and the figure read ~66 % while the honest one is ~43 % (Fable audit, task 137).
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'App.tsx',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
  // Ratchet, don't aspire: set to the actual number when introduced
  // (lines 43.63 % of all source on 2026-11-11) — raise as coverage grows,
  // never lower.
  coverageThreshold: {
    global: {
      lines: 43,
    },
  },
  // Instrumenting every file makes the first render of a screen test slow on
  // a loaded machine (measured 5-30 s on the laptop); the default 5 s timed out.
  testTimeout: 30000,
  // __tests__/rules needs a live Firebase emulator and the web SDK, neither of
  // which this config provides — those run under jest.rules.config.js instead.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/__tests__/__mocks__/', '/__tests__/rules/', '/__tests__/setup\\.js'],
  modulePathIgnorePatterns: ['/.claude/'],
  watchPathIgnorePatterns: ['/.claude/'],
};

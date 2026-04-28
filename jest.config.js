module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/__tests__/setup.js'],
  moduleNameMapper: {
    // Redirect native SQLite adapter to in-memory LokiJS for Node.js tests
    '^@nozbe/watermelondb/adapters/sqlite$': '<rootDir>/__tests__/__mocks__/sqliteAdapter.js',
    // Stub Firebase modules (native, can't run in Node.js)
    '^@react-native-firebase/(.*)$': '<rootDir>/__tests__/__mocks__/firebase.js',
    // Stub other native modules that may be transitively imported
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__mocks__/asyncStorage.js',
    // Force uuid to its CJS build — the react-native preset resolves the browser
    // field which picks up the ESM version and breaks Jest's CommonJS transform.
    '^uuid$': '<rootDir>/node_modules/uuid/dist/index.js',
  },
};

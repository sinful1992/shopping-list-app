// RTDB security-rules tests. Deliberately separate from jest.config.js:
//   - those tests use the React Native preset and stub @react-native-firebase/*,
//     while these need the *web* SDK talking to a real emulator under Node;
//   - the coverage ratchet in jest.config.js must not see these files, which
//     exercise database.rules.json rather than any module under src/.
// Run via `npm run test:rules`, which wraps this in `firebase emulators:exec`.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/rules/**/*.test.js'],
  // The root babel.config.js is the React Native preset (react-compiler,
  // worklets, dotenv). None of it applies here, so compile for Node only.
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      {
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/'],
  testTimeout: 20000,
};

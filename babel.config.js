module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // React Compiler — must run first so it sees source before other transforms.
    // 'all' compilation mode; auto-bails on any component it can't prove safe.
    // React 19 ships the runtime, so no react-compiler-runtime polyfill is needed.
    // Keep 'react-native-worklets/plugin' LAST (reanimated requirement).
    ['babel-plugin-react-compiler', { target: '19' }],
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        blacklist: null,
        whitelist: null,
        safe: false,
        allowUndefined: true,
      },
    ],
    '@babel/plugin-proposal-export-namespace-from',
    'react-native-worklets/plugin',
  ],
};

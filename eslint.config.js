'use strict';

const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  ...reactNativeConfig,
  {
    rules: {
      'prettier/prettier': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-undef': 'off',
    },
  },
];

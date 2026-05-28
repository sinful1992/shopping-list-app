'use strict';

const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  ...reactNativeConfig,
  {
    rules: {
      'prettier/prettier': 'off',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
];

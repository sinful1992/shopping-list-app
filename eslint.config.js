'use strict';

const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = [
  // Don't lint build output or the Claude worktree copies (the latter crashed
  // eslint by feeding it a duplicate tree).
  {
    ignores: ['.claude/**', 'android/**', 'ios/**', 'coverage/**', 'vendor/**'],
  },
  ...reactNativeConfig,
  {
    rules: {
      'prettier/prettier': 'off',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
      // Intentional partial-dep effects (marked with disable comments) exist;
      // auto-"fixing" dep arrays would change effect timing/behavior. Keep it
      // visible as a warning rather than gating CI on a risky refactor.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Deno edge functions: URL-path regex literals like /\/=?.../ trip
    // no-div-regex — a stylistic rule that misfires on this code.
    files: ['supabase/functions/**'],
    rules: {
      'no-div-regex': 'off',
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

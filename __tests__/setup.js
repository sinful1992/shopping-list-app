// Global test setup — runs before the test framework is installed.
// Keep this to environment globals only; jest.mock() calls belong in test files.

global.__DEV__ = true;

/**
 * OPTIMISE P2 (Fable audit task 137): Home opened its own second auth/profile
 * subscription (useAuth) next to App's, and re-ran its start-up check on every
 * change of the user object, which is new on every profile write (creating a
 * list bumps a usage counter). Now Home reads App's user (useUser) and the
 * check runs once per account and family.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../../services/AuthenticationModule', () => ({
  __esModule: true,
  default: {
    validateFamilyGroupExists: jest.fn(async () => true),
    clearFamilyGroupReference: jest.fn(async () => {}),
  },
}));
jest.mock('../../../services/DatabaseMigration', () => ({
  __esModule: true,
  default: { needsMigration: jest.fn(async () => false), runAllMigrations: jest.fn(async () => {}) },
}));

import AuthenticationModule from '../../../services/AuthenticationModule';
import DatabaseMigration from '../../../services/DatabaseMigration';

// On the old code this module does not exist; the require makes those tests fail there.
const hookPath = join(__dirname, '..', 'hooks', 'useFamilyGroupCheck.ts');
const { useFamilyGroupCheck } = (() => {
  try { return require('../hooks/useFamilyGroupCheck'); } catch { return { useFamilyGroupCheck: undefined }; }
})();

const validate = AuthenticationModule.validateFamilyGroupExists as jest.Mock;
const clearRef = AuthenticationModule.clearFamilyGroupReference as jest.Mock;
const needsMigration = DatabaseMigration.needsMigration as jest.Mock;
const runAll = DatabaseMigration.runAllMigrations as jest.Mock;
const showAlert = jest.fn();

function Probe({ user }: { user: { uid: string; familyGroupId: string | null; counter?: number } | null }) {
  useFamilyGroupCheck(user?.uid ?? null, user?.familyGroupId ?? null, showAlert);
  return null;
}

let tree: ReactTestRenderer;
const render = async (user: any) => {
  await act(async () => {
    if (tree) tree.update(<Probe user={user} />);
    else tree = create(<Probe user={user} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  validate.mockResolvedValue(true);
  needsMigration.mockResolvedValue(false);
  tree = undefined as unknown as ReactTestRenderer;
});

it('the hook exists', () => {
  expect(typeof useFamilyGroupCheck).toBe('function');
  expect(readFileSync(hookPath, 'utf8')).toContain('[uid, familyGroupId]');
});

it('a new user object for the same account and family (a counter tick) does not re-run the check', async () => {
  await render({ uid: 'u1', familyGroupId: 'fam-1', counter: 1 });
  await render({ uid: 'u1', familyGroupId: 'fam-1', counter: 2 });
  await render({ uid: 'u1', familyGroupId: 'fam-1', counter: 3 });
  expect(validate).toHaveBeenCalledTimes(1);
});

it('another family or another account runs it again', async () => {
  await render({ uid: 'u1', familyGroupId: 'fam-1' });
  await render({ uid: 'u1', familyGroupId: 'fam-2' });
  await render({ uid: 'u2', familyGroupId: 'fam-2' });
  expect(validate.mock.calls.map(c => c[0])).toEqual(['fam-1', 'fam-2', 'fam-2']);
});

it('no user or no family: nothing runs', async () => {
  await render(null);
  await render({ uid: 'u1', familyGroupId: null });
  expect(validate).not.toHaveBeenCalled();
});

it('the family is gone: the user is told and the reference is cleared', async () => {
  validate.mockResolvedValue(false);
  await render({ uid: 'u1', familyGroupId: 'fam-1' });
  expect(showAlert).toHaveBeenCalledWith('Family Group Not Found', expect.any(String), [{ text: 'OK' }], { icon: 'warning' });
  expect(clearRef).toHaveBeenCalledWith('u1', 'fam-1');
  expect(needsMigration).not.toHaveBeenCalled();
});

it('a migration that fails shows the notice; one that is not needed does not run', async () => {
  await render({ uid: 'u1', familyGroupId: 'fam-1' });
  expect(runAll).not.toHaveBeenCalled();
  needsMigration.mockResolvedValue(true);
  runAll.mockRejectedValue(new Error('x'));
  await render({ uid: 'u1', familyGroupId: 'fam-2' });
  expect(runAll).toHaveBeenCalledWith('fam-2');
  expect(showAlert).toHaveBeenCalledWith('Migration Notice', expect.any(String), undefined, { icon: 'info' });
});

it('the check failing shows an error', async () => {
  validate.mockRejectedValue(new Error('network'));
  await render({ uid: 'u1', familyGroupId: 'fam-1' });
  expect(showAlert).toHaveBeenCalledWith('Error', expect.any(String), undefined, { icon: 'error' });
});

it('a check still running when the family changes does not alert for the old one', async () => {
  let release!: (v: boolean) => void;
  validate.mockImplementationOnce(() => new Promise<boolean>(r => { release = r; }));
  await render({ uid: 'u1', familyGroupId: 'fam-1' });
  await render({ uid: 'u1', familyGroupId: 'fam-2' });
  await act(async () => { release(false); });
  expect(showAlert).not.toHaveBeenCalledWith('Family Group Not Found', expect.anything(), expect.anything(), expect.anything());
  expect(clearRef).not.toHaveBeenCalled();
});

it('HomeScreen reads App\'s user and opens no auth subscription of its own', () => {
  const src = readFileSync(join(__dirname, '..', 'HomeScreen.tsx'), 'utf8');
  expect(src).not.toMatch(/useAuth\(/);
  expect(src).toMatch(/useUser\(\)/);
  expect(src).not.toMatch(/AuthenticationModule\.onAuthStateChanged/);
});

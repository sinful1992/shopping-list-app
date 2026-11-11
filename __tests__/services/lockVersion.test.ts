// SH-6 (audit 137, task 142): package-lock.json says the same version as package.json, and the sync
// script the pre-commit hook runs keeps it so.
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const { syncLockVersion } = require('../../scripts/sync-lock-version.js');

test('package-lock.json version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  expect({ top: lock.version, root: lock.packages[''].version }).toEqual({ top: pkg.version, root: pkg.version });
});

describe('sync-lock-version', () => {
  function dir(pkgVersion: string, lock: object, newline = true) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-'));
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'x', version: pkgVersion }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), JSON.stringify(lock, null, 2) + (newline ? '\n' : ''));
    return d;
  }
  const read = (d: string) => fs.readFileSync(path.join(d, 'package-lock.json'), 'utf8');

  test('sets both version fields and keeps everything else', () => {
    const lock = { name: 'x', version: '1.0.0', lockfileVersion: 3, requires: true,
      packages: { '': { name: 'x', version: '1.0.0', dependencies: { a: '^1' } }, 'node_modules/a': { version: '1.2.3' } } };
    const d = dir('1.53.26', lock);
    expect(syncLockVersion(d)).toEqual({ from: '1.0.0', to: '1.53.26' });
    const after = JSON.parse(read(d));
    expect(after.version).toBe('1.53.26');
    expect(after.packages[''].version).toBe('1.53.26');
    expect(after.packages['node_modules/a'].version).toBe('1.2.3');
    expect(after.packages[''].dependencies).toEqual({ a: '^1' });
    expect(read(d).endsWith('}\n')).toBe(true);
  });

  test('a lock already in step is not rewritten', () => {
    const d = dir('2.0.0', { version: '2.0.0', packages: { '': { version: '2.0.0' } } });
    const before = fs.statSync(path.join(d, 'package-lock.json')).mtimeMs;
    expect(syncLockVersion(d)).toBeNull();
    expect(fs.statSync(path.join(d, 'package-lock.json')).mtimeMs).toBe(before);
  });

  test('only packages[""] behind is fixed too; a lock with no packages map works; no newline stays none', () => {
    const d1 = dir('3.0.0', { version: '3.0.0', packages: { '': { version: '2.9.0' } } });
    expect(syncLockVersion(d1)).toEqual({ from: '3.0.0', to: '3.0.0' });
    expect(JSON.parse(read(d1)).packages[''].version).toBe('3.0.0');
    const d2 = dir('3.0.1', { version: '3.0.0' }, false);
    expect(syncLockVersion(d2)).toEqual({ from: '3.0.0', to: '3.0.1' });
    expect(read(d2).endsWith('\n')).toBe(false);
  });

  test('a broken lock file throws instead of being overwritten', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-'));
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), '{"version": "0.9');
    expect(() => syncLockVersion(d)).toThrow();
    expect(read(d)).toBe('{"version": "0.9');
  });
});

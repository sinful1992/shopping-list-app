// SH-6 (audit 137, task 142): package-lock.json says the same version as package.json, and the sync
// script the pre-commit hook runs keeps it so.
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const { syncLockVersion } = require('../../scripts/sync-lock-version.js');

// Under the pre-commit hook git exports GIT_INDEX_FILE (and may export GIT_DIR). Inherited by the git
// calls in these tests and in the script, they would read or write the real repo's index instead of
// the temp dirs (it replaced package.json in the index once). Every git call passes this cleaned env.
const savedGitEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) { savedGitEnv[k] = process.env[k]; delete process.env[k]; }
});
afterAll(() => { Object.assign(process.env, savedGitEnv); });

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

  test('no lock file: one clear error, no stack (ada #10371)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-'));
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(() => syncLockVersion(d)).toThrow(/no package-lock\.json in /);
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-lock-version.js')], { cwd: d, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe(`sync-lock-version: no package-lock.json in ${d}`);
  });

  test('CRLF line ends stay CRLF (ada #10371)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-'));
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '1.1.0' }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }, null, 2).replace(/\n/g, '\r\n') + '\r\n');
    syncLockVersion(d);
    const out = read(d);
    expect(out.endsWith('}\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(JSON.parse(out).version).toBe('1.1.0');
  });

  test('a broken lock file throws instead of being overwritten', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-'));
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), '{"version": "0.9');
    expect(() => syncLockVersion(d)).toThrow();
    expect(read(d)).toBe('{"version": "0.9');
  });
});

// Codex review of PR #64: the hook commits the STAGED package.json, so the lock follows that version.
describe('sync-lock-version follows the staged package.json', () => {
  const { execFileSync } = require('child_process');
  function repo(staged: string, working: string | null) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-git-'));
    // env: process.env passes this sandbox's cleaned env (a bare call would use the real one)
    const git = (...a: string[]) => execFileSync('git', a, { cwd: d, stdio: 'ignore', env: process.env });
    git('init', '-q');
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'x', version: staged }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }, null, 2) + '\n');
    git('add', 'package.json');
    if (working) fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'x', version: working }));
    return d;
  }

  test('a later unstaged edit of package.json does not reach the lock', () => {
    const d = repo('1.0.1', '1.0.2');
    expect(syncLockVersion(d)).toEqual({ from: '1.0.0', to: '1.0.1' });
    expect(JSON.parse(fs.readFileSync(path.join(d, 'package-lock.json'), 'utf8')).packages[''].version).toBe('1.0.1');
  });

  test('staged and working copy the same: that version', () => {
    expect(syncLockVersion(repo('1.2.0', null))).toEqual({ from: '1.0.0', to: '1.2.0' });
  });

  test('a git repo where package.json is not staged at all falls back to the working copy', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lockver-git-'));
    execFileSync('git', ['init', '-q'], { cwd: d, stdio: 'ignore', env: process.env });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: '4.0.0' }));
    fs.writeFileSync(path.join(d, 'package-lock.json'), JSON.stringify({ version: '1.0.0' }) + '\n');
    expect(syncLockVersion(d)).toEqual({ from: '1.0.0', to: '4.0.0' });
  });
});

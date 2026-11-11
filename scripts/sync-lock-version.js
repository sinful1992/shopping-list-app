#!/usr/bin/env node
// SH-6 (audit 137, task 142): package-lock.json carries the app version twice (top-level "version" and
// packages[""].version). The version bump never touched it, so it said 1.48.13 while package.json said
// 1.53.x. The pre-commit hook runs this on every version bump; `node scripts/sync-lock-version.js` by hand
// does the same. Prints "synced <old> -> <new>" when it changed the file, nothing otherwise.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Codex review of PR #64: the hook commits the staged package.json, so the lock must follow the
// staged version, not a later unstaged edit of the working copy. Outside git (or with package.json
// not in the index yet) the working copy is all there is.
function packageVersion(dir) {
  try {
    const staged = execFileSync('git', ['show', ':package.json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: process.env });
    return JSON.parse(staged).version;
  } catch {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  }
}

function syncLockVersion(dir) {
  const pkg = { version: packageVersion(dir) };
  const lockFile = path.join(dir, 'package-lock.json');
  if (!fs.existsSync(lockFile)) throw new Error(`no package-lock.json in ${dir}`);
  const text = fs.readFileSync(lockFile, 'utf8');
  const lock = JSON.parse(text);
  const old = lock.version;
  const root = lock.packages && lock.packages[''];
  if (lock.version === pkg.version && (!root || root.version === pkg.version)) return null;
  lock.version = pkg.version;
  if (root) root.version = pkg.version;
  // npm writes 2-space JSON with a trailing newline; keep the file byte-for-byte otherwise,
  // CRLF line ends included (a Windows clone without autocrlf, ada #10371)
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify(lock, null, 2).replace(/\n/g, eol);
  fs.writeFileSync(lockFile, body + (text.endsWith('\n') ? eol : ''));
  return { from: old, to: pkg.version };
}

module.exports = { syncLockVersion, packageVersion };

if (require.main === module) {
  try {
    const r = syncLockVersion(process.cwd());
    if (r) console.log(`synced package-lock.json ${r.from} -> ${r.to}`);
  } catch (e) {
    console.error(`sync-lock-version: ${e.message}`);
    process.exit(1);
  }
}

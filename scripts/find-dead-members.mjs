#!/usr/bin/env node
/**
 * Lists class methods and StyleSheet keys under src/ that nothing uses.
 *
 * knip covers files, exports and dependencies, but not members: the services
 * here are singleton classes, so an unused method on an exported class is
 * invisible to it, and so is an unused key in a StyleSheet.create() object.
 * Task 54 found ~44 such methods and ~28 style keys while knip reported clean.
 *
 * How it decides: every identifier, string literal and property name in the
 * production sources (src/ without __tests__, App.tsx, index.js) is counted.
 * A member is a candidate when its name occurs only at its own declaration.
 * Name-based on purpose: two members that share a name keep each other alive,
 * so the check can miss dead code but does not report live code as dead
 * (dynamic `this[name]` with a computed string is the one exception).
 * A use in a test does not count; such lines end with "(tests only)".
 *
 * Skip a member that must stay: a test seam gets an `@internal test seam` JSDoc tag
 * (knip.json ignores the same tag), anything else (framework hook, debug
 * helper) a `// dead-members-ignore` comment on the line above it.
 *
 * Usage: node scripts/find-dead-members.mjs [rootDir]
 * Output: one `path:line kind name` line per candidate. Exit 1 if any, else 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(process.argv[2] || '.');
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Called by React or WatermelonDB, never by our own code.
const FRAMEWORK_METHODS = new Set([
  'render',
  'componentDidMount',
  'componentDidUpdate',
  'componentWillUnmount',
  'shouldComponentUpdate',
  'getSnapshotBeforeUpdate',
  'componentDidCatch',
  'getDerivedStateFromError',
  'getDerivedStateFromProps',
  'prepareMarkAsDeleted',
  'prepareDestroyPermanently',
  'markAsDeleted',
  'destroyPermanently',
]);
const IGNORE_MARK = 'dead-members-ignore';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const isTest = p => /[\\/]__tests__[\\/]|\.test\.[jt]sx?$/.test(p);
const srcFiles = walk(path.join(root, 'src'));
const prodFiles = [
  ...srcFiles.filter(p => !isTest(p)),
  ...['App.tsx', 'index.js'].map(f => path.join(root, f)).filter(f => fs.existsSync(f)),
];
const testFiles = [...srcFiles.filter(isTest), ...walk(path.join(root, '__tests__'))];

const parsed = new Map();
function parse(file) {
  if (!parsed.has(file)) {
    const kind = /x$/.test(file) ? ts.ScriptKind.TSX : /\.js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    parsed.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind));
  }
  return parsed.get(file);
}

// A token scanner loses its place inside template literals and JSX, so names
// are counted from the parsed tree instead.
function countNames(files, { strings = true } = {}) {
  const counts = new Map();
  const add = name => counts.set(name, (counts.get(name) || 0) + 1);
  for (const file of files) {
    const visit = node => {
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) add(node.text.replace(/^#/, ''));
      else if (ts.isStringLiteralLike(node) &&
        (strings || (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node))) {
        add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return counts;
}

const prodCounts = countNames(prodFiles);

// A style key is only reachable from its own file and the files importing it,
// so it is matched there; a same-named key in another stylesheet must not
// keep it alive. Plain strings don't count here (<Icon name="checkmark"> is
// not a use of styles.checkmark); styles['key'] does.
function importersOf(file) {
  const stem = file.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/[\\/]index$/, '');
  return prodFiles.filter(other => {
    let hit = false;
    const visit = node => {
      if (hit) return;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith('.')) {
        const target = path.resolve(path.dirname(other), node.moduleSpecifier.text);
        hit = target === stem || target === file.replace(/\.(ts|tsx|js|jsx)$/, '');
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(other));
    return hit;
  });
}
const styleCounts = new Map();
const styleCountsFor = file => {
  if (!styleCounts.has(file)) styleCounts.set(file, countNames([file, ...importersOf(file)], { strings: false }));
  return styleCounts.get(file);
};
const testCounts = countNames(testFiles);

function memberName(node) {
  const n = node.name;
  if (!n) return undefined;
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) return n.text.replace(/^#/, '');
  if (ts.isStringLiteral(n)) return n.text;
  return undefined;
}

function ignored(sf, node) {
  if (ts.getJSDocTags(node).some(t => t.tagName.text === 'internal')) return true;
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  return ranges.some(r => text.slice(r.pos, r.end).includes(IGNORE_MARK));
}

const isStyleSheetCreate = call =>
  ts.isPropertyAccessExpression(call.expression) &&
  call.expression.name.text === 'create' &&
  ts.isIdentifier(call.expression.expression) &&
  call.expression.expression.text === 'StyleSheet';

const found = [];
for (const file of prodFiles.filter(p => p.startsWith(path.join(root, 'src')))) {
  const sf = parse(file);
  const report = (node, what, counts = prodCounts) => {
    const name = memberName(node);
    if (!name || ignored(sf, node)) return;
    // The declaration itself is one occurrence; anything more is a use.
    if ((counts.get(name) || 0) > 1) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const tests = testCounts.get(name) ? ' (tests only)' : '';
    found.push(`${path.relative(root, file).split(path.sep).join('/')}:${line} ${what} ${name}${tests}`);
  };
  const visit = node => {
    if (ts.isClassLike(node)) {
      for (const m of node.members) {
        const fnProperty =
          ts.isPropertyDeclaration(m) &&
          m.initializer &&
          (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer));
        if ((ts.isMethodDeclaration(m) || fnProperty) && !FRAMEWORK_METHODS.has(memberName(m))) {
          report(m, 'method');
        }
      }
    }
    if (ts.isCallExpression(node) && isStyleSheetCreate(node)) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p)) report(p, 'style', styleCountsFor(file));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

found.sort();
for (const line of found) console.log(line);
process.exit(found.length ? 1 : 0);

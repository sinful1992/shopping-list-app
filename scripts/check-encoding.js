#!/usr/bin/env node
/**
 * Fails if any tracked source file contains U+FFFD (EF BF BD), the Unicode
 * replacement character.
 *
 * U+FFFD means "a decoder hit bytes it could not interpret". It is never
 * intentional in source: it is what you are left with after a file is read as
 * one encoding and written back as another. SmartSavingsCard.tsx carried three
 * of them for months — every price on the card rendered as the replacement
 * character instead of a pound sign — and nothing caught it, because U+FFFD is
 * a perfectly valid string character. TypeScript checks types, knip checks
 * reachability, and ESLint sees a JSXText node it has no opinion about.
 *
 * Note this file must not quote the character it looks for, or it fails itself.
 * That is not a flaw in the check: naming the codepoint is clearer than
 * pasting it, and the same reword was needed in CHANGELOG.md.
 *
 * Deliberately checks this one codepoint and nothing else. Heuristics for
 * other mojibake (`Â£` and friends) have false positives, and a gate people
 * disable is worse than no gate.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

const EXTENSIONS = /\.(ts|tsx|js|jsx|json|md|ya?ml)$/;
const REPLACEMENT = Buffer.from([0xef, 0xbf, 0xbd]);

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .toString('utf8')
    .split('\0')
    .filter(f => f && EXTENSIONS.test(f));
}

function lineOf(buf, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (buf[i] === 0x0a) line++;
  return line;
}

const findings = [];

for (const file of trackedFiles()) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    continue; // deleted or unreadable in this working tree
  }
  let from = 0;
  for (;;) {
    const at = buf.indexOf(REPLACEMENT, from);
    if (at === -1) break;
    findings.push({ file, line: lineOf(buf, at) });
    from = at + REPLACEMENT.length;
  }
}

if (findings.length === 0) {
  console.log('check-encoding: no U+FFFD in tracked source files.');
  process.exit(0);
}

console.error(
  `check-encoding: found ${findings.length} replacement character(s) (U+FFFD).\n` +
    'These are decoding damage, not text. Restore the intended character and ' +
    're-save the file as UTF-8.\n'
);
for (const { file, line } of findings) console.error(`  ${file}:${line}`);
process.exit(1);

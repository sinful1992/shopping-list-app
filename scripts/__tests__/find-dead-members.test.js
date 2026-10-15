/**
 * scripts/find-dead-members.mjs on a tiny fixture tree: it must report an
 * unused method and an unused style key, and stay quiet once both are used,
 * tagged as a test seam, or marked to ignore.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'find-dead-members.mjs');

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-members-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const res = spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  return { code: res.status, lines: res.stdout.split('\n').filter(Boolean), err: res.stderr };
}

const service = extra => `
export class Service {
  used(): number { return 1; }
  ${extra}
}
export default new Service();
`;
const screen = (styleUse, extraStyle = '') => `
import { StyleSheet, Text } from 'react-native';
import service from './Service';
import { shared } from './Screen.styles';
export const Screen = () => <Text style={[styles.title, shared.row${styleUse}]} name="ghost">{service.used()}</Text>;
const styles = StyleSheet.create({
  title: { fontSize: 1 },
  ${extraStyle}
});
`;
const sharedStyles = `
import { StyleSheet } from 'react-native';
export const shared = StyleSheet.create({ row: { flex: 1 }, ghost: { flex: 2 } });
`;

describe('find-dead-members', () => {
  it('reports an unused method and an unused style (own file and imported stylesheet)', () => {
    const r = run({
      'src/Service.ts': service('dead(): number { return 2; }'),
      'src/Screen.tsx': screen('', 'unusedKey: { margin: 0 },'),
      'src/Screen.styles.ts': sharedStyles,
    });
    expect(r.err).toBe('');
    expect(r.code).toBe(1);
    expect(r.lines).toEqual([
      'src/Screen.styles.ts:3 style ghost',
      'src/Screen.tsx:8 style unusedKey',
      'src/Service.ts:4 method dead',
    ]);
  });

  it('marks a member only tests use', () => {
    const r = run({
      'src/Service.ts': service('dead(): number { return 2; }'),
      'src/Screen.tsx': screen('', ''),
      'src/Screen.styles.ts': sharedStyles.replace(', ghost: { flex: 2 }', ''),
      '__tests__/service.test.ts': "import s from '../src/Service'; s.dead();",
    });
    expect(r.lines).toEqual(['src/Service.ts:4 method dead (tests only)']);
  });

  it('exits 0 when everything is used, tagged @internal or marked ignore', () => {
    const r = run({
      'src/Service.ts': service(`/** @internal test seam */
  seam(): void {}
  // dead-members-ignore
  debugOnly(): void {}
  render() { return null; }`),
      'src/Screen.tsx': screen(', shared.ghost', ''),
      'src/Screen.styles.ts': sharedStyles,
    });
    expect(r.lines).toEqual([]);
    expect(r.code).toBe(0);
  });
});

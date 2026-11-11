/**
 * OPTIMISE P6 step 2 (Fable audit task 137): unchanged items and categories
 * keep their objects across emissions, so memo'd rows skip re-rendering.
 */
import { existsSync } from 'fs';
import { join } from 'path';

const mod = existsSync(join(__dirname, '..', 'stableIdentity.ts')) ? require('../stableIdentity') : {};
const { shallowEqual, reuseById, stableGroups } = mod;

describe('shallowEqual', () => {
  it.each([
    [{ a: 1, b: 'x' }, { a: 1, b: 'x' }, true],
    [{ a: 1 }, { a: 2 }, false],
    [{ a: 1 }, { a: 1, b: undefined }, false],
    [{ a: 1, b: undefined }, { a: 1, c: undefined }, false],
    [{ a: null }, { a: undefined }, false],
    [{ o: { x: 1 } }, { o: { x: 1 } }, false],
    [{}, {}, true],
  ])('%j vs %j -> %s', (a, b, want) => {
    expect(shallowEqual(a, b)).toBe(want);
  });
});

describe('reuseById', () => {
  it('keeps unchanged objects, takes changed and new ones, drops gone ids from the cache', () => {
    const cache = new Map();
    const a1 = { id: 'a', checked: false };
    const b1 = { id: 'b', checked: false };
    const c1 = { id: 'c', checked: false };
    reuseById(cache, [a1, b1, c1]);

    const a2 = { id: 'a', checked: false };
    const b2 = { id: 'b', checked: true };
    const d2 = { id: 'd', checked: false };
    const out = reuseById(cache, [a2, b2, d2]);
    expect(out[0]).toBe(a1);
    expect(out[1]).toBe(b2);
    expect(out[2]).toBe(d2);
    expect([...cache.keys()]).toEqual(['a', 'b', 'd']);
  });

  it('a removed then re-added item comes back as the new object', () => {
    const cache = new Map();
    const a1 = { id: 'a', n: 1 };
    reuseById(cache, [a1]);
    reuseById(cache, []);
    const a3 = { id: 'a', n: 1 };
    expect(reuseById(cache, [a3])[0]).toBe(a3);
  });

  it('keeps the order of the new emission', () => {
    const cache = new Map();
    const a = { id: 'a' }; const b = { id: 'b' };
    reuseById(cache, [a, b]);
    const out = reuseById(cache, [{ id: 'b' }, { id: 'a' }]);
    expect(out).toEqual([b, a]);
    expect(out[0]).toBe(b);
  });
});

describe('stableGroups', () => {
  const x = { id: 'x' }; const y = { id: 'y' }; const z = { id: 'z' };

  it('a group with the same elements keeps its old array; a changed one takes the new', () => {
    const prev = { dairy: [x, y], bakery: [z] };
    const next = { dairy: [x, y], bakery: [z, x] };
    const out = stableGroups(prev, next);
    expect(out.dairy).toBe(prev.dairy);
    expect(out.bakery).toBe(next.bakery);
  });

  it('order change, element swap or new group: new array', () => {
    const prev = { dairy: [x, y] };
    expect(stableGroups(prev, { dairy: [y, x] }).dairy).not.toBe(prev.dairy);
    expect(stableGroups(prev, { dairy: [x, { id: 'y' }] }).dairy).not.toBe(prev.dairy);
    const fresh = [z];
    expect(stableGroups(prev, { dairy: prev.dairy, meat: fresh }).meat).toBe(fresh);
  });

  it('a group that emptied out is gone; no previous grouping gives the new one as is', () => {
    expect(Object.keys(stableGroups({ dairy: [x], meat: [y] }, { dairy: [x] }))).toEqual(['dairy']);
    const next = { a: [x] };
    expect(stableGroups(null, next)).toBe(next);
  });
});

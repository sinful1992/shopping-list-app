import { mergeQueued, transactionValue } from '../queuedMerge';

// Left note 138 (task 145): the compare a replayed offline change makes against the server's copy.
describe('mergeQueued', () => {
  const base = { id: 'i1', name: 'Milk', checked: false, quantity: 1, updatedAt: 10 };

  it('nothing newer on the server: our fields apply on top of it', () => {
    const current = { ...base };
    expect(mergeQueued(current, { checked: true, updatedAt: 20 }, base)).toEqual({ ...base, checked: true, updatedAt: 20 });
  });

  it('the server is newer on ANOTHER field: both changes are kept, the newer stamp stays', () => {
    const current = { ...base, name: 'Oat milk', updatedAt: 30 }; // the other phone renamed it
    expect(mergeQueued(current, { checked: true, updatedAt: 20 }, base)).toEqual({ ...base, name: 'Oat milk', checked: true, updatedAt: 30 });
  });

  it('the server is newer on the SAME field: the newer value stays and nothing is written', () => {
    const current = { ...base, checked: false, quantity: 3, updatedAt: 30 };
    expect(mergeQueued(current, { quantity: 2, updatedAt: 20 }, base)).toBeNull();
  });

  it('same field AND another field: only the untouched one is ours', () => {
    const current = { ...base, quantity: 3, updatedAt: 30 };
    expect(mergeQueued(current, { quantity: 2, checked: true, updatedAt: 20 }, base)).toEqual({ ...base, quantity: 3, checked: true, updatedAt: 30 });
  });

  it('the other phone set the field to the value we also chose: ours is the same, kept', () => {
    const current = { ...base, checked: true, updatedAt: 30 };
    expect(mergeQueued(current, { checked: true, updatedAt: 20 }, base)).toBeNull();
  });

  it('a whole write (no base) loses to a newer server copy, and wins over an older one', () => {
    const whole = { ...base, checked: true, updatedAt: 20 };
    expect(mergeQueued({ ...base, updatedAt: 30 }, whole, null)).toBeNull();
    expect(mergeQueued({ ...base, updatedAt: 15 }, whole, null)).toEqual(whole);
    expect(mergeQueued({ ...base, updatedAt: 20 }, whole, null)).toEqual(whole); // a tie is not newer
  });

  it('nothing on the server: a whole write creates it, a field change does not bring back half an object', () => {
    expect(mergeQueued(null, { ...base }, null)).toEqual(base);
    expect(mergeQueued(null, { checked: true, updatedAt: 20 }, base)).toBeNull();
  });

  it('no updatedAt on either side counts as nothing newer', () => {
    const { updatedAt: _, ...noStamp } = base;
    expect(mergeQueued(noStamp, { checked: true }, noStamp)).toEqual({ ...noStamp, checked: true });
    expect(mergeQueued({ ...base, updatedAt: 30 }, { checked: true }, base)).toEqual({ ...base, checked: true, updatedAt: 30 });
  });

  it('a field we set to null is removed, and arrays compare by value', () => {
    const b = { ...base, tags: ['a', 'b'], note: 'x' };
    const current = { ...b, tags: ['a', 'b'], updatedAt: 30 };
    expect(mergeQueued(current, { note: null, updatedAt: 20 }, b)).toEqual({ ...base, tags: ['a', 'b'], updatedAt: 30 });
  });

  it('only updatedAt in the patch writes nothing', () => {
    expect(mergeQueued({ ...base, updatedAt: 30 }, { updatedAt: 20 }, base)).toBeNull();
  });
});

describe('transactionValue', () => {
  it('never returns null over a real value (that would delete it)', () => {
    expect(transactionValue({ id: 'i1' }, null)).toBeUndefined();
    expect(transactionValue(null, null)).toBeNull();
    expect(transactionValue({ id: 'i1' }, { id: 'i1', a: 1 })).toEqual({ id: 'i1', a: 1 });
    expect(transactionValue(null, { id: 'i1' })).toEqual({ id: 'i1' });
  });
});

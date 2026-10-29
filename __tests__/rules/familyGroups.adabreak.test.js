/**
 * ada break tests for review #1 (task 100): joinRequests/$uid writable only by
 * $uid (or a member when the entry already exists); group create lists only
 * the creator. Run with `npm run test:rules`.
 */
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, set, update, remove, get } = require('firebase/database');
const { createTestEnv, asUser, makeUser, makeGroup, makeJoinRequest } = require('./helpers');

const ALICE = 'alice-uid';
const ALICE_EMAIL = 'alice@example.com';
const BOB = 'bob-uid';
const BOB_EMAIL = 'bob@example.com';
const GROUP = '-NgroupKey123';
const EVIL = '-NevilGroupKey';

let testEnv;
beforeAll(async () => { testEnv = await createTestEnv(); });
afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `/familyGroups/${GROUP}`), makeGroup(GROUP, ALICE, { [ALICE]: true }, 'ABCD2345'));
    await set(ref(db, `/users/${ALICE}`), makeUser(ALICE, ALICE_EMAIL, 'Alice', GROUP));
    await set(ref(db, `/users/${BOB}`), makeUser(BOB, BOB_EMAIL, 'Bob', null));
  });
});

describe('adabreak rules #1', () => {
  it('denies planting a request through a flat multi-path create (no group node object)', async () => {
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(update(ref(alice), {
      [`/familyGroups/${EVIL}/memberIds/${ALICE}`]: true,
      [`/familyGroups/${EVIL}/name`]: 'x',
      [`/familyGroups/${EVIL}/joinRequests/${BOB}`]: makeJoinRequest(BOB, EVIL, ALICE_EMAIL, 'Bob'),
    }));
  });

  it('denies a member writing a whole request for a uid with no request (existing group)', async () => {
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(set(ref(alice, `/familyGroups/${GROUP}/joinRequests/${BOB}`),
      makeJoinRequest(BOB, GROUP, ALICE_EMAIL, 'Bob')));
  });

  it('denies a member setting only the status child of a request that does not exist', async () => {
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(set(ref(alice, `/familyGroups/${GROUP}/joinRequests/${BOB}/status`), 'approved'));
  });

  it('still lets a member reject, and the requester cancel', async () => {
    const bob = asUser(testEnv, BOB, BOB_EMAIL);
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(set(ref(bob, `/familyGroups/${GROUP}/joinRequests/${BOB}`),
      makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob')));
    await assertSucceeds(set(ref(alice, `/familyGroups/${GROUP}/joinRequests/${BOB}/status`), 'rejected'));
    await assertSucceeds(remove(ref(bob, `/familyGroups/${GROUP}/joinRequests/${BOB}`)));
  });

  it('approve leg (multi-path status + memberIds) still works', async () => {
    const bob = asUser(testEnv, BOB, BOB_EMAIL);
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(set(ref(bob, `/familyGroups/${GROUP}/joinRequests/${BOB}`),
      makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob')));
    await assertSucceeds(update(ref(alice), {
      [`/familyGroups/${GROUP}/joinRequests/${BOB}/status`]: 'approved',
      [`/familyGroups/${GROUP}/memberIds/${BOB}`]: true,
    }));
  });

  // Pre-existing (not in this diff): rejectJoinRequest keeps the entry, and the
  // memberIds rule only asks that an entry exists, so a rejected requester can
  // still be admitted later and his profile becomes readable to the group.
  it('denies admitting a requester whose request was rejected', async () => {
    const bob = asUser(testEnv, BOB, BOB_EMAIL);
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(set(ref(bob, `/familyGroups/${GROUP}/joinRequests/${BOB}`),
      makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob')));
    await assertSucceeds(set(ref(alice, `/familyGroups/${GROUP}/joinRequests/${BOB}/status`), 'rejected'));
    await assertFails(set(ref(alice, `/familyGroups/${GROUP}/memberIds/${BOB}`), true));
  });

  it('denies Bob writing a request for someone else even with his own email', async () => {
    const bob = asUser(testEnv, BOB, BOB_EMAIL);
    await assertFails(set(ref(bob, `/familyGroups/${GROUP}/joinRequests/${ALICE}`),
      makeJoinRequest(ALICE, GROUP, BOB_EMAIL, 'Alice')));
  });

  it('a member reading the group cannot see Bob profile without a real request', async () => {
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(get(ref(alice, `/users/${BOB}`)));
  });
});

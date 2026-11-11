/**
 * SH-4 (audit 137, team task 142): a rejected join request must not be
 * approvable later. Before the fix, memberIds/$uid only needed the request to
 * *exist*, and a member could flip any request's status, so a rejected
 * request stayed on file and any member could admit the person anyway.
 *
 * Run with `npm run test:rules`.
 */
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, set, update, get } = require('firebase/database');
const { createTestEnv, asUser, makeUser, makeGroup, makeJoinRequest } = require('./helpers');

const ALICE = 'alice-uid';
const ALICE_EMAIL = 'alice@example.com';
const BOB = 'bob-uid';
const BOB_EMAIL = 'bob@example.com';
const GROUP = '-NgroupKey123';
const REQ = `/familyGroups/${GROUP}/joinRequests/${BOB}`;
const MEMBER = `/familyGroups/${GROUP}/memberIds/${BOB}`;

let testEnv;
beforeAll(async () => { testEnv = await createTestEnv(); });
afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearDatabase(); });

async function seed(status) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `/familyGroups/${GROUP}`), makeGroup(GROUP, ALICE, { [ALICE]: true }, 'ABCD2345'));
    await set(ref(db, `/users/${ALICE}`), makeUser(ALICE, ALICE_EMAIL, 'Alice', GROUP));
    await set(ref(db, `/users/${BOB}`), makeUser(BOB, BOB_EMAIL, 'Bob', null));
    if (status) await set(ref(db, REQ), makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob', status));
  });
}
const alice = () => asUser(testEnv, ALICE, ALICE_EMAIL);
const bob = () => asUser(testEnv, BOB, BOB_EMAIL);
const approveUpdate = () => ({ [`${REQ}/status`]: 'approved', [MEMBER]: true });

describe('SH-4: a rejected request stays rejected', () => {
  it('denies approving a rejected request in one update (the app\'s approve call)', async () => {
    await seed('rejected');
    await assertFails(update(ref(alice()), approveUpdate()));
  });

  it('denies admitting the uid of a rejected request directly', async () => {
    await seed('rejected');
    await assertFails(set(ref(alice(), MEMBER), true));
  });

  it('denies a member flipping a rejected request back to approved', async () => {
    await seed('rejected');
    await assertFails(set(ref(alice(), `${REQ}/status`), 'approved'));
  });

  it('denies a member flipping a rejected request back to pending', async () => {
    await seed('rejected');
    await assertFails(set(ref(alice(), `${REQ}/status`), 'pending'));
  });

  it('denies a member rewriting a rejected request whole as pending', async () => {
    await seed('rejected');
    await assertFails(set(ref(alice(), REQ), makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob', 'pending')));
  });

  it('denies flip-then-admit in one update', async () => {
    await seed('rejected');
    await assertFails(update(ref(alice()), { [`${REQ}/status`]: 'pending', [MEMBER]: true }));
  });

  // Unchanged behaviour the fix must keep.
  it('still allows approving a pending request in one update', async () => {
    await seed('pending');
    await assertSucceeds(update(ref(alice()), approveUpdate()));
    let value;
    await testEnv.withSecurityRulesDisabled(async (ctx) => { value = (await get(ref(ctx.database(), MEMBER))).val(); });
    expect(value).toBe(true);
  });

  it('still allows the two-step approve (status first, then memberIds)', async () => {
    await seed('pending');
    await assertSucceeds(set(ref(alice(), `${REQ}/status`), 'approved'));
    await assertSucceeds(set(ref(alice(), MEMBER), true));
  });

  it('still allows rejecting a pending request', async () => {
    await seed('pending');
    await assertSucceeds(set(ref(alice(), `${REQ}/status`), 'rejected'));
  });

  it('still allows the requester to ask again after a rejection, and then approval', async () => {
    await seed('rejected');
    await assertSucceeds(set(ref(bob(), REQ), makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob', 'pending')));
    await assertSucceeds(update(ref(alice()), approveUpdate()));
  });

  it('still allows a member to clear a rejected request', async () => {
    await seed('rejected');
    await assertSucceeds(set(ref(alice(), REQ), null));
  });

  it('denies a status outside pending/approved/rejected', async () => {
    await seed('pending');
    await assertFails(set(ref(alice(), `${REQ}/status`), 'admitted'));
  });
});

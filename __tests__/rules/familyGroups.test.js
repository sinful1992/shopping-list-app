/**
 * Characterization tests for database.rules.json.
 *
 * These assert behaviour that must hold both before and after the S1/S5/S6
 * hardening: group creation, the tier lockout, membership reads and the
 * approval handshake. The allow/deny pairs specific to each hardening land in
 * the same commit as their rule change.
 *
 * Run with `npm run test:rules` (wraps this in `firebase emulators:exec`).
 */
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, set, get, update, remove } = require('firebase/database');
const {
  createTestEnv,
  asUser,
  makeUser,
  makeGroup,
  makeJoinRequest,
} = require('./helpers');

const ALICE = 'alice-uid';
const ALICE_EMAIL = 'alice@example.com';
const BOB = 'bob-uid';
const BOB_EMAIL = 'bob@example.com';
const GROUP = '-NgroupKey123';
const CODE = 'ABCD2345';

let testEnv;

beforeAll(async () => {
  testEnv = await createTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

/** Seed a group owned by Alice, with Bob as a second member when asked. */
async function seedGroup({ withBob = false } = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    const memberIds = withBob ? { [ALICE]: true, [BOB]: true } : { [ALICE]: true };
    await set(ref(db, `/familyGroups/${GROUP}`), makeGroup(GROUP, ALICE, memberIds, CODE));
    await set(ref(db, `/invitations/${CODE}`), {
      groupId: GROUP,
      groupName: 'Test Family',
      createdAt: 1700000000000,
    });
    await set(ref(db, `/users/${ALICE}`), makeUser(ALICE, ALICE_EMAIL, 'Alice', GROUP));
    await set(
      ref(db, `/users/${BOB}`),
      makeUser(BOB, BOB_EMAIL, 'Bob', withBob ? GROUP : null),
    );
  });
}

/** Seed a pending join request from Bob against Alice's group. */
async function seedJoinRequest(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), `/familyGroups/${GROUP}/joinRequests/${BOB}`), {
      ...makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob'),
      ...overrides,
    });
  });
}

describe('group creation', () => {
  // The client does this as one root-level multi-path update
  // (AuthenticationModule.createFamilyGroup), not a set() on the group node.
  function creationUpdate(overrides = {}) {
    return {
      [`/familyGroups/${GROUP}`]: {
        ...makeGroup(GROUP, ALICE, { [ALICE]: true }, CODE),
        ...overrides,
      },
      [`/invitations/${CODE}`]: {
        groupId: GROUP,
        groupName: 'Test Family',
        createdAt: 1700000000000,
      },
      [`/users/${ALICE}/familyGroupId`]: GROUP,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(
        ref(ctx.database(), `/users/${ALICE}`),
        makeUser(ALICE, ALICE_EMAIL, 'Alice', null),
      );
    });
  });

  // KNOWN FAILURE, pre-existing since 7675269 (2026-05-06) — not caused by the
  // S1/S5/S6 work, and deliberately left unfixed for now.
  //
  // The write is denied on its `/users/{uid}/familyGroupId` leg. That path is
  // gated on root.child('familyGroups')…memberIds.hasChild($uid) (rules :15),
  // and `root` is the state *before* the operation, so the group being created
  // in the very same atomic update is not visible yet. The `invitations` rule
  // carries an explicit escape hatch for exactly this case (:141); the `users`
  // rule does not. Isolated: the leg fails alone when the group is absent and
  // succeeds alone when it is already present.
  //
  // it.failing passes while the write is denied and goes RED the moment it
  // starts succeeding — so this test is what will report the fix landing.
  it.failing('allows the real multi-path create', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(update(ref(db), creationUpdate()));
  });

  // The guards below are asserted against the group node on its own. Routing
  // them through creationUpdate() would pass vacuously: that update is denied
  // on its users leg regardless of what the group node contains, so it could
  // not tell a working tier guard from a missing one.
  const createGroupNode = (db, overrides = {}) =>
    set(ref(db, `/familyGroups/${GROUP}`), {
      ...makeGroup(GROUP, ALICE, { [ALICE]: true }, CODE),
      ...overrides,
    });

  it('allows creating the group node itself', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(createGroupNode(db));
  });

  it('denies creating a group the creator is not a member of', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(createGroupNode(db, { memberIds: { [BOB]: true } }));
  });

  it('denies self-granting a paid tier at creation', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(createGroupNode(db, { subscriptionTier: 'premium' }));
  });

  it('denies smuggling tierUpdatedAt in at creation', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(createGroupNode(db, { tierUpdatedAt: 1700000000000 }));
  });
});

describe('group reads', () => {
  it('allows a member to read the group', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(get(ref(db, `/familyGroups/${GROUP}`)));
  });

  it('denies a non-member reading the group', async () => {
    await seedGroup();
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertFails(get(ref(db, `/familyGroups/${GROUP}`)));
  });
});

describe('subscription tier', () => {
  it('denies a member writing the tier without the admin claim', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(set(ref(db, `/familyGroups/${GROUP}/subscriptionTier`), 'family'));
  });
});

describe('membership', () => {
  it('allows a member to remove their own memberIds entry', async () => {
    await seedGroup({ withBob: true });
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertSucceeds(remove(ref(db, `/familyGroups/${GROUP}/memberIds/${BOB}`)));
  });

  // S1: membership alone used to authorize nulling the whole group node, taking
  // every list, item, price and store layout with it. The only legitimate caller
  // was deleteUserAccount's last-member branch, so the permission is gone and
  // that branch now just removes its own memberIds entry.
  it('denies a member deleting the entire group', async () => {
    await seedGroup({ withBob: true });
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertFails(remove(ref(db, `/familyGroups/${GROUP}`)));
  });

  it('denies the sole member deleting the entire group', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(remove(ref(db, `/familyGroups/${GROUP}`)));
  });

  it('allows the last member to retire the invitation, then themselves', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    // Order matters: deleting the invitation requires still being a member.
    await assertSucceeds(remove(ref(db, `/invitations/${CODE}`)));
    await assertSucceeds(remove(ref(db, `/familyGroups/${GROUP}/memberIds/${ALICE}`)));
  });

  it('denies retiring the invitation once no longer a member', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(remove(ref(db, `/familyGroups/${GROUP}/memberIds/${ALICE}`)));
    await assertFails(remove(ref(db, `/invitations/${CODE}`)));
  });

  it('denies a member adding someone with no join request on file', async () => {
    await seedGroup();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(set(ref(db, `/familyGroups/${GROUP}/memberIds/${BOB}`), true));
  });

  it('allows a member to admit a user who has a join request on file', async () => {
    await seedGroup();
    await seedJoinRequest();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    // approveJoinRequest writes both paths in one update.
    await assertSucceeds(
      update(ref(db), {
        [`/familyGroups/${GROUP}/joinRequests/${BOB}/status`]: 'approved',
        [`/familyGroups/${GROUP}/memberIds/${BOB}`]: true,
      }),
    );
  });

  it('denies a non-member admitting a user who has a join request on file', async () => {
    await seedGroup();
    await seedJoinRequest();
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertFails(set(ref(db, `/familyGroups/${GROUP}/memberIds/${BOB}`), true));
  });
});

describe('join requests', () => {
  it('allows a user to submit their own join request', async () => {
    await seedGroup();
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertSucceeds(
      set(
        ref(db, `/familyGroups/${GROUP}/joinRequests/${BOB}`),
        makeJoinRequest(BOB, GROUP, BOB_EMAIL, 'Bob'),
      ),
    );
  });

  it('allows the requester to cancel their own request', async () => {
    await seedGroup();
    await seedJoinRequest();
    const db = asUser(testEnv, BOB, BOB_EMAIL);
    await assertSucceeds(remove(ref(db, `/familyGroups/${GROUP}/joinRequests/${BOB}`)));
  });

  it('allows a member to reject an existing request', async () => {
    await seedGroup();
    await seedJoinRequest();
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(
      set(ref(db, `/familyGroups/${GROUP}/joinRequests/${BOB}/status`), 'rejected'),
    );
  });

  it('denies an unrelated user reading another user request', async () => {
    await seedGroup();
    await seedJoinRequest();
    const db = asUser(testEnv, 'carol-uid', 'carol@example.com');
    await assertFails(get(ref(db, `/familyGroups/${GROUP}/joinRequests/${BOB}`)));
  });
});

/**
 * categoryHistory rules (Fable 5.2 review of PR #71). Since 4c98fde
 * (2026-05-18) the app writes no `category` field (the category is the node
 * key), but the rule still required one, so every write was refused and
 * category history never reached the family's other phones. The rule now
 * requires only usageCount, lastUsedAt and createdAt, which every app version
 * writes.
 *
 * Run with `npm run test:rules` (CI does, with the emulator).
 */
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, set, runTransaction } = require('firebase/database');
const { createTestEnv, asUser, makeUser, makeGroup } = require('./helpers');

const ALICE = 'alice-uid';
const ALICE_EMAIL = 'alice@example.com';
const EVE = 'eve-uid';
const EVE_EMAIL = 'eve@example.com';
const GROUP = '-NgroupCatHist';
const PATH = `/familyGroups/${GROUP}/categoryHistory/milk/dairy`;

let testEnv;

beforeAll(async () => {
  testEnv = await createTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `/familyGroups/${GROUP}`), makeGroup(GROUP, ALICE, { [ALICE]: true }, 'CATH1234'));
    await set(ref(db, `/users/${ALICE}`), makeUser(ALICE, ALICE_EMAIL, 'Alice', GROUP));
    await set(ref(db, `/users/${EVE}`), makeUser(EVE, EVE_EMAIL, 'Eve', null));
  });
});

describe('categoryHistory writes', () => {
  it('the shape every app version writes (no category field) is accepted from a member', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(set(ref(db, PATH), { usageCount: 1, lastUsedAt: 1, createdAt: 1 }));
  });

  it('the app\'s transaction, first use then a count up, is accepted', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    const step = (current) => current === null
      ? { usageCount: 1, lastUsedAt: 1, createdAt: 1 }
      : { ...current, usageCount: (current.usageCount || 0) + 1, lastUsedAt: 2 };
    await assertSucceeds(runTransaction(ref(db, PATH), step));
    await assertSucceeds(runTransaction(ref(db, PATH), step));
  });

  it('an older entry that still carries a category field is accepted too', async () => {
    const db = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertSucceeds(set(ref(db, PATH), { category: 'dairy', usageCount: 1, lastUsedAt: 1, createdAt: 1 }));
  });

  it('missing createdAt, a non-number count, or a non-member: refused', async () => {
    const alice = asUser(testEnv, ALICE, ALICE_EMAIL);
    await assertFails(set(ref(alice, PATH), { usageCount: 1, lastUsedAt: 1 }));
    await assertFails(set(ref(alice, PATH), { usageCount: '1', lastUsedAt: 1, createdAt: 1 }));
    const eve = asUser(testEnv, EVE, EVE_EMAIL);
    await assertFails(set(ref(eve, PATH), { usageCount: 1, lastUsedAt: 1, createdAt: 1 }));
  });
});

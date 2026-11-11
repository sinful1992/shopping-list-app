/**
 * Rank 20 (audit 137, task 142/143): SyncEngine now sends an update of a list or item as
 * `update(path, changedFields)`. These check that database.rules.json accepts such partial writes
 * from a member, still refuses them from a non-member, and still refuses a partial write that
 * would leave an invalid item (an item deleted meanwhile, or a required field nulled).
 *
 * Run with `npm run test:rules`.
 */
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, set, get, update } = require('firebase/database');
const { createTestEnv, asUser, makeGroup } = require('./helpers');

const ALICE = 'alice-uid';
const MALLORY = 'mallory-uid';
const GROUP = '-NgroupKey123';
const ITEM = `/familyGroups/${GROUP}/items/i1`;
const LIST = `/familyGroups/${GROUP}/lists/l1`;

let testEnv;
beforeAll(async () => { testEnv = await createTestEnv(); });
afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.database();
    await set(ref(db, `/familyGroups/${GROUP}`), makeGroup(GROUP, ALICE, { [ALICE]: true }, 'ABCD2345'));
    await set(ref(db, ITEM), { listId: 'l1', name: 'Milk', createdBy: ALICE, checked: false, price: 1.2, updatedAt: 5 });
    await set(ref(db, LIST), { name: 'Tesco', createdBy: ALICE, createdAt: 1700000000000, familyGroupId: GROUP, status: 'active',
      receiptData: { total: 1.2, lineItems: [{ description: 'MILK', price: 1.2 }] } });
  });
});

const alice = () => asUser(testEnv, ALICE, 'alice@example.com');

it('a member may tick an item with a partial update; the other fields stay', async () => {
  await assertSucceeds(update(ref(alice(), ITEM), { checked: true, updatedAt: 10 }));
  const v = (await get(ref(alice(), ITEM))).val();
  expect(v).toMatchObject({ name: 'Milk', checked: true, price: 1.2, updatedAt: 10 });
});

it('a cleared field sent as null is removed', async () => {
  await assertSucceeds(update(ref(alice(), ITEM), { price: null, updatedAt: 10 }));
  expect((await get(ref(alice(), ITEM))).val()).not.toHaveProperty('price');
});

it('a member may rename a list without sending its receipt', async () => {
  await assertSucceeds(update(ref(alice(), LIST), { name: 'Tesco big shop' }));
  const v = (await get(ref(alice(), LIST))).val();
  expect(v.name).toBe('Tesco big shop');
  expect(v.receiptData.total).toBe(1.2);
});

it('a non-member cannot make a partial write', async () => {
  await assertFails(update(ref(asUser(testEnv, MALLORY, 'm@example.com'), ITEM), { checked: true }));
});

it('a partial write on an item deleted meanwhile is refused (it would leave a fragment)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database(), ITEM), null); });
  await assertFails(update(ref(alice(), ITEM), { checked: true, updatedAt: 10 }));
});

it('a partial write that nulls a required field is refused', async () => {
  await assertFails(update(ref(alice(), ITEM), { name: null }));
  await assertFails(update(ref(alice(), LIST), { createdAt: null }));
});

it('a partial write with a wrong type for a required field is refused', async () => {
  await assertFails(update(ref(alice(), ITEM), { checked: 'yes' }));
});

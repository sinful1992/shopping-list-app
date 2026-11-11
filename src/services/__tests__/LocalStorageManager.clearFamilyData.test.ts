/**
 * Left note 139 (audit 137, task 145): clearFamilyData removes one family's rows and the sync queue,
 * and leaves every other family's rows alone. A small in-memory stand-in for WatermelonDB.
 */
type Row = { id: string; table: string; [k: string]: unknown; deleted?: boolean; prepareMarkAsDeleted: () => () => void };
const mockRows: Row[] = [];
let mockBatches = 0;

jest.mock('../storage/database', () => {
  const matches = (r: any, c: any) => {
    const v = r[c.left];
    if (c.comparison.operator === 'eq') return v === c.comparison.right.value;
    if (c.comparison.operator === 'oneOf') return c.comparison.right.values.includes(v);
    throw new Error(`unsupported ${c.comparison.operator}`);
  };
  return {
    createDatabase: () => ({
      write: async (fn: () => Promise<void>) => fn(),
      batch: async (ops: Array<() => void>) => { mockBatches++; ops.forEach(op => op()); },
      collections: {
        get: (table: string) => ({
          query: (...conds: any[]) => ({
            fetch: async () => mockRows.filter(r => r.table === table && !r.deleted && conds.every(c => matches(r, c))),
          }),
        }),
      },
    }),
  };
});
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import LocalStorageManager from '../LocalStorageManager';

const row = (table: string, id: string, fields: Record<string, unknown>): Row => {
  const r: Row = { id, table, ...fields, prepareMarkAsDeleted: () => () => { r.deleted = true; } };
  return r;
};
const left = (table: string) => mockRows.filter(r => r.table === table && !r.deleted).map(r => r.id).sort();

beforeEach(() => {
  mockRows.length = 0;
  mockBatches = 0;
  mockRows.push(
    row('shopping_lists', 'lA1', { family_group_id: 'famA' }),
    row('shopping_lists', 'lA2', { family_group_id: 'famA' }),
    row('shopping_lists', 'lB1', { family_group_id: 'famB' }),
    row('items', 'iA1', { list_id: 'lA1' }),
    row('items', 'iA2', { list_id: 'lA2' }),
    row('items', 'iB1', { list_id: 'lB1' }),
    ...['price_history', 'category_history', 'store_layouts', 'item_preferences', 'receipt_aliases'].flatMap(t => [
      row(t, `${t}-A`, { family_group_id: 'famA' }),
      row(t, `${t}-B`, { family_group_id: 'famB' }),
    ]),
    row('sync_queue', 'q1', {}),
    row('sync_queue', 'q2', {}),
  );
});

it('removes famA\'s lists, their items, its histories, layouts, preferences, receipt names and the queue', async () => {
  await LocalStorageManager.clearFamilyData('famA');
  expect(left('shopping_lists')).toEqual(['lB1']);
  expect(left('items')).toEqual(['iB1']);
  for (const t of ['price_history', 'category_history', 'store_layouts', 'item_preferences', 'receipt_aliases']) {
    expect(left(t)).toEqual([`${t}-B`]);
  }
  expect(left('sync_queue')).toEqual([]);
  expect(mockBatches).toBe(1);
});

it('a family with no rows here still empties the queue and touches nothing else', async () => {
  await LocalStorageManager.clearFamilyData('famZ');
  expect(left('shopping_lists')).toEqual(['lA1', 'lA2', 'lB1']);
  expect(left('items')).toEqual(['iA1', 'iA2', 'iB1']);
  expect(left('sync_queue')).toEqual([]);
});

it('an empty family id does nothing at all', async () => {
  await LocalStorageManager.clearFamilyData('');
  expect(mockBatches).toBe(0);
  expect(left('sync_queue')).toEqual(['q1', 'q2']);
});

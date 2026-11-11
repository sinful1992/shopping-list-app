/**
 * OPTIMISE P6 step 2 (Fable audit task 137): the open list's item observer
 * rebuilt every Item object on each emission, so ticking one item re-rendered
 * every category. Unchanged items now keep their object.
 * Real WatermelonDB on the in-memory LokiJS adapter.
 */
import LocalStorageManager from '../LocalStorageManager';
import { Item } from '../../models/types';

const settle = () => new Promise(r => setTimeout(r, 30));
let n = 0;

it('ticking one item gives a new object for it only; the others are the same objects', async () => {
  const listId = `list-p6-${++n}`;
  const base = { listId, quantity: null, price: null, checked: false, createdBy: 'u1', createdAt: 1, updatedAt: 1, syncStatus: 'synced' } as any;
  await LocalStorageManager.saveItemsBatchUpsert([
    { ...base, id: `p6-a-${n}`, name: 'Milk', sortOrder: 1 },
    { ...base, id: `p6-b-${n}`, name: 'Bread', sortOrder: 2 },
    { ...base, id: `p6-c-${n}`, name: 'Eggs', sortOrder: 3 },
  ]);
  const emissions: Item[][] = [];
  const unsub = LocalStorageManager.observeItemsForList(listId, items => emissions.push(items));
  await settle();
  const first = emissions.at(-1)!;
  expect(first.map(i => i.name)).toEqual(['Milk', 'Bread', 'Eggs']);

  await LocalStorageManager.updateItem(`p6-b-${n}`, { checked: true, updatedAt: 2 });
  await settle();
  const second = emissions.at(-1)!;
  expect(second).not.toBe(first);
  expect(second[0]).toBe(first[0]);
  expect(second[2]).toBe(first[2]);
  expect(second[1]).not.toBe(first[1]);
  expect(second[1].checked).toBe(true);
  unsub();
});

it('two observers of the same list do not share or mix their objects', async () => {
  const listId = `list-p6-${++n}`;
  const base = { listId, quantity: null, price: null, checked: false, createdBy: 'u1', createdAt: 1, updatedAt: 1, syncStatus: 'synced', name: 'Tea' } as any;
  await LocalStorageManager.saveItemsBatchUpsert([{ ...base, id: `p6-t-${n}` }]);
  const a: Item[][] = []; const b: Item[][] = [];
  const ua = LocalStorageManager.observeItemsForList(listId, i => a.push(i));
  const ub = LocalStorageManager.observeItemsForList(listId, i => b.push(i));
  await settle();
  await LocalStorageManager.updateItem(`p6-t-${n}`, { name: 'Green tea', updatedAt: 2 });
  await settle();
  expect(a.at(-1)![0].name).toBe('Green tea');
  expect(b.at(-1)![0].name).toBe('Green tea');
  ua(); ub();
});

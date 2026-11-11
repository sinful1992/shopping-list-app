/**
 * PricePredictionService: the grey "predicted" prices on an open list's
 * items, averaged from completed trips. Was 0 % covered (Fable audit task 137).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  },
}));
const mockGetAllLists = jest.fn();
const mockGetItemsForLists = jest.fn();
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: { getAllLists: (...a: unknown[]) => mockGetAllLists(...a) } }));
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: { getItemsForLists: (...a: unknown[]) => mockGetItemsForLists(...a) } }));

let now = 1_000_000_000;
let svc: any;
const KEY = (f: string) => `@price_predictions_${f}`;
const TTL = 30 * 60 * 1000;

beforeEach(() => {
  jest.resetModules();
  mockStore.clear();
  mockGetAllLists.mockReset();
  mockGetItemsForLists.mockReset();
  now = 1_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  svc = require('../PricePredictionService').default;
  mockGetAllLists.mockResolvedValue([
    { id: 'l1', status: 'completed' },
    { id: 'l2', status: 'completed' },
    { id: 'l3', status: 'active' },
  ]);
  mockGetItemsForLists.mockResolvedValue([
    { name: 'Milk', price: 1.0 },
    { name: ' milk ', price: 1.5 },
    { name: 'Bread', price: 1.333 },
    { name: 'Free', price: 0 },
    { name: 'Refund', price: -2 },
    { name: 'NoPrice', price: null },
    { name: '', price: 3 },
    null,
  ]);
});
afterEach(() => jest.restoreAllMocks());

it('averages prices per name (case and spaces ignored), rounded to pennies, completed trips only', async () => {
  const p = await svc.getPredictionsForFamilyGroup('fam');
  expect(p).toEqual({ milk: 1.25, bread: 1.33 });
  expect(mockGetItemsForLists).toHaveBeenCalledWith(['l1', 'l2']);
});

it('no completed trips: no predictions, no item read', async () => {
  mockGetAllLists.mockResolvedValue([{ id: 'l3', status: 'active' }]);
  expect(await svc.getPredictionsForFamilyGroup('fam')).toEqual({});
  expect(mockGetItemsForLists).not.toHaveBeenCalled();
});

it('a second call within 30 min uses memory; after 30 min it recalculates', async () => {
  await svc.getPredictionsForFamilyGroup('fam');
  now += TTL - 1;
  await svc.getPredictionsForFamilyGroup('fam');
  expect(mockGetAllLists).toHaveBeenCalledTimes(1);
  now += 2;
  await svc.getPredictionsForFamilyGroup('fam');
  expect(mockGetAllLists).toHaveBeenCalledTimes(2);
});

it('a fresh saved copy is used after an app restart; a stale one is not', async () => {
  mockStore.set(KEY('fam'), JSON.stringify({ predictions: { eggs: 2.1 }, timestamp: now - 1000 }));
  expect(await svc.getPredictionsForFamilyGroup('fam')).toEqual({ eggs: 2.1 });
  expect(mockGetAllLists).not.toHaveBeenCalled();
  mockStore.set(KEY('fam2'), JSON.stringify({ predictions: { eggs: 2.1 }, timestamp: now - TTL - 1 }));
  expect(await svc.getPredictionsForFamilyGroup('fam2')).toEqual({ milk: 1.25, bread: 1.33 });
});

it('the result is saved for the next start', async () => {
  await svc.getPredictionsForFamilyGroup('fam');
  await new Promise(r => setTimeout(r, 0));
  expect(JSON.parse(mockStore.get(KEY('fam'))!)).toEqual({ predictions: { milk: 1.25, bread: 1.33 }, timestamp: now });
});

it.each([
  ['no predictions object', { timestamp: 0 }],
  ['predictions is a list', { predictions: [1], timestamp: 0 }],
  ['predictions is null', { predictions: null, timestamp: 0 }],
  ['no timestamp', { predictions: { a: 1 } }],
  ['damaged JSON', '{x'],
])('a damaged saved copy (%s) is recalculated, never handed out', async (_l, saved) => {
  mockStore.set(KEY('fam'), typeof saved === 'string' ? saved : JSON.stringify({ ...(saved as object), timestamp: (saved as any).timestamp === 0 ? now : (saved as any).timestamp }));
  const p = await svc.getPredictionsForFamilyGroup('fam');
  expect(p).toEqual({ milk: 1.25, bread: 1.33 });
});

it('a storage error while calculating gives no predictions instead of an error', async () => {
  mockGetAllLists.mockRejectedValue(new Error('db'));
  expect(await svc.getPredictionsForFamilyGroup('fam')).toEqual({});
});

it('families are kept apart', async () => {
  await svc.getPredictionsForFamilyGroup('a');
  mockGetItemsForLists.mockResolvedValue([{ name: 'Tea', price: 3 }]);
  expect(await svc.getPredictionsForFamilyGroup('b')).toEqual({ tea: 3 });
  expect(await svc.getPredictionsForFamilyGroup('a')).toEqual({ milk: 1.25, bread: 1.33 });
});

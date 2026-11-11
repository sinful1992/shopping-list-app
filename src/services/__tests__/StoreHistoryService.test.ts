/**
 * StoreHistoryService: the store names offered in the store picker and used
 * to name a scanned receipt's shop. Was 14 % covered (Fable audit task 137).
 */
const mockStore = new Map<string, string>();
const mockGetItem = jest.fn(async (k: string) => mockStore.get(k) ?? null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  },
}));

import StoreHistoryService from '../StoreHistoryService';

const KEY = '@store_history';
let now = 1_000;
const stored = () => JSON.parse(mockStore.get(KEY) ?? '[]');

beforeEach(() => {
  mockStore.clear();
  mockGetItem.mockImplementation(async (k: string) => mockStore.get(k) ?? null);
  now = 1_000;
  jest.spyOn(Date, 'now').mockImplementation(() => ++now);
});
afterEach(() => jest.restoreAllMocks());

it('empty history: no stores', async () => {
  expect(await StoreHistoryService.getStoreHistory()).toEqual([]);
});

it('adds a trimmed store with frequency 1', async () => {
  await StoreHistoryService.addStore('  Tesco  ');
  expect(stored()).toEqual([{ name: 'Tesco', frequency: 1, lastUsed: expect.any(Number) }]);
});

it('blank names are ignored', async () => {
  await StoreHistoryService.addStore('');
  await StoreHistoryService.addStore('   ');
  expect(mockStore.has(KEY)).toBe(false);
});

it('the same store in another case counts up, keeping the first spelling', async () => {
  await StoreHistoryService.addStore('Tesco');
  await StoreHistoryService.addStore('TESCO');
  expect(stored()).toEqual([{ name: 'Tesco', frequency: 2, lastUsed: expect.any(Number) }]);
});

it('orders by frequency, then by most recent', async () => {
  await StoreHistoryService.addStore('Aldi');
  await StoreHistoryService.addStore('Lidl');
  await StoreHistoryService.addStore('Tesco');
  await StoreHistoryService.addStore('Tesco');
  expect(await StoreHistoryService.getStoreHistory()).toEqual(['Tesco', 'Lidl', 'Aldi']);
});

it('keeps at most 20 stores, dropping the least used and oldest', async () => {
  await StoreHistoryService.addStore('Favourite');
  await StoreHistoryService.addStore('Favourite');
  for (let i = 0; i < 21; i++) await StoreHistoryService.addStore(`Shop ${i}`);
  const names = await StoreHistoryService.getStoreHistory();
  expect(names).toHaveLength(20);
  expect(names[0]).toBe('Favourite');
  expect(names).not.toContain('Shop 0');
  expect(names).not.toContain('Shop 1');
  expect(names).toContain('Shop 20');
});

it('search filters case-insensitively; blank search gives everything', async () => {
  await StoreHistoryService.addStore('Tesco Extra');
  await StoreHistoryService.addStore('Sainsbury\'s');
  expect(await StoreHistoryService.searchStores('tES')).toEqual(['Tesco Extra']);
  expect(await StoreHistoryService.searchStores('  ')).toHaveLength(2);
  expect(await StoreHistoryService.searchStores('zzz')).toEqual([]);
});

it.each([
  ['a damaged JSON string', '{not json'],
  ['an object, not a list', '{"name":"Tesco"}'],
  ['a plain string', '"Tesco"'],
])('stored %s: history is empty, nothing throws, adding starts fresh', async (_l, raw) => {
  mockStore.set(KEY, raw);
  await expect(StoreHistoryService.getStoreHistory()).resolves.toEqual([]);
  await StoreHistoryService.addStore('Aldi');
  expect(stored().map((e: any) => e.name)).toEqual(['Aldi']);
});

it('damaged entries in the list are skipped, good ones kept', async () => {
  mockStore.set(KEY, JSON.stringify([
    { name: 'Tesco', frequency: 2, lastUsed: 5 },
    null,
    { name: '', frequency: 1, lastUsed: 1 },
    { name: 'NoFreq', lastUsed: 1 },
    { name: 7, frequency: 1, lastUsed: 1 },
    { name: 'Lidl', frequency: 1, lastUsed: 9 },
  ]));
  expect(await StoreHistoryService.getStoreHistory()).toEqual(['Tesco', 'Lidl']);
});

it('a storage read that fails gives an empty history instead of throwing (a scan reads it while saving)', async () => {
  mockGetItem.mockRejectedValue(new Error('storage broken'));
  await expect(StoreHistoryService.getStoreHistory()).resolves.toEqual([]);
  await expect(StoreHistoryService.searchStores('t')).resolves.toEqual([]);
  await expect(StoreHistoryService.addStore('Tesco')).resolves.toBeUndefined();
});

/**
 * Break tests (fresh reviewer) for the task 121 history fallback.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import type { ShoppingList } from '../../../models/types';
import HistoryDetailScreen from '../HistoryDetailScreen';

jest.setTimeout(30000);

const mockNav = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
let mockUser: { uid: string; familyGroupId: string | null } | null = { uid: 'u1', familyGroupId: 'fam-1' };
let mockListId = 'list-1';
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { listId: mockListId } }),
  useNavigation: () => mockNav,
}));
jest.mock('../../../contexts/UserContext', () => ({ useUser: () => mockUser }));
jest.mock('../../../contexts/AlertContext', () => { const a = { showAlert: jest.fn() }; return { useAlert: () => a }; });
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../../../styles/theme').DARK_THEME }),
}));
jest.mock('../../../components/PriceEditModal', () => 'PriceEditModal');
jest.mock('../../../components/PriceHistoryModal', () => 'PriceHistoryModal');
jest.mock('../../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));
jest.mock('../../../services/HistoryTracker', () => ({ __esModule: true, default: { getListDetails: jest.fn() } }));
jest.mock('../../../services/ItemManager', () => ({ __esModule: true, default: { updateItem: jest.fn() } }));
jest.mock('../../../services/FirebaseSyncListener', () => ({
  __esModule: true,
  default: { fetchItemsOnceForHistory: jest.fn(), fetchListOnceForHistory: jest.fn() },
}));
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: { updateList: jest.fn(async () => ({})), deleteList: jest.fn() } }));
jest.mock('../../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getSmartSuggestions: jest.fn(async () => new Map()), getPriceStats: jest.fn(async () => null) },
}));

const HistoryTracker = jest.requireMock('../../../services/HistoryTracker').default;
const FSL = jest.requireMock('../../../services/FirebaseSyncListener').default;
const SLM = jest.requireMock('../../../services/ShoppingListManager').default;
const alertMock = jest.requireMock('../../../contexts/AlertContext').useAlert().showAlert as jest.Mock;

const GENERIC = 'Something went wrong. Please try again.';
const NOT_LOCAL = new Error('Failed to get list details: List not found');
const list = (over: Partial<ShoppingList> = {}): ShoppingList => ({
  id: 'list-1', name: 'Big shop', familyGroupId: 'fam-1', status: 'completed', completedAt: 1_762_000_000_000,
  createdAt: 1_761_000_000_000, receiptData: null, receiptUrl: null, totalAmount: 42.1, storeName: 'Tesco', ...over,
} as ShoppingList);

const flat = (c: unknown): string => Array.isArray(c) ? c.map(flat).join('') : (typeof c === 'string' || typeof c === 'number') ? String(c) : '';
const allText = (r: ReactTestRenderer) => r.root.findAll(n => typeof n.type === 'string' || (n.type as unknown) === 'Text')
  .map(n => flat(n.props.children)).join('|');
const genericShown = () => alertMock.mock.calls.some(c => c[1] === GENERIC);

async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<HistoryDetailScreen />); });
  return r;
}
async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockUser = { uid: 'u1', familyGroupId: 'fam-1' };
  mockListId = 'list-1';
  HistoryTracker.getListDetails.mockRejectedValue(NOT_LOCAL);
  FSL.fetchItemsOnceForHistory.mockResolvedValue([
    { id: 'a', listId: 'list-1', name: 'Milk', checked: true, price: 1.2, unitQty: null },
  ]);
});

it('S1 listId changes mid-retry (second push): the newer list wins, old retries do not overwrite it', async () => {
  jest.useFakeTimers();
  FSL.fetchListOnceForHistory.mockImplementation(async (_fg: string, id: string) =>
    id === 'list-1' ? null : list({ id: 'list-2', name: 'Second shop' }));
  const r = await render();
  mockListId = 'list-2';
  await act(async () => { r.update(<HistoryDetailScreen />); });
  await advance(1500); await advance(3000); await advance(0);
  expect(allText(r)).toContain('Second shop');
  expect(allText(r)).not.toContain('not on this phone yet');
  // old load stopped retrying once superseded
  expect(FSL.fetchListOnceForHistory.mock.calls.filter((c: string[]) => c[1] === 'list-1')).toHaveLength(1);
});

it('S2 sign-out mid-retry (family group -> null): no alert, no crash, not-yet message', async () => {
  jest.useFakeTimers();
  FSL.fetchListOnceForHistory.mockResolvedValue(null);
  const r = await render();
  mockUser = null;
  await act(async () => { r.update(<HistoryDetailScreen />); });
  await advance(1500); await advance(3000); await advance(0);
  expect(allText(r)).toContain('not on this phone yet');
  expect(alertMock).not.toHaveBeenCalled();
  expect(FSL.fetchListOnceForHistory).toHaveBeenCalledTimes(1);
});

it('S3 an odd (numeric) item name from Firebase does not crash the Purchased row', async () => {
  FSL.fetchListOnceForHistory.mockResolvedValue(list());
  FSL.fetchItemsOnceForHistory.mockResolvedValue([
    { id: 'a', listId: 'list-1', name: 123, checked: true, price: 1.2, unitQty: null },
  ]);
  let r: ReactTestRenderer | null = null;
  let threw: unknown = null;
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { r = await render(); } catch (e) { threw = e; }
  spy.mockRestore();
  expect(threw).toBeNull();
  expect(allText(r!)).toContain('123');
});

it('S4 Firebase still has the pre-completion (active) snapshot: keeps waiting for the completed trip', async () => {
  jest.useFakeTimers();
  // Receipt scanned on an active list: the list is in Firebase already, only the
  // completion write lags the push.
  FSL.fetchListOnceForHistory
    .mockResolvedValueOnce(list({ status: 'active', completedAt: null as unknown as number, totalAmount: null }))
    .mockResolvedValue(list());
  FSL.fetchItemsOnceForHistory.mockResolvedValue([]);
  const r = await render();
  await advance(1500); await advance(3000); await advance(0);
  expect(allText(r)).toContain('Total: £42.10');
});

it('S5 backfill write failing (list not saved locally) does not raise the generic alert', async () => {
  // Firebase list without a total + items with prices -> backfill updateList. If the
  // local save was skipped (e.g. generation moved on), updateList throws.
  FSL.fetchListOnceForHistory.mockResolvedValue(list({ totalAmount: null }));
  SLM.updateList.mockRejectedValueOnce(new Error('Failed to update list: Record shopping_lists#list-1 not found'));
  const r = await render();
  expect(genericShown()).toBe(false);
  expect(allText(r)).toContain('Milk');
});

it('S6 unmount mid-retry stops the Firebase retries', async () => {
  jest.useFakeTimers();
  FSL.fetchListOnceForHistory.mockResolvedValue(null);
  const r = await render();
  await act(async () => { r.unmount(); });
  await advance(1500); await advance(3000); await advance(0);
  expect(FSL.fetchListOnceForHistory).toHaveBeenCalledTimes(1);
});

it('S7 totals that are non-finite / garbage strings render a number, no crash', async () => {
  FSL.fetchListOnceForHistory.mockResolvedValue(list({ totalAmount: 'abc' as unknown as number }));
  FSL.fetchItemsOnceForHistory.mockResolvedValue([
    { id: 'a', listId: 'list-1', name: 'Milk', checked: true, price: 'NaN', unitQty: null },
    { id: 'b', listId: 'list-1', name: null, checked: false, price: Infinity, unitQty: null },
    { id: 'c', listId: 'list-1', name: 'Eggs', checked: true, price: ' 2.5 ', unitQty: null },
  ]);
  const r = await render();
  expect(allText(r)).toContain('Total: £2.50');
  expect(genericShown()).toBe(false);
});

it('S8 a reload from a price edit racing the first load keeps the newest data', async () => {
  // local list present; first items read slow and stale, second fast and fresh
  HistoryTracker.getListDetails.mockResolvedValue({ list: list(), items: [], receiptData: null });
  let resolveSlow!: (v: unknown) => void;
  FSL.fetchItemsOnceForHistory
    .mockImplementationOnce(() => new Promise(res => { resolveSlow = res; }))
    .mockResolvedValue([{ id: 'a', listId: 'list-1', name: 'Fresh milk', checked: true, price: 1.5, unitQty: null }]);
  const r = await render();
  mockUser = { uid: 'u1', familyGroupId: 'fam-2' }; // triggers a second load
  await act(async () => { r.update(<HistoryDetailScreen />); });
  await act(async () => { resolveSlow([{ id: 'a', listId: 'list-1', name: 'Stale milk', checked: true, price: 1.2, unitQty: null }]); });
  expect(allText(r)).toContain('Fresh milk');
  expect(allText(r)).not.toContain('Stale milk');
});

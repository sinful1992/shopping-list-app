/**
 * Task 121: a receipt push opens history/<listId>. The phone that gets it may
 * not have the trip yet (cold start, or the push beat the sync write). The
 * screen reads the trip from Firebase instead of failing with the generic
 * "Something went wrong" alert.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import type { ShoppingList } from '../../../models/types';
import HistoryDetailScreen from '../HistoryDetailScreen';

jest.setTimeout(30000);

const mockNav = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
let mockUser: { uid: string; familyGroupId: string | null } | null = { uid: 'u1', familyGroupId: 'fam-1' };
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { listId: 'list-1' } }),
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
  default: { fetchItemsOnceForHistory: jest.fn(), fetchListOnceForHistory: jest.fn(), startListeningToLists: jest.fn() },
}));
let mockLocalObserver: ((l: unknown) => void) | null = null;
jest.mock('../../../services/LocalStorageManager', () => ({
  __esModule: true,
  default: { observeList: jest.fn((_id: string, cb: (l: unknown) => void) => { mockLocalObserver = cb; return jest.fn(); }) },
}));
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: { updateList: jest.fn(), deleteList: jest.fn() } }));
jest.mock('../../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getSmartSuggestions: jest.fn(async () => new Map()), getPriceStats: jest.fn(async () => null) },
}));

const HistoryTracker = jest.requireMock('../../../services/HistoryTracker').default;
const FSL = jest.requireMock('../../../services/FirebaseSyncListener').default;
const ShoppingListManager = jest.requireMock('../../../services/ShoppingListManager').default;
const CrashReporting = jest.requireMock('../../../services/CrashReporting').default;
const alertMock = jest.requireMock('../../../contexts/AlertContext').useAlert().showAlert as jest.Mock;

const NOT_LOCAL = new Error('Failed to get list details: List not found');
const remoteList = (over: Partial<ShoppingList> = {}): ShoppingList => ({
  id: 'list-1', name: 'Big shop', familyGroupId: 'fam-1', status: 'completed', completedAt: 1_762_000_000_000,
  receiptData: null, receiptUrl: null, totalAmount: 42.1, storeName: 'Tesco', ...over,
} as ShoppingList);

const flat = (c: unknown): string => Array.isArray(c) ? c.map(flat).join('') : (typeof c === 'string' || typeof c === 'number') ? String(c) : '';
const allText = (r: ReactTestRenderer) => r.root.findAll(n => typeof n.type === 'string' || (n.type as unknown) === 'Text')
  .map(n => flat(n.props.children)).join('|');

async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<HistoryDetailScreen />); });
  return r;
}
async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockUser = { uid: 'u1', familyGroupId: 'fam-1' };
  HistoryTracker.getListDetails.mockRejectedValue(NOT_LOCAL);
  FSL.fetchItemsOnceForHistory.mockResolvedValue([
    { id: 'a', listId: 'list-1', name: 'Milk', checked: true, price: 1.2, unitQty: null },
  ]);
});

it('shows the trip read from Firebase when this phone does not have it yet', async () => {
  FSL.fetchListOnceForHistory.mockResolvedValue(remoteList());
  const r = await render();
  expect(FSL.fetchListOnceForHistory).toHaveBeenCalledWith('fam-1', 'list-1');
  expect(allText(r)).toContain('Big shop');
  expect(allText(r)).toContain('Total: £42.10');
  expect(allText(r)).toContain('Milk');
  expect(alertMock).not.toHaveBeenCalled();
  expect(mockNav.goBack).not.toHaveBeenCalled();
});

it('waits for a list that reaches Firebase just after the push', async () => {
  jest.useFakeTimers();
  FSL.fetchListOnceForHistory.mockResolvedValueOnce(null).mockResolvedValueOnce(remoteList());
  const r = await render();
  expect(allText(r)).toContain('Loading details');
  await advance(1500);
  await advance(0);
  expect(FSL.fetchListOnceForHistory).toHaveBeenCalledTimes(2);
  expect(allText(r)).toContain('Big shop');
});

it('says the trip is not on this phone yet, not "Something went wrong", when Firebase never has it', async () => {
  jest.useFakeTimers();
  FSL.fetchListOnceForHistory.mockResolvedValue(null);
  const r = await render();
  await advance(1500);
  await advance(3000);
  await advance(0);
  expect(FSL.fetchListOnceForHistory).toHaveBeenCalledTimes(3);
  expect(allText(r)).toContain('not on this phone yet');
  expect(alertMock).not.toHaveBeenCalled();
  expect(mockNav.goBack).not.toHaveBeenCalled();
  expect(CrashReporting.recordError).toHaveBeenCalledWith(NOT_LOCAL, 'HistoryDetailScreen list not found');
});

it('says the trip was deleted when Firebase has it as deleted', async () => {
  FSL.fetchListOnceForHistory.mockResolvedValue(remoteList({ status: 'deleted' }));
  const r = await render();
  expect(allText(r)).toContain('This shopping trip was deleted');
  expect(alertMock).not.toHaveBeenCalled();
});

it('says a trip deleted on this phone was deleted', async () => {
  HistoryTracker.getListDetails.mockResolvedValue({ list: remoteList({ status: 'deleted' }), items: [], receiptData: null });
  const r = await render();
  expect(allText(r)).toContain('This shopping trip was deleted');
  expect(FSL.fetchListOnceForHistory).not.toHaveBeenCalled();
});

it('cold start: keeps the spinner, not the not-found text, until the user is known', async () => {
  mockUser = null;
  const r = await render();
  expect(allText(r)).toContain('Loading details');
  expect(allText(r)).not.toContain('not on this phone yet');
});

it('push beat the completion: a local ACTIVE copy waits for the completed trip in Firebase (Codex P2)', async () => {
  jest.useFakeTimers();
  HistoryTracker.getListDetails.mockResolvedValue({
    list: remoteList({ status: 'active', completedAt: null as never, totalAmount: null as never }), items: [], receiptData: null,
  });
  FSL.fetchListOnceForHistory
    .mockResolvedValueOnce(remoteList({ status: 'active', completedAt: null as never }))
    .mockResolvedValueOnce(remoteList({ totalAmount: null as never }));
  const r = await render();
  expect(allText(r)).toContain('Loading details');
  await advance(1500);
  await advance(0);
  expect(allText(r)).toContain('Big shop');
  expect(allText(r)).not.toContain('Still syncing');
  // never written back from a copy this phone did not complete (linus BL1/BL2)
  expect(ShoppingListManager.updateList).not.toHaveBeenCalled();
});

it('still active everywhere: shows it as syncing, writes nothing, reloads when the completion lands here', async () => {
  jest.useFakeTimers();
  const active = remoteList({ status: 'active', completedAt: null as never, totalAmount: null as never });
  HistoryTracker.getListDetails.mockResolvedValue({ list: active, items: [], receiptData: null });
  FSL.fetchListOnceForHistory.mockResolvedValue(active);
  const r = await render();
  await advance(1500);
  await advance(3000);
  await advance(0);
  expect(allText(r)).toContain('Still syncing');
  expect(ShoppingListManager.updateList).not.toHaveBeenCalled();
  expect(FSL.startListeningToLists).toHaveBeenCalledWith('fam-1');
  // read-only while syncing: no price prompt, no Delete, a save is a no-op (linus BL10)
  expect(allText(r)).not.toContain('+ set price');
  expect(allText(r)).not.toContain('Delete Shopping Trip');
  const modal = r.root.find(n => (n.type as unknown) === 'PriceEditModal');
  await act(async () => { await modal.props.onSave('a', { price: 3.2 }); });
  expect(ShoppingListManager.updateList).not.toHaveBeenCalled();

  HistoryTracker.getListDetails.mockResolvedValue({ list: remoteList(), items: [], receiptData: null });
  await act(async () => { mockLocalObserver!(remoteList()); });
  await advance(0);
  expect(allText(r)).not.toContain('Still syncing');
  expect(allText(r)).toContain('Total: £42.10');
  expect(allText(r)).toContain('Delete Shopping Trip');
});

it('cold start: loads once the signed-in user (family group) arrives', async () => {
  mockUser = null;
  FSL.fetchListOnceForHistory.mockResolvedValue(remoteList());
  const r = await render();
  expect(FSL.fetchListOnceForHistory).not.toHaveBeenCalled();
  mockUser = { uid: 'u1', familyGroupId: 'fam-1' };
  await act(async () => { r.update(<HistoryDetailScreen />); });
  expect(allText(r)).toContain('Big shop');
  expect(alertMock).not.toHaveBeenCalled();
});

it('a failed Firebase read is recorded and shows the not-yet message, no alert', async () => {
  const offline = new Error('client is offline');
  FSL.fetchListOnceForHistory.mockRejectedValue(offline);
  const r = await render();
  expect(allText(r)).toContain('not on this phone yet');
  expect(CrashReporting.recordError).toHaveBeenCalledWith(offline, 'HistoryDetailScreen fetchListOnceForHistory');
  expect(alertMock).not.toHaveBeenCalled();
});

it('a slow first load cannot overwrite a newer one (user arrives mid-retry)', async () => {
  jest.useFakeTimers();
  mockUser = { uid: 'u1', familyGroupId: 'fam-old' };
  FSL.fetchListOnceForHistory.mockImplementation(async (fg: string) => (fg === 'fam-1' ? remoteList() : null));
  const r = await render();
  mockUser = { uid: 'u1', familyGroupId: 'fam-1' };
  await act(async () => { r.update(<HistoryDetailScreen />); });
  await advance(1500);
  await advance(3000);
  await advance(0);
  expect(allText(r)).toContain('Big shop');
  expect(allText(r)).not.toContain('not on this phone yet');
});

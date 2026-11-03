// Task 121 break tests (linus) on PR #60: what the push-open fallback must not do.
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
  default: { fetchItemsOnceForHistory: jest.fn(), fetchListOnceForHistory: jest.fn() },
}));
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: { updateList: jest.fn(), deleteList: jest.fn() } }));
jest.mock('../../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getSmartSuggestions: jest.fn(async () => new Map()), getPriceStats: jest.fn(async () => null) },
}));

const HistoryTracker = jest.requireMock('../../../services/HistoryTracker').default;
const FSL = jest.requireMock('../../../services/FirebaseSyncListener').default;
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
const SLM = jest.requireMock('../../../services/ShoppingListManager').default;
const GENERIC = 'Something went wrong. Please try again.';
const milk = { id: 'a', listId: 'list-1', name: 'Milk', checked: true, price: 1.2, unitQty: null };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockUser = { uid: 'u1', familyGroupId: 'fam-1' };
  HistoryTracker.getListDetails.mockRejectedValue(NOT_LOCAL);
  FSL.fetchListOnceForHistory.mockResolvedValue(null);
  FSL.fetchItemsOnceForHistory.mockResolvedValue([milk]);
});

describe('stale copy write-back (SyncEngine update = whole-node set())', () => {
  it('BL1 Firebase still has the list ACTIVE with no total (completion not synced yet): opening it writes nothing', async () => {
    FSL.fetchListOnceForHistory.mockResolvedValue(remoteList({ status: 'active', completedAt: null as unknown as number, totalAmount: null }));
    await render();
    // updateList pushes the whole local node; from a stale active copy that set() can undo the shopper's completion.
    expect(SLM.updateList).not.toHaveBeenCalled();
  });

  it('BL2 local copy still ACTIVE (push beat the completion sync on a warm phone): opening it writes nothing', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({
      list: remoteList({ status: 'active', completedAt: null as unknown as number, totalAmount: null }), items: [milk], receiptData: null,
    });
    await render();
    expect(SLM.updateList).not.toHaveBeenCalled();
  });

  it('BL3 a COMPLETED trip with no total still gets its backfill (old behaviour kept)', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({ list: remoteList({ totalAmount: null }), items: [milk], receiptData: null });
    await render();
    expect(SLM.updateList).toHaveBeenCalledWith('list-1', { totalAmount: 1.2 });
  });
});

describe('push-open edge cases', () => {
  it('BL4 Firebase read rejects with permission denied (just removed from the group): no generic alert, no crash', async () => {
    FSL.fetchListOnceForHistory.mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));
    const r = await render();
    expect(alertMock.mock.calls.map(c => c[1])).not.toContain(GENERIC);
    expect(allText(r)).toContain('not on this phone yet');
  });

  it('BL5 list arrives on the 3rd Firebase try (~4.5 s): trip renders, one Firebase read per try', async () => {
    jest.useFakeTimers();
    FSL.fetchListOnceForHistory.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(remoteList());
    const r = await render();
    await act(async () => { await jest.advanceTimersByTimeAsync(1500); });
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    expect(FSL.fetchListOnceForHistory).toHaveBeenCalledTimes(3);
    expect(allText(r)).toContain('Big shop');
    expect(allText(r)).toContain('Milk');
  });

  it('BL6 Firebase items empty and none local: renders the empty-trip text, never crashes', async () => {
    FSL.fetchListOnceForHistory.mockResolvedValue(remoteList());
    FSL.fetchItemsOnceForHistory.mockResolvedValue([]);
    const r = await render();
    expect(allText(r)).toContain('completed without any items');
  });

  it('BL7 item price NaN / Infinity / "abc" from sync: shows "+ set price", no crash', async () => {
    FSL.fetchListOnceForHistory.mockResolvedValue(remoteList({ totalAmount: Number.NaN }));
    FSL.fetchItemsOnceForHistory.mockResolvedValue([
      { ...milk, id: 'n', price: Number.NaN }, { ...milk, id: 'i', name: 'Eggs', price: Infinity },
      { ...milk, id: 's', name: 'Bread', price: 'abc' },
    ]);
    const r = await render();
    expect(allText(r)).toContain('Bread');
    expect(allText(r)).not.toContain('NaN');
  });

  it('BL8 signed out mid-load (user → null): no alert, no write', async () => {
    jest.useFakeTimers();
    const r = await render();
    mockUser = null;
    await act(async () => { r.update(<HistoryDetailScreen />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    expect(alertMock).not.toHaveBeenCalled();
    expect(SLM.updateList).not.toHaveBeenCalled();
  });
});

describe('Codex P2 on d397568: push beats the completion sync', () => {
  it('BL9 Firebase has it ACTIVE first, COMPLETED on the next try: keeps retrying and shows the completion date', async () => {
    jest.useFakeTimers();
    const created = 1_700_000_000_000; // 14/11/2023
    const completed = 1_762_000_000_000; // 01/11/2025
    FSL.fetchListOnceForHistory
      .mockResolvedValueOnce(remoteList({ status: 'active', completedAt: null as unknown as number, createdAt: created } as never))
      .mockResolvedValue(remoteList({ createdAt: created, completedAt: completed } as never));
    const r = await render();
    await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
    expect(FSL.fetchListOnceForHistory.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(allText(r)).toContain(new Date(completed).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    expect(SLM.updateList).not.toHaveBeenCalled();
  });
});

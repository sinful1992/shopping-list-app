// Task 121: the wife tapped the "receipt scanned" push and got "Something went wrong".
// The push opens familyshoppinglist://history/<listId> straight into this screen.
// These tests pin what that screen must survive when opened that way.
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import type { Item, ShoppingList } from '../../../models/types';
import HistoryDetailScreen from '../HistoryDetailScreen';

jest.setTimeout(30000);

const mockNav = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { listId: 'list-1' } }),
  useNavigation: () => mockNav,
}));
jest.mock('../../../contexts/AlertContext', () => { const a = { showAlert: jest.fn() }; return { useAlert: () => a }; });
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../../../styles/theme').DARK_THEME }),
}));
jest.mock('../../../components/PriceEditModal', () => 'PriceEditModal');
jest.mock('../../../components/PriceHistoryModal', () => 'PriceHistoryModal');
jest.mock('../../../services/HistoryTracker', () => ({ __esModule: true, default: { getListDetails: jest.fn() } }));
jest.mock('../../../services/ItemManager', () => ({ __esModule: true, default: { updateItem: jest.fn() } }));
jest.mock('../../../services/FirebaseSyncListener', () => ({ __esModule: true, default: { fetchItemsOnceForHistory: jest.fn(async () => []) } }));
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: { updateList: jest.fn(), deleteList: jest.fn() } }));
jest.mock('../../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getSmartSuggestions: jest.fn(async () => new Map()), getPriceStats: jest.fn(async () => null) },
}));

const HistoryTracker = jest.requireMock('../../../services/HistoryTracker').default;
const FSL = jest.requireMock('../../../services/FirebaseSyncListener').default;
const PHS = jest.requireMock('../../../services/PriceHistoryService').default;
const alertMock = jest.requireMock('../../../contexts/AlertContext').useAlert().showAlert as jest.Mock;

const GENERIC = 'Something went wrong. Please try again.';
const item = (over: Partial<Item>): Item => ({ id: 'i', listId: 'list-1', name: 'x', checked: true, price: null, unitQty: null, ...over } as Item);
const baseList = (over: Partial<ShoppingList> = {}): ShoppingList => ({
  id: 'list-1', name: 'Tesco', familyGroupId: 'fam-1', status: 'completed', completedAt: 1_762_000_000_000,
  receiptData: null, receiptUrl: null, totalAmount: 12.5, storeName: 'Tesco', ...over,
} as ShoppingList);

const flat = (c: unknown): string => Array.isArray(c) ? c.map(flat).join('') : (typeof c === 'string' || typeof c === 'number') ? String(c) : '';
const allText = (r: ReactTestRenderer) => r.root.findAll(n => typeof n.type === 'string' || (n.type as unknown) === 'Text')
  .map(n => flat(n.props.children)).join('|');

// Unmount every screen after its test: a screen left mounted keeps its
// Firebase retries (1.5 s, 3 s) running into the next test's shared mocks.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { mounted.splice(0).forEach(m => m.unmount()); });
});

async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<HistoryDetailScreen />); });
  mounted.push(r);
  // let the price-stats effect and any retry settle
  await act(async () => { await new Promise(res => setTimeout(res, 0)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  FSL.fetchItemsOnceForHistory.mockImplementation(async () => []);
  PHS.getSmartSuggestions.mockImplementation(async () => new Map());
  PHS.getPriceStats.mockImplementation(async () => null);
});

describe('opened from the receipt-scanned push (task 121)', () => {
  it('P1 list not in the local DB yet (cold start, sync not done): no generic "Something went wrong"', async () => {
    // HistoryTracker.getListDetails wraps LocalStorageManager.getList → null as this message.
    HistoryTracker.getListDetails.mockRejectedValue(new Error('Failed to get list details: List not found'));
    await render();
    const shown = alertMock.mock.calls.map(c => `${c[0]}: ${c[1]}`);
    expect(shown).not.toContain(`Error: ${GENERIC}`);
  });

  it('P2 rescanned trip: item list from Firebase has a nameless item → screen still renders', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({ list: baseList(), items: [], receiptData: null });
    FSL.fetchItemsOnceForHistory.mockResolvedValue([
      item({ id: 'a', name: 'Milk', price: 1.2 }),
      item({ id: 'b', name: undefined as unknown as string, price: 2 }),
    ]);
    const r = await render();
    expect(allText(r)).toContain('Tesco');
    expect(allText(r)).toContain('Milk');
  });

  it('P3 price or total stored as a numeric string (old client / console edit) → no crash, shows £ values', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({
      list: baseList({ totalAmount: '12.5' as unknown as number }),
      items: [item({ id: 'a', name: 'Milk', price: '1.2' as unknown as number })],
      receiptData: null,
    });
    const r = await render();
    expect(allText(r)).toContain('Total: £12.50');
    expect(allText(r)).toContain('£1.20');
  });

  it('P4 price history with one-off entries (priceHistory[-2] missing) does not crash the Purchased row', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({
      list: baseList(), items: [item({ id: 'a', name: 'Milk', price: 1.2 })], receiptData: null,
    });
    PHS.getPriceStats.mockResolvedValue({ priceHistory: [{ price: 1.0 }, undefined, { price: 1.2 }].slice(1) });
    const r = await render();
    expect(allText(r)).toContain('Milk');
  });

  it('P5 completedAt missing on a twice-completed list still renders a date, not "Invalid Date"', async () => {
    HistoryTracker.getListDetails.mockResolvedValue({
      list: baseList({ completedAt: null as unknown as number }), items: [item({ id: 'a', name: 'Milk' })], receiptData: null,
    });
    const r = await render();
    expect(allText(r)).not.toContain('Invalid Date');
  });
});

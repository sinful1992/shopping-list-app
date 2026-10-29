/**
 * Typing a missing price in History (task 100, review #4): a trip with a scanned
 * receipt keeps the receipt's total, and a trip without one is totalled like
 * the running total (ticked items only, price × unit count).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import type { Item, ShoppingList } from '../../../models/types';
import HistoryDetailScreen from '../HistoryDetailScreen';

jest.setTimeout(30000);

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { listId: 'list-1' } }),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }),
}));
jest.mock('../../../contexts/AlertContext', () => {
  const alert = { showAlert: jest.fn() };
  return { useAlert: () => alert };
});
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../../../styles/theme').DARK_THEME }),
}));
jest.mock('../../../components/PriceEditModal', () => 'PriceEditModal');
jest.mock('../../../components/PriceHistoryModal', () => 'PriceHistoryModal');
jest.mock('../../../services/HistoryTracker', () => ({ __esModule: true, default: { getListDetails: jest.fn() } }));
jest.mock('../../../services/ItemManager', () => ({ __esModule: true, default: { updateItem: jest.fn(async () => undefined) } }));
jest.mock('../../../services/FirebaseSyncListener', () => ({
  __esModule: true,
  default: { fetchItemsOnceForHistory: jest.fn(async () => []) },
}));
jest.mock('../../../services/ShoppingListManager', () => ({
  __esModule: true,
  default: { updateList: jest.fn(async () => undefined), deleteList: jest.fn() },
}));
jest.mock('../../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getSmartSuggestions: jest.fn(async () => new Map()), getPriceStats: jest.fn(async () => null) },
}));

const HistoryTracker = jest.requireMock('../../../services/HistoryTracker').default;
const ShoppingListManager = jest.requireMock('../../../services/ShoppingListManager').default;

const item = (over: Partial<Item>): Item => ({
  id: 'i', listId: 'list-1', name: 'x', checked: true, price: null, unitQty: null, ...over,
} as Item);

const items = [
  item({ id: 'eggs', name: 'Eggs', price: 2.5, unitQty: 2 }),
  item({ id: 'milk', name: 'Milk', price: null }),
  item({ id: 'cake', name: 'Cake', price: 9, checked: false }),
];

async function render(list: Partial<ShoppingList>): Promise<ReactTestRenderer> {
  HistoryTracker.getListDetails.mockResolvedValue({
    list: { id: 'list-1', name: 'Tesco', familyGroupId: null, receiptData: null, ...list },
    items,
    receiptData: list.receiptData ?? null,
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<HistoryDetailScreen />);
  });
  return renderer;
}

async function typeMilkPrice(renderer: ReactTestRenderer, price: number) {
  const modal = renderer.root.find(n => (n.type as unknown) === 'PriceEditModal');
  await act(async () => {
    await modal.props.onSave('milk', { price });
  });
}

beforeEach(() => jest.clearAllMocks());

it('keeps the receipt total when a trip has a scanned receipt', async () => {
  const renderer = await render({ totalAmount: 23.4, receiptData: { lineItems: [{ description: 'Milk', price: 1.2 }] } as never });
  await typeMilkPrice(renderer, 1.2);
  expect(ShoppingListManager.updateList).not.toHaveBeenCalled();
});

it('totals a trip without a receipt from ticked items times their unit count', async () => {
  const renderer = await render({ totalAmount: 5 });
  await typeMilkPrice(renderer, 1.2);
  // Eggs 2.50 × 2 + Milk 1.20; the unticked Cake is not counted
  expect(ShoppingListManager.updateList).toHaveBeenCalledTimes(1);
  expect(ShoppingListManager.updateList.mock.calls[0][1].totalAmount).toBeCloseTo(6.2);
});

it('backfills a missing total from ticked items only', async () => {
  await render({ totalAmount: null });
  expect(ShoppingListManager.updateList).toHaveBeenCalledWith('list-1', { totalAmount: 5 });
});

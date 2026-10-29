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
const ItemManager = jest.requireMock('../../../services/ItemManager').default;
const SLM = jest.requireMock('../../../services/ShoppingListManager').default;

const item = (over: Partial<Item>): Item => ({ id: 'i', listId: 'list-1', name: 'x', checked: true, price: null, unitQty: null, ...over } as Item);

// Stateful store so the reload after a save sees what was written
let list: ShoppingList;
let items: Item[];

function setup(l: Partial<ShoppingList>, its: Item[]) {
  list = { id: 'list-1', name: 'Tesco', familyGroupId: null, receiptData: null, totalAmount: null, ...l } as ShoppingList;
  items = its;
  HistoryTracker.getListDetails.mockImplementation(async () => ({ list: { ...list }, items: items.map(i => ({ ...i })), receiptData: list.receiptData }));
  ItemManager.updateItem.mockImplementation(async (id: string, u: Partial<Item>) => { items = items.map(i => (i.id === id ? { ...i, ...u } : i)); });
  SLM.updateList.mockImplementation(async (_id: string, u: Partial<ShoppingList>) => { list = { ...list, ...u }; });
}

async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<HistoryDetailScreen />); });
  return r;
}
async function setPrice(r: ReactTestRenderer, id: string, price: number | null) {
  const modal = r.root.find(n => (n.type as unknown) === 'PriceEditModal');
  await act(async () => { await modal.props.onSave(id, { price }); });
}
const shownTotal = (r: ReactTestRenderer) => {
  const flat = (c: unknown): string => Array.isArray(c) ? c.map(flat).join('') : (typeof c === 'string' || typeof c === 'number') ? String(c) : '';
  return r.root.findAll(n => flat(n.props.children).includes('Total: £')).map(n => flat(n.props.children))[0];
};

// receiptData exactly as ShoppingListManager.completeShoppingFast writes it for a trip finished WITHOUT a scan
const fastCompleteReceipt = { subtotal: null, lineItems: [], discounts: [], totalDiscount: null, vatBreakdown: [], store: null, extractedAt: 1, confidence: 1 };

beforeEach(() => jest.clearAllMocks());

it('H1 receipt present, totalAmount null: load backfill must not write a sum, edit keeps receipt list untouched', async () => {
  setup({ receiptData: { ...fastCompleteReceipt, lineItems: [{ description: 'Eggs', quantity: 1, unitPrice: 5, price: 5 }] } as never },
    [item({ id: 'eggs', price: 2.5, unitQty: 2 }), item({ id: 'milk' })]);
  const r = await render();
  SLM.updateList.mockClear();
  await setPrice(r, 'milk', 1.2);
  expect(SLM.updateList).not.toHaveBeenCalled();
});

it('H2 unitQty counted: ticked eggs 2.50 x 3 + milk 1.20 = 8.70', async () => {
  setup({ totalAmount: 7.5 }, [item({ id: 'eggs', price: 2.5, unitQty: 3 }), item({ id: 'milk' })]);
  const r = await render();
  await setPrice(r, 'milk', 1.2);
  expect(SLM.updateList).toHaveBeenCalledTimes(1);
  expect(SLM.updateList.mock.calls[0][1].totalAmount).toBeCloseTo(8.7);
});

it('H3 pricing an unticked item does not change the total', async () => {
  setup({ totalAmount: 5 }, [item({ id: 'eggs', price: 5 }), item({ id: 'cake', checked: false })]);
  const r = await render();
  await setPrice(r, 'cake', 9);
  expect(SLM.updateList).not.toHaveBeenCalled();
});

it('H4 empty list with null total: no backfill write, shows £0.00', async () => {
  setup({ totalAmount: null }, []);
  const r = await render();
  expect(SLM.updateList).not.toHaveBeenCalled();
  expect(shownTotal(r)).toContain('0.00');
});

it('H5 clearing a price on a no-receipt trip lowers the total', async () => {
  setup({ totalAmount: 6 }, [item({ id: 'eggs', price: 5 }), item({ id: 'milk', price: 1 })]);
  const r = await render();
  await setPrice(r, 'milk', null);
  expect(SLM.updateList).toHaveBeenCalledWith('list-1', { totalAmount: 5 });
});

it('H6 trip completed WITHOUT a scan (completeShoppingFast receiptData) picks up a typed price', async () => {
  setup({ totalAmount: 5, receiptData: fastCompleteReceipt as never }, [item({ id: 'eggs', price: 2.5, unitQty: 2 }), item({ id: 'milk' })]);
  const r = await render();
  await setPrice(r, 'milk', 1.2);
  expect(SLM.updateList).toHaveBeenCalledWith('list-1', { totalAmount: expect.closeTo(6.2) });
});

it('H7 unticked items with prices only, null total: backfill writes 0 (old code wrote the sum)', async () => {
  setup({ totalAmount: null }, [item({ id: 'cake', checked: false, price: 9 })]);
  const r = await render();
  expect(SLM.updateList).toHaveBeenCalledWith('list-1', { totalAmount: 0 });
  expect(shownTotal(r)).toContain('0.00');
});

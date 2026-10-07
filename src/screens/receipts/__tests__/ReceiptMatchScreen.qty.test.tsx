/**
 * The receipt-match screen shows a counted line's quantity (task 27): "2 ×"
 * before the description, on a line linked to a list item and on one that is
 * not, keyed by the line's index in receiptData.lineItems.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { Item, ReceiptData } from '../../../models/types';
import ReceiptMatchScreen from '../ReceiptMatchScreen';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
// One route and one navigation object for every render, as the real hooks
// give: a new object each time would re-run the screen's effects forever.
jest.mock('@react-navigation/native', () => {
  const route = { params: { listId: 'list-1' } };
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) };
  return { useRoute: () => route, useNavigation: () => navigation };
});
jest.mock('../../../contexts/AlertContext', () => {
  const alert = { showAlert: jest.fn() };
  return { useAlert: () => alert };
});
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../../../styles/theme').DARK_THEME }),
}));
jest.mock('../../../contexts/UserContext', () => {
  const user = { uid: 'user-1' };
  return { useUser: () => user };
});
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: { getListById: jest.fn() } }));
jest.mock('../../../services/ItemManager', () => ({ __esModule: true, default: { getItemsForList: jest.fn() } }));
jest.mock('../../../services/NotificationManager', () => ({ __esModule: true, default: {} }));
jest.mock('../../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));
jest.mock('../../../services/CategoryHistoryService', () => ({ __esModule: true, default: {} }));
jest.mock('../../../services/LocalStorageManager', () => ({
  __esModule: true,
  default: { getReceiptAliases: jest.fn(async () => new Map()) },
}));

const ShoppingListManager = jest.requireMock('../../../services/ShoppingListManager').default;
const ItemManager = jest.requireMock('../../../services/ItemManager').default;

const tescoReceipt = {
  lineItems: [
    { description: 'Tesco Semi Skimmed Milk 2.272L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
    { description: 'Tesco Salami Slices 12 Pack 100g', quantity: 2, unitPrice: 1.1, price: 2.2, vatCode: null },
    { description: 'Tesco Diced Chorizo 130g', quantity: 2, unitPrice: 2.55, price: 5.1, vatCode: null },
    { description: 'Bananas Loose', quantity: 0.456, unitPrice: null, price: 0.62, vatCode: null },
  ],
  discounts: [],
} as unknown as ReceiptData;

const SALAMI = 1;
const CHORIZO = 2;

const listItem = (id: string, name: string): Item => ({
  id, listId: 'list-1', name, quantity: null, price: null, checked: false,
  createdBy: 'user-1', createdAt: 0, updatedAt: 0, syncStatus: 'synced',
} as Item);

async function render(items: Item[]): Promise<ReactTestRenderer> {
  ShoppingListManager.getListById.mockResolvedValue({
    id: 'list-1', name: 'Tesco', familyGroupId: 'fam-1', currency: '£',
    merchantName: 'Tesco', purchaseDate: '07/10/2026', totalAmount: 9.57, receiptData: tescoReceipt,
  });
  ItemManager.getItemsForList.mockResolvedValue(items);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReceiptMatchScreen />);
  });
  return renderer;
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

function qtyElements(renderer: ReactTestRenderer): Map<number, ReactTestInstance> {
  const found = new Map<number, ReactTestInstance>();
  renderer.root.findAll(n => n.type === Text && /^receipt-line-qty-\d+$/.test(String(n.props.testID)))
    .forEach(n => found.set(Number(String(n.props.testID).replace('receipt-line-qty-', '')), n));
  return found;
}

/** The nearest ancestor whose text holds the line's description: its row. */
function rowText(qty: ReactTestInstance, description: string): string {
  let row: ReactTestInstance | null = qty.parent;
  while (row && !textOf(row).includes(description)) row = row.parent;
  if (!row) throw new Error(`no row holds ${description}`);
  return textOf(row);
}

describe('ReceiptMatchScreen line quantity', () => {
  test('salami linked to a list item and chorizo unlinked both show "2 ×"', async () => {
    const renderer = await render([listItem('salami', 'Tesco Salami Slices 12 Pack 100g')]);
    // The setup this test relies on: salami matched, chorizo not.
    expect(textOf(renderer.root)).toContain('1 of 4 lines matched');
    const qty = qtyElements(renderer);
    expect([...qty.keys()].sort()).toEqual([SALAMI, CHORIZO]);
    expect(textOf(qty.get(SALAMI)!)).toBe('2 ×');
    expect(textOf(qty.get(CHORIZO)!)).toBe('2 ×');
  });

  test('the count comes before the description on its own line', async () => {
    const qty = qtyElements(await render([listItem('salami', 'Tesco Salami Slices 12 Pack 100g')]));
    const salami = rowText(qty.get(SALAMI)!, 'Tesco Salami Slices');
    expect(salami.indexOf('2 ×')).toBeLessThan(salami.indexOf('Tesco Salami Slices'));
    expect(salami).not.toContain('Chorizo');
    const chorizo = rowText(qty.get(CHORIZO)!, 'Tesco Diced Chorizo');
    expect(chorizo.indexOf('2 ×')).toBeLessThan(chorizo.indexOf('Tesco Diced Chorizo'));
  });

  test('with nothing on the list, counted lines still show their count', async () => {
    const qty = qtyElements(await render([]));
    expect([...qty.keys()].sort()).toEqual([SALAMI, CHORIZO]);
  });

  test('the linked line still says what Apply will set: ×2 at the per-unit price', async () => {
    const renderer = await render([listItem('salami', 'Tesco Salami Slices 12 Pack 100g')]);
    expect(textOf(renderer.root)).toContain('×2 at £1.10');
  });
});

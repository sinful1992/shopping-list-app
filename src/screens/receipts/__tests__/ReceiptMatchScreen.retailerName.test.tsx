/**
 * A receipt line added as a new item is named without the shop's name the
 * till prints in front of own-brand products (task 70). "Tesco Semi Skimmed
 * Milk" and "Sainsbury's Semi Skimmed Milk" then key as one item, so their
 * prices are compared. The store-free default is not remembered as an alias;
 * only a name the family typed is.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ReceiptData } from '../../../models/types';
import ReceiptMatchScreen from '../ReceiptMatchScreen';

jest.setTimeout(30000);

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
jest.mock('@react-navigation/native', () => {
  const route = { params: { listId: 'list-1', autoAddAll: true } };
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
  const user = { uid: 'user-1', displayName: 'Tester' };
  return { useUser: () => user };
});
jest.mock('../../../services/ShoppingListManager', () => ({
  __esModule: true,
  default: { getListById: jest.fn(), deleteList: jest.fn(), updateList: jest.fn(async () => ({})) },
}));
jest.mock('../../../services/ItemManager', () => ({
  __esModule: true,
  default: {
    getItemsForList: jest.fn(async () => []),
    addItemsBatch: jest.fn(async () => []),
    updateItemsBatch: jest.fn(async () => []),
    recordPurchase: jest.fn(),
  },
}));
jest.mock('../../../services/NotificationManager', () => ({
  __esModule: true,
  default: { notifyReceiptScanned: jest.fn(async () => undefined) },
}));
jest.mock('../../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));
jest.mock('../../../services/CategoryHistoryService', () => ({
  __esModule: true,
  default: { getSuggestedCategory: jest.fn(async () => null) },
}));
jest.mock('../../../services/LocalStorageManager', () => ({
  __esModule: true,
  default: {
    getReceiptAliases: jest.fn(async () => new Map()),
    saveReceiptAliases: jest.fn(async () => undefined),
  },
}));

const ShoppingListManager = jest.requireMock('../../../services/ShoppingListManager').default;
const ItemManager = jest.requireMock('../../../services/ItemManager').default;
const LocalStorageManager = jest.requireMock('../../../services/LocalStorageManager').default;

const receipt = {
  lineItems: [
    { description: 'Tesco Semi Skimmed Milk 2.272L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
    { description: "Sainsbury's Wholemeal Bread", quantity: 1, unitPrice: 1.2, price: 1.2, vatCode: null },
    { description: 'Bananas Loose', quantity: 1, unitPrice: 0.62, price: 0.62, vatCode: null },
  ],
  discounts: [],
} as unknown as ReceiptData;

async function render(): Promise<ReactTestRenderer> {
  ShoppingListManager.getListById.mockResolvedValue({
    id: 'list-1', name: '20 October 2026', familyGroupId: 'fam-1', currency: '£',
    merchantName: 'Tesco', totalAmount: 3.47, receiptData: receipt, status: 'active',
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReceiptMatchScreen />);
  });
  return renderer;
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

function apply(renderer: ReactTestRenderer): Promise<void> {
  const button = renderer.root.findAll(n => typeof n.props.onPress === 'function' && /^(Apply|Add|Complete)/.test(textOf(n)))[0];
  if (!button) throw new Error('no Apply button');
  return act(async () => { await button.props.onPress(); });
}

const addedNames = (): string[] =>
  ItemManager.addItemsBatch.mock.calls[0][1].map((i: { name: string }) => i.name);

const savedAliases = (): Array<{ receiptKey: string; itemName: string }> =>
  LocalStorageManager.saveReceiptAliases.mock.calls[0][1];

beforeEach(() => {
  jest.clearAllMocks();
  LocalStorageManager.getReceiptAliases.mockResolvedValue(new Map());
});

describe('receipt lines added as items drop the shop name', () => {
  test('the name field offers the store-free name', async () => {
    const renderer = await render();
    const values = renderer.root.findAllByType(TextInput).map(n => n.props.value);
    expect(values).toEqual(expect.arrayContaining(['Semi Skimmed Milk 2.272L', 'Wholemeal Bread', 'Bananas Loose']));
    expect(values).not.toContain('Tesco Semi Skimmed Milk 2.272L');
  });

  test('Apply adds the items under the store-free names', async () => {
    await apply(await render());
    expect(addedNames()).toEqual(['Semi Skimmed Milk 2.272L', 'Wholemeal Bread', 'Bananas Loose']);
  });

  test('the store-free default is not saved as an alias', async () => {
    await apply(await render());
    expect(savedAliases()).toEqual([]);
  });

  test('a name the family typed is remembered under the printed line', async () => {
    const renderer = await render();
    const bread = renderer.root.findAllByType(TextInput).find(n => n.props.value === 'Wholemeal Bread');
    if (!bread) throw new Error('no name field for the bread line');
    await act(async () => { bread.props.onChangeText('Brown Bread'); });
    await apply(renderer);
    expect(addedNames()).toContain('Brown Bread');
    expect(savedAliases()).toEqual([{ receiptKey: "sainsbury's wholemeal bread", itemName: 'Brown Bread' }]);
  });

  test('a remembered alias still wins over the store-free name', async () => {
    LocalStorageManager.getReceiptAliases.mockResolvedValue(new Map([['tesco semi skimmed milk 2.272l', 'Milk']]));
    await apply(await render());
    expect(addedNames()).toContain('Milk');
    expect(addedNames()).not.toContain('Semi Skimmed Milk 2.272L');
  });

  test('typing the store-free name over a wrong remembered name replaces it', async () => {
    LocalStorageManager.getReceiptAliases.mockResolvedValue(new Map([['tesco semi skimmed milk 2.272l', 'Oat Milk']]));
    const renderer = await render();
    const milk = renderer.root.findAllByType(TextInput).find(n => n.props.value === 'Oat Milk');
    if (!milk) throw new Error('no name field for the milk line');
    await act(async () => { milk.props.onChangeText('Semi Skimmed Milk 2.272L'); });
    await apply(renderer);
    expect(addedNames()).toContain('Semi Skimmed Milk 2.272L');
    expect(savedAliases()).toEqual([{ receiptKey: 'tesco semi skimmed milk 2.272l', itemName: 'Semi Skimmed Milk 2.272L' }]);
  });

  test('keeping the remembered name saves nothing new', async () => {
    LocalStorageManager.getReceiptAliases.mockResolvedValue(new Map([['tesco semi skimmed milk 2.272l', 'Milk']]));
    await apply(await render());
    expect(savedAliases()).toEqual([]);
  });
});

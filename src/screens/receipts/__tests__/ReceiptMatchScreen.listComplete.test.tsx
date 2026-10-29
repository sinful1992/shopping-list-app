/**
 * A receipt scanned on a list from its Attach Receipt Photo button finishes
 * the trip on Apply (task 99). Before 1.53.0 only the Home quick scan did, so
 * a list scanned after shopping stayed active with its prices filled in.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ReceiptData } from '../../../models/types';
import ReceiptMatchScreen from '../ReceiptMatchScreen';

jest.setTimeout(30000);

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
jest.mock('@react-navigation/native', () => {
  const route = { params: { listId: 'list-1', completeOnApply: true } };
  const listeners: Record<string, Array<() => void>> = {};
  const navigation = {
    listeners,
    goBack: jest.fn(() => (listeners.beforeRemove ?? []).slice().forEach(l => l())),
    navigate: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn((event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
      return () => { listeners[event] = listeners[event].filter(l => l !== cb); };
    }),
  };
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
  default: {
    getListById: jest.fn(),
    deleteList: jest.fn(),
    updateList: jest.fn(),
    completeFromReceipt: jest.fn(),
    createList: jest.fn(),
  },
}));
jest.mock('../../../services/ItemManager', () => ({
  __esModule: true,
  default: {
    getItemsForList: jest.fn(),
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
const NotificationManager = jest.requireMock('../../../services/NotificationManager').default;
const { showAlert } = jest.requireMock('../../../contexts/AlertContext').useAlert();
const navigation = jest.requireMock('@react-navigation/native').useNavigation();
const route = jest.requireMock('@react-navigation/native').useRoute();

const receipt = {
  lineItems: [
    { description: 'Milk 2L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
  ],
  discounts: [],
} as unknown as ReceiptData;

const milk = { id: 'item-milk', listId: 'list-1', name: 'Milk 2L', checked: false, price: null, quantity: null, category: 'Dairy' };
const eggs = { id: 'item-eggs', listId: 'list-1', name: 'Eggs', checked: false, price: null, quantity: '12', unitQty: 2, category: 'Dairy' };

/**
 * The list holds `items` when the screen opens; Apply checks off what the
 * receipt matched, so `afterApply` is what the list holds once it has.
 */
async function render(
  items: object[],
  afterApply: object[],
  status: 'active' | 'completed' = 'active',
): Promise<ReactTestRenderer> {
  ShoppingListManager.getListById.mockResolvedValue({
    id: 'list-1', name: 'Weekly shop', familyGroupId: 'fam-1', currency: '£',
    merchantName: 'Tesco', totalAmount: 1.65, receiptData: receipt, status,
    isLocked: true, lockedBy: 'user-1',
  });
  ItemManager.getItemsForList.mockResolvedValueOnce(items).mockResolvedValue(afterApply);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReceiptMatchScreen />);
  });
  return renderer;
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

function press(renderer: ReactTestRenderer, label: RegExp): Promise<void> {
  const button = renderer.root.findAll(n => typeof n.props.onPress === 'function' && label.test(textOf(n)))[0];
  if (!button) throw new Error(`no button ${label}`);
  return act(async () => { await button.props.onPress(); });
}

/** Presses a button of the last alert shown. */
async function choose(text: string): Promise<void> {
  const buttons = showAlert.mock.calls[showAlert.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => unknown }>;
  const button = buttons.find(b => b.text === text);
  if (!button) throw new Error(`no alert button ${text}`);
  await act(async () => { await button.onPress?.(); });
}

const APPLY = /^(Apply|Update|Add|Done|Save|Try again)/;

const lastAlert = () => showAlert.mock.calls[showAlert.mock.calls.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(navigation.listeners).forEach(k => delete navigation.listeners[k]);
  route.params = { listId: 'list-1', completeOnApply: true };
  ShoppingListManager.updateList.mockResolvedValue({});
  ShoppingListManager.completeFromReceipt.mockResolvedValue({});
  ShoppingListManager.createList.mockResolvedValue({ id: 'list-2' });
  ItemManager.updateItemsBatch.mockImplementation(async (updates: Array<{ id: string }>) =>
    updates.map(u => ({ ...milk, ...u, checked: true })));
});

describe('a receipt scanned on a list', () => {
  test('Apply with every item bought completes the list and goes back', async () => {
    const renderer = await render([milk], [{ ...milk, checked: true }]);
    await press(renderer, APPLY);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 0);
    expect(NotificationManager.notifyReceiptScanned).toHaveBeenCalledWith(expect.objectContaining({ listId: 'list-1' }));
    expect(lastAlert()[1]).toMatch(/Shopping completed/);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('completion never overwrites the receipt the scan saved', async () => {
    const renderer = await render([milk], [{ ...milk, checked: true }]);
    await press(renderer, APPLY);
    ShoppingListManager.updateList.mock.calls.forEach(([, patch]: [string, object]) => {
      expect(patch).not.toHaveProperty('totalAmount');
      expect(patch).not.toHaveProperty('merchantName');
      expect(patch).not.toHaveProperty('purchaseDate');
    });
  });

  test('an unchecked item offers Full Shop, Partial Shop and Cancel', async () => {
    const renderer = await render([milk, eggs], [{ ...milk, checked: true }, eggs]);
    await press(renderer, APPLY);
    expect(lastAlert()[0]).toBe('Items Not Bought');
    expect((lastAlert()[2] as Array<{ text: string }>).map(b => b.text)).toEqual(['Full Shop', 'Partial Shop', 'Cancel']);
    expect(ShoppingListManager.completeFromReceipt).not.toHaveBeenCalled();
  });

  test('Full Shop completes with the unchecked count', async () => {
    const renderer = await render([milk, eggs], [{ ...milk, checked: true }, eggs]);
    await press(renderer, APPLY);
    await choose('Full Shop');
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 1);
    expect(ShoppingListManager.createList).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Partial Shop completes and carries the unchecked items to a new list', async () => {
    const renderer = await render([milk, eggs], [{ ...milk, checked: true }, eggs]);
    await press(renderer, APPLY);
    await choose('Partial Shop');
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 1);
    expect(ShoppingListManager.createList).toHaveBeenCalledWith('Weekly shop', 'user-1', 'fam-1', expect.anything());
    expect(ItemManager.addItemsBatch).toHaveBeenCalledWith(
      'list-2',
      [{ name: 'Eggs', quantity: '12', price: undefined, unitQty: 2, category: 'Dairy' }],
      'user-1',
    );
    expect(lastAlert()[1]).toMatch(/1 item carried to a new list/);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Cancel keeps the list open and leaves the screen', async () => {
    const renderer = await render([milk, eggs], [{ ...milk, checked: true }, eggs]);
    await press(renderer, APPLY);
    await choose('Cancel');
    expect(ShoppingListManager.completeFromReceipt).not.toHaveBeenCalled();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Match again on a completed list never completes it again', async () => {
    const renderer = await render([milk], [{ ...milk, checked: true }], 'completed');
    await press(renderer, APPLY);
    expect(ShoppingListManager.completeFromReceipt).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('a failed completion keeps the screen and the list active', async () => {
    ShoppingListManager.completeFromReceipt.mockRejectedValueOnce(new Error('db busy'));
    const renderer = await render([milk], [{ ...milk, checked: true }]);
    await press(renderer, APPLY);
    expect(lastAlert()[0]).toBe('Error');
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('Apply again after a failed completion retries it without writing the items twice', async () => {
    route.params = { listId: 'list-1', autoAddAll: true };
    ShoppingListManager.completeFromReceipt.mockRejectedValueOnce(new Error('db busy'));
    ItemManager.addItemsBatch.mockResolvedValue([{ ...milk, id: 'new-1', checked: true }]);
    const renderer = await render([], []);
    await press(renderer, APPLY);
    expect(navigation.goBack).not.toHaveBeenCalled();
    await press(renderer, APPLY);
    expect(ItemManager.addItemsBatch).toHaveBeenCalledTimes(1);
    expect(ItemManager.recordPurchase).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(2);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  // linus #7646: a retry used to skip every write, so a line ticked to add
  // between the two taps was never added while the alert said it was.
  test('after a failed completion the rows freeze and the retry only completes', async () => {
    ShoppingListManager.getListById.mockReset();
    const butterReceipt = {
      lineItems: [
        { description: 'Milk 2L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
        { description: 'Butter', quantity: 1, unitPrice: 2.1, price: 2.1, vatCode: null },
      ],
      discounts: [],
    } as unknown as ReceiptData;
    ShoppingListManager.completeFromReceipt.mockRejectedValueOnce(new Error('offline'));
    const renderer = await render([milk], [{ ...milk, checked: true }]);
    ShoppingListManager.getListById.mockResolvedValue({
      id: 'list-1', name: 'Weekly shop', familyGroupId: 'fam-1', currency: '£',
      merchantName: 'Tesco', totalAmount: 3.75, receiptData: butterReceipt, status: 'active',
    });
    ItemManager.getItemsForList.mockReset();
    ItemManager.getItemsForList.mockResolvedValueOnce([milk]).mockResolvedValue([{ ...milk, checked: true }]);
    let fresh!: ReactTestRenderer;
    await act(async () => { renderer.unmount(); fresh = create(<ReceiptMatchScreen />); });
    await press(fresh, APPLY);
    expect(ItemManager.updateItemsBatch).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();

    const frozenRows = fresh.root.findAll(n => n.props.pointerEvents === 'none');
    expect(frozenRows.length).toBeGreaterThan(0);
    expect(frozenRows.some(n => /Butter/.test(textOf(n)))).toBe(true);

    await press(fresh, /^Try again$/);
    expect(ItemManager.updateItemsBatch).toHaveBeenCalledTimes(1);
    expect(ItemManager.addItemsBatch).not.toHaveBeenCalled();
    expect(ItemManager.recordPurchase).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(2);
    expect(lastAlert()[1]).toBe('Updated 1 item · Shopping completed');
  });

  test('a write that fails after another landed retries only the one that failed', async () => {
    route.params = { listId: 'list-1', autoAddAll: true };
    ShoppingListManager.getListById.mockResolvedValue({
      id: 'list-1', name: 'Weekly shop', familyGroupId: 'fam-1', currency: '£',
      merchantName: 'Tesco', totalAmount: 3.75, status: 'active',
      receiptData: {
        lineItems: [
          { description: 'Milk 2L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
          { description: 'Butter', quantity: 1, unitPrice: 2.1, price: 2.1, vatCode: null },
        ],
        discounts: [],
      },
    });
    ItemManager.getItemsForList.mockResolvedValue([milk]);
    ItemManager.addItemsBatch.mockResolvedValue([{ ...milk, id: 'new-butter', name: 'Butter', checked: true }]);
    ItemManager.updateItemsBatch.mockRejectedValueOnce(new Error('db busy'));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<ReceiptMatchScreen />); });
    await press(renderer, APPLY);
    expect(ShoppingListManager.completeFromReceipt).not.toHaveBeenCalled();
    await press(renderer, /^Try again$/);
    expect(ItemManager.addItemsBatch).toHaveBeenCalledTimes(1);
    expect(ItemManager.updateItemsBatch).toHaveBeenCalledTimes(2);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Skip neither completes nor deletes the list', async () => {
    const renderer = await render([milk], [milk]);
    await press(renderer, /^Skip$/);
    expect(ShoppingListManager.completeFromReceipt).not.toHaveBeenCalled();
    expect(ShoppingListManager.updateList).not.toHaveBeenCalledWith('list-1', expect.objectContaining({ status: 'completed' }));
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });
});

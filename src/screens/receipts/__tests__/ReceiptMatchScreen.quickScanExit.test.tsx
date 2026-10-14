/**
 * A quick scan creates its list at Confirm, only to hold that receipt (task
 * 49). Leaving the match screen any way but Apply abandons it, so the list is
 * discarded: Skip, and also the header back, the hardware back and the swipe
 * gesture, which all reach the screen as a `beforeRemove` event. Before 1.50.1
 * only Skip discarded it, and every other way out left an empty active list
 * on Home.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ReceiptData } from '../../../models/types';
import ReceiptMatchScreen from '../ReceiptMatchScreen';

// A cold run transforms the whole screen tree first; the default 5 s timed
// out on the first run of the full suite (ada #3761).
jest.setTimeout(30000);

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
// One route and one navigation object for every render, as the real hooks
// give. goBack removes the screen the way the stack does: it fires
// beforeRemove first.
jest.mock('@react-navigation/native', () => {
  const route = { params: { listId: 'list-1', autoAddAll: true } };
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
  default: { getListById: jest.fn(), deleteList: jest.fn(), updateList: jest.fn() },
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
const navigation = jest.requireMock('@react-navigation/native').useNavigation();
const route = jest.requireMock('@react-navigation/native').useRoute();

const receipt = {
  lineItems: [
    { description: 'Milk 2L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
    { description: 'Bread', quantity: 1, unitPrice: 1.2, price: 1.2, vatCode: null },
  ],
  discounts: [],
} as unknown as ReceiptData;

async function render(receiptData: ReceiptData | null = receipt): Promise<ReactTestRenderer> {
  ShoppingListManager.getListById.mockResolvedValue({
    id: 'list-1', name: '15 October 2026', familyGroupId: 'fam-1', currency: '£',
    merchantName: 'Tesco', totalAmount: 2.85, receiptData, status: 'active',
  });
  ItemManager.getItemsForList.mockResolvedValue([]);
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

/** The header back, the hardware back or a swipe: the stack removes the screen. */
const leaveByBack = () => act(async () => {
  (navigation.listeners.beforeRemove ?? []).slice().forEach((l: () => void) => l());
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(navigation.listeners).forEach(k => delete navigation.listeners[k]);
  route.params = { listId: 'list-1', autoAddAll: true };
  ShoppingListManager.deleteList.mockResolvedValue(undefined);
  ShoppingListManager.updateList.mockResolvedValue({});
});

describe('quick-scan list is discarded on every way out but Apply', () => {
  test('Skip deletes the list once and goes back', async () => {
    const renderer = await render();
    await press(renderer, /^Skip$/);
    expect(ShoppingListManager.deleteList).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.deleteList).toHaveBeenCalledWith('list-1');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('back or swipe without Skip deletes the list', async () => {
    await render();
    await leaveByBack();
    expect(ShoppingListManager.deleteList).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.deleteList).toHaveBeenCalledWith('list-1');
  });

  test('back from the "no items found" state deletes the list', async () => {
    await render({ lineItems: [], discounts: [] } as unknown as ReceiptData);
    await leaveByBack();
    expect(ShoppingListManager.deleteList).toHaveBeenCalledWith('list-1');
  });

  test('Apply completes the list and leaving afterwards never deletes it', async () => {
    const renderer = await render();
    await press(renderer, /^(Apply|Add|Complete)/);
    expect(ShoppingListManager.updateList).toHaveBeenCalledWith('list-1', expect.objectContaining({ status: 'completed' }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    await leaveByBack();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('a failed Skip delete keeps the screen and a later back still discards', async () => {
    ShoppingListManager.deleteList.mockRejectedValueOnce(new Error('db busy'));
    const renderer = await render();
    await press(renderer, /^Skip$/);
    expect(navigation.goBack).not.toHaveBeenCalled();
    await leaveByBack();
    expect(ShoppingListManager.deleteList).toHaveBeenCalledTimes(2);
  });

  describe('an Apply that wrote the items and then failed', () => {
    async function failedApply(): Promise<ReactTestRenderer> {
      const written = [{ id: 'new-1', listId: 'list-1', name: 'Milk 2L', checked: true }];
      ItemManager.addItemsBatch.mockImplementationOnce(async () => {
        ItemManager.getItemsForList.mockResolvedValue(written);
        return written;
      });
      ShoppingListManager.updateList.mockRejectedValueOnce(new Error('db busy'));
      const renderer = await render();
      await press(renderer, /^(Apply|Add|Complete)/);
      expect(ItemManager.addItemsBatch).toHaveBeenCalledTimes(1);
      expect(navigation.goBack).not.toHaveBeenCalled();
      return renderer;
    }

    test('back afterwards keeps the list and its items', async () => {
      await failedApply();
      await leaveByBack();
      expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
    });

    test('Skip afterwards keeps the list and goes back', async () => {
      const renderer = await failedApply();
      await press(renderer, /^Skip$/);
      expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });
  });

  test('a match started from an existing list is never deleted on back', async () => {
    route.params = { listId: 'list-1' };
    const renderer = await render();
    await leaveByBack();
    await press(renderer, /^Skip$/);
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });
});

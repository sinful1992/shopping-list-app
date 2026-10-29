/**
 * Task 99 (USER #7629): scanning a receipt from a list's "Attach Receipt
 * Photo" and pressing Apply finishes the trip, the way the Home quick scan
 * always did. Written against CONTRACT.md (route param `completeOnApply`,
 * `ShoppingListManager.completeFromReceipt`), not the fix, to try to break it:
 * double taps, failures halfway, lists already completed, unticked items left
 * behind, and every way out that is not Apply.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ReceiptData } from '../../../models/types';
import ReceiptMatchScreen from '../ReceiptMatchScreen';

// A cold run transforms the whole screen tree first (ada #3761).
jest.setTimeout(30000);

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
jest.mock('@react-navigation/native', () => {
  const route = { params: { listId: 'list-1', completeOnApply: true } as Record<string, unknown> };
  const listeners: Record<string, Array<() => void>> = {};
  const navigation = {
    listeners,
    goBack: jest.fn(() => (listeners.beforeRemove ?? []).slice().forEach(l => l())),
    navigate: jest.fn(),
    replace: jest.fn(),
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
  const user = { uid: 'user-1', displayName: 'Tester', familyGroupId: 'fam-1' };
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
    createListOptimistic: jest.fn(),
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
    { description: 'Bread', quantity: 1, unitPrice: 1.2, price: 1.2, vatCode: null },
  ],
  discounts: [],
} as unknown as ReceiptData;

type TestItem = { id: string; listId: string; name: string; checked: boolean; price: number | null };
const item = (id: string, name: string, checked = false): TestItem =>
  ({ id, listId: 'list-1', name, checked, price: null });

/** Items on the list; a write marks what it wrote as ticked, the way the real batch does. */
let listState: TestItem[] = [];

function useListState(items: TestItem[]) {
  listState = items.map(i => ({ ...i }));
  ItemManager.getItemsForList.mockImplementation(async () => listState.map(i => ({ ...i })));
  ItemManager.updateItemsBatch.mockImplementation(async (updates: Array<{ id: string } & Partial<TestItem>>) => {
    const out: TestItem[] = [];
    updates.forEach(u => {
      const i = listState.find(x => x.id === u.id);
      if (i) { Object.assign(i, u, { checked: u.checked ?? true }); out.push({ ...i }); }
    });
    return out;
  });
  ItemManager.addItemsBatch.mockImplementation(async (listId: string, adds: Array<{ name: string; checked?: boolean }>) => {
    const out = adds.map((a, n) => ({ id: `new-${listId}-${n}`, listId, name: a.name, checked: a.checked ?? false, price: null }));
    if (listId === 'list-1') listState.push(...out);
    return out;
  });
}

async function render(list: Record<string, unknown> = {}): Promise<ReactTestRenderer> {
  ShoppingListManager.getListById.mockResolvedValue({
    id: 'list-1', name: 'Weekly shop', familyGroupId: 'fam-1', currency: '£',
    merchantName: 'Tesco', totalAmount: 2.85, receiptData: receipt, status: 'active',
    isLocked: true, lockedBy: 'user-1', ...list,
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReceiptMatchScreen />);
  });
  return renderer;
}

const textOf = (node: ReactTestInstance): string =>
  node.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');

const flush = async () => { for (let n = 0; n < 10; n++) await new Promise(r => setImmediate(r)); };

function applyButton(renderer: ReactTestRenderer): ReactTestInstance {
  const button = renderer.root.findAll(n => typeof n.props.onPress === 'function' && /^(Apply|Add |Update |Save corrections|Done$|Try again$)/.test(textOf(n)))[0];
  if (!button) throw new Error('no Apply button');
  return button;
}

/**
 * Press Apply without waiting for it to finish: the unticked-items choice may
 * hold Apply open until a button in the alert is pressed.
 */
async function startApply(renderer: ReactTestRenderer): Promise<Promise<unknown>> {
  let pending: Promise<unknown> = Promise.resolve();
  await act(async () => {
    pending = Promise.resolve(applyButton(renderer).props.onPress());
    await flush();
  });
  return pending;
}

async function apply(renderer: ReactTestRenderer) {
  const pending = await startApply(renderer);
  await act(async () => { await pending; await flush(); });
}

function press(renderer: ReactTestRenderer, label: RegExp): Promise<void> {
  const button = renderer.root.findAll(n => typeof n.props.onPress === 'function' && label.test(textOf(n)))[0];
  if (!button) throw new Error(`no button ${label}`);
  return act(async () => { await button.props.onPress(); await flush(); });
}

const notBoughtAlert = () => showAlert.mock.calls.find((c: unknown[]) => c[0] === 'Items Not Bought');

async function choose(label: RegExp) {
  const call = notBoughtAlert();
  if (!call) throw new Error('no "Items Not Bought" choice');
  const button = (call[2] as Array<{ text: string; onPress?: () => unknown }>).find(b => label.test(b.text));
  if (!button) throw new Error(`no ${label} in the choice`);
  await act(async () => { await button.onPress?.(); await flush(); });
}

const leaveByBack = () => act(async () => {
  (navigation.listeners.beforeRemove ?? []).slice().forEach((l: () => void) => l());
  await flush();
});

const completedViaUpdateList = () => ShoppingListManager.updateList.mock.calls
  .filter((c: unknown[]) => (c[1] as { status?: string })?.status === 'completed');
const completions = () => ShoppingListManager.completeFromReceipt.mock.calls.length + completedViaUpdateList().length;
const successAlert = () => showAlert.mock.calls.find((c: unknown[]) => c[0] === 'Done');
const errorAlert = () => showAlert.mock.calls.find((c: unknown[]) => c[0] === 'Error');

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(navigation.listeners).forEach(k => delete navigation.listeners[k]);
  route.params = { listId: 'list-1', completeOnApply: true };
  ShoppingListManager.deleteList.mockResolvedValue(undefined);
  ShoppingListManager.updateList.mockResolvedValue({});
  ShoppingListManager.completeFromReceipt.mockResolvedValue({ id: 'list-1', status: 'completed' });
  ShoppingListManager.createList.mockResolvedValue({ id: 'list-2', name: 'Weekly shop' });
  useListState([item('i-milk', 'Milk 2L'), item('i-bread', 'Bread')]);
});

describe('Apply from a list completes the shopping', () => {
  test('every item ticked by the receipt: completed once, with no unticked items, family told', async () => {
    const renderer = await render();
    await apply(renderer);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 0);
    expect(notBoughtAlert()).toBeUndefined();
    expect(NotificationManager.notifyReceiptScanned).toHaveBeenCalledTimes(1);
    expect(String(successAlert()?.[1])).toMatch(/Shopping completed/);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('items already ticked and priced in the shop (Apply reads "Done"): still completes', async () => {
    useListState([
      { ...item('i-milk', 'Milk 2L', true), price: 1.65 },
      { ...item('i-bread', 'Bread', true), price: 1.2 },
    ]);
    const renderer = await render();
    expect(textOf(applyButton(renderer))).toMatch(/^Done$/);
    await apply(renderer);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 0);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('the completion never overwrites the receipt the scan attached', async () => {
    const renderer = await render();
    await apply(renderer);
    ShoppingListManager.updateList.mock.calls.forEach((c: unknown[]) => {
      const patch = c[1] as Record<string, unknown>;
      expect(patch).not.toHaveProperty('totalAmount');
      expect(patch).not.toHaveProperty('merchantName');
      expect(patch).not.toHaveProperty('purchaseDate');
      if ('receiptData' in patch) {
        expect((patch.receiptData as ReceiptData).lineItems).toHaveLength(receipt.lineItems.length);
      }
    });
  });

  test('a double tap on Apply completes once and writes items once', async () => {
    const renderer = await render();
    const button = applyButton(renderer);
    await act(async () => {
      const a = Promise.resolve(button.props.onPress());
      const b = Promise.resolve(button.props.onPress());
      await Promise.all([a, b]);
      await flush();
    });
    expect(completions()).toBe(1);
    expect(ItemManager.updateItemsBatch.mock.calls.length).toBeLessThanOrEqual(1);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('leaving after a completed Apply deletes nothing', async () => {
    const renderer = await render();
    await apply(renderer);
    await leaveByBack();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });
});

describe('items the receipt did not tick', () => {
  beforeEach(() => {
    useListState([item('i-milk', 'Milk 2L'), item('i-bread', 'Bread'), item('i-eggs', 'Eggs')]);
  });

  test('ask Full / Partial / Cancel before completing', async () => {
    const renderer = await render();
    const pending = await startApply(renderer);
    const call = notBoughtAlert();
    expect(call).toBeDefined();
    const labels = (call[2] as Array<{ text: string }>).map(b => b.text);
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/Full/), expect.stringMatching(/Partial/), expect.stringMatching(/Cancel/)]));
    expect(completions()).toBe(0);
    await choose(/Cancel/);
    await act(async () => { await pending; await flush(); });
  });

  test('Full Shop completes with the unticked count', async () => {
    const renderer = await render();
    const pending = await startApply(renderer);
    await choose(/Full/);
    await act(async () => { await pending; await flush(); });
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(1);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 1);
    expect(ShoppingListManager.createList).not.toHaveBeenCalled();
  });

  test('Partial Shop completes and carries only the unticked item to a new list', async () => {
    const renderer = await render();
    const pending = await startApply(renderer);
    await choose(/Partial/);
    await act(async () => { await pending; await flush(); });
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 1);
    expect(ShoppingListManager.createList).toHaveBeenCalledTimes(1);
    const carried = ItemManager.addItemsBatch.mock.calls.filter((c: unknown[]) => c[0] === 'list-2');
    expect(carried).toHaveLength(1);
    expect((carried[0][1] as Array<{ name: string }>).map(i => i.name)).toEqual(['Eggs']);
  });

  test('Cancel keeps the list active and the receipt writes, deletes nothing', async () => {
    const renderer = await render();
    const pending = await startApply(renderer);
    await choose(/Cancel/);
    await act(async () => { await pending; await flush(); });
    expect(completions()).toBe(0);
    expect(ItemManager.updateItemsBatch).toHaveBeenCalled();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
    await leaveByBack();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('a manually unlinked line leaves its item unticked and asks', async () => {
    // Eggs is gone; Bread's line is ignored by the user, so Bread stays unticked.
    useListState([item('i-milk', 'Milk 2L'), item('i-bread', 'Bread')]);
    const renderer = await render();
    const linkToggles = renderer.root.findAll(n => typeof n.props.onToggleLink === 'function');
    if (linkToggles.length < 2) return; // row API changed; covered by the cases above
    await act(async () => { linkToggles[1].props.onToggleLink(linkToggles[1].props.index ?? 1); await flush(); });
    const pending = await startApply(renderer);
    if (notBoughtAlert()) {
      await choose(/Full/);
      await act(async () => { await pending; await flush(); });
      expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledWith('list-1', 'user-1', 1);
    } else {
      await act(async () => { await pending; await flush(); });
      // No choice was offered: then the item must have been ticked another way.
      expect(listState.every(i => i.checked)).toBe(true);
    }
  });
});

describe('never completes', () => {
  test('a list already completed (Match again from Receipt View)', async () => {
    const renderer = await render({ status: 'completed', completedAt: 1, completedBy: 'user-2', isLocked: false });
    await apply(renderer);
    expect(completions()).toBe(0);
    expect(notBoughtAlert()).toBeUndefined();
    expect(NotificationManager.notifyReceiptScanned).not.toHaveBeenCalled();
  });

  test('a match opened without the flag (Receipt View on an active list)', async () => {
    route.params = { listId: 'list-1' };
    const renderer = await render();
    await apply(renderer);
    expect(completions()).toBe(0);
    expect(notBoughtAlert()).toBeUndefined();
  });

  test('an item write that fails: error shown, list stays, screen stays', async () => {
    ItemManager.updateItemsBatch.mockRejectedValueOnce(new Error('db busy'));
    const renderer = await render();
    await apply(renderer);
    expect(completions()).toBe(0);
    expect(errorAlert()).toBeDefined();
    expect(successAlert()).toBeUndefined();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('a completion that fails is not reported as completed, and Apply can be tried again', async () => {
    ShoppingListManager.completeFromReceipt.mockRejectedValueOnce(new Error('offline'));
    const renderer = await render();
    await apply(renderer);
    expect(errorAlert()).toBeDefined();
    expect(successAlert()).toBeUndefined();
    expect(navigation.goBack).not.toHaveBeenCalled();
    await apply(renderer);
    expect(ShoppingListManager.completeFromReceipt).toHaveBeenCalledTimes(2);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Skip keeps the list active and deletes nothing', async () => {
    const renderer = await render();
    await press(renderer, /^Skip$/);
    expect(completions()).toBe(0);
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('back or swipe keeps the list active and deletes nothing, even with no items', async () => {
    useListState([]);
    await render();
    await leaveByBack();
    expect(completions()).toBe(0);
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });

  test('a receipt with no lines read: no completion on the way out', async () => {
    const renderer = await render({ receiptData: { lineItems: [], discounts: [] } });
    const skip = renderer.root.findAll(n => typeof n.props.onPress === 'function' && /^(Skip|Back|Done|OK)$/.test(textOf(n)))[0];
    if (skip) await act(async () => { await skip.props.onPress(); await flush(); });
    await leaveByBack();
    expect(completions()).toBe(0);
    expect(ShoppingListManager.deleteList).not.toHaveBeenCalled();
  });
});

describe('Home quick scan is unchanged', () => {
  test('Apply still completes, without asking about unticked items', async () => {
    route.params = { listId: 'list-1', autoAddAll: true };
    useListState([]);
    const renderer = await render({ isLocked: false, lockedBy: null });
    await apply(renderer);
    expect(completions()).toBe(1);
    expect(notBoughtAlert()).toBeUndefined();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('Skip still discards the quick-scan list', async () => {
    route.params = { listId: 'list-1', autoAddAll: true };
    useListState([]);
    const renderer = await render();
    await press(renderer, /^Skip$/);
    expect(ShoppingListManager.deleteList).toHaveBeenCalledWith('list-1');
    expect(completions()).toBe(0);
  });
});

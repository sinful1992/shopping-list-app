/**
 * Receipt Details shows a counted line's quantity (task 27): "2 ×" before the
 * description of a line the OCR read as 2, nothing on a line of 1.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ReceiptData } from '../../../models/types';
import { DARK_THEME } from '../../../styles/theme';
import ReceiptViewScreen from '../ReceiptViewScreen';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Polygon: 'Polygon', Line: 'Line' }));
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRoute: () => ({ params: { listId: 'list-1' } }),
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
jest.mock('../../../contexts/AlertContext', () => {
  const alert = { showAlert: jest.fn() };
  return { useAlert: () => alert };
});
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../../../styles/theme').DARK_THEME }),
}));
jest.mock('../../../contexts/AdMobContext', () => ({
  useAdMob: () => ({ shouldShowAds: false, showRewarded: jest.fn() }),
}));
jest.mock('../../../contexts/RevenueCatContext', () => ({ useRevenueCat: () => ({ tier: 'premium' }) }));
jest.mock('../../../services/ReceiptOCRService', () => ({ __esModule: true, default: {} }));
jest.mock('../../../services/ShoppingListManager', () => ({ __esModule: true, default: {} }));
jest.mock('../../../services/ImageStorageManager', () => ({
  __esModule: true,
  default: { pendingCapture: jest.fn(async () => null), getReceiptDownloadUrl: jest.fn(async () => null) },
}));
jest.mock('../../../services/LocalStorageManager', () => ({
  __esModule: true,
  default: { getList: jest.fn(), getReceiptData: jest.fn() },
}));

const LocalStorageManager = jest.requireMock('../../../services/LocalStorageManager').default;

const tescoReceipt: ReceiptData = {
  lineItems: [
    { description: 'Tesco Semi Skimmed Milk 2.272L', quantity: 1, unitPrice: 1.65, price: 1.65, vatCode: null },
    { description: 'Tesco Salami Slices 12 Pack 100g', quantity: 2, unitPrice: 1.1, price: 2.2, vatCode: null },
    { description: 'Tesco Diced Chorizo 130g', quantity: 2, unitPrice: 2.55, price: 5.1, vatCode: null },
    { description: 'Bananas Loose', quantity: 0.456, unitPrice: null, price: 0.62, vatCode: null },
    { description: 'Tesco Free Range Eggs 6', quantity: null, unitPrice: null, price: 1.89, vatCode: null },
  ],
} as unknown as ReceiptData;

async function render(): Promise<ReactTestRenderer> {
  LocalStorageManager.getList.mockResolvedValue({
    id: 'list-1', name: 'Tesco', receiptUrl: null, currency: '£',
    merchantName: 'Tesco', purchaseDate: '07/10/2026', totalAmount: 11.46,
  });
  LocalStorageManager.getReceiptData.mockResolvedValue(tescoReceipt);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ReceiptViewScreen />);
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

describe('ReceiptViewScreen line quantity', () => {
  test('shows "2 ×" on the salami and chorizo lines only', async () => {
    const qty = qtyElements(await render());
    expect([...qty.keys()].sort()).toEqual([1, 2]);
    expect(textOf(qty.get(1)!)).toBe('2 ×');
    expect(textOf(qty.get(2)!)).toBe('2 ×');
  });

  test('the count sits on the same row as its line and comes before the description', async () => {
    const renderer = await render();
    const qty = qtyElements(renderer).get(1)!;
    let row: ReactTestInstance | null = qty.parent;
    while (row && !textOf(row).includes('Tesco Salami Slices')) row = row.parent;
    expect(row).not.toBeNull();
    const rowText = textOf(row!);
    expect(rowText.indexOf('2 ×')).toBeLessThan(rowText.indexOf('Tesco Salami Slices'));
    expect(rowText).not.toContain('Chorizo');
  });

  test('a weighed line and a line with no count show nothing extra', async () => {
    const qty = qtyElements(await render());
    expect(qty.has(3)).toBe(false);
    expect(qty.has(4)).toBe(false);
  });
});

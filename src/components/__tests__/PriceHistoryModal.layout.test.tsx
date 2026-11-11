/**
 * The price history sheet opened collapsed (Fable audit, task 137): its
 * ScrollView had `flex: 1` inside a sheet sized only by `maxHeight`. In Yoga
 * `flex: 1` means "basis 0, grow into free space", and a sheet with no fixed
 * height has no free space to give, so the scroll area ended up 0 tall and only
 * the header showed. The working sheets (FrequentlyBoughtModal) give their
 * ScrollView no flex at all; it then takes its content height and shrinks
 * against the sheet's maxHeight.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import PriceHistoryModal from '../PriceHistoryModal';
import PriceHistoryService from '../../services/PriceHistoryService';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-gifted-charts', () => ({ BarChart: 'BarChart' }));
jest.mock('../../hooks/useBottomInset', () => ({ useBottomInset: () => 0 }));
jest.mock('../../contexts/UserContext', () => ({ useUser: () => ({ uid: 'u1', familyGroupId: 'fam1' }) }));
jest.mock('../../contexts/ThemeContext', () => {
  const { DARK_THEME: theme } = jest.requireActual('../../styles/theme');
  return { useTheme: () => ({ theme }) };
});
jest.mock('../../services/PriceHistoryService', () => ({
  __esModule: true,
  default: { getPriceStats: jest.fn(), getPriceByStore: jest.fn() },
}));

const service = PriceHistoryService as unknown as {
  getPriceStats: jest.Mock;
  getPriceByStore: jest.Mock;
};

const stats = {
  itemName: 'Milk',
  currentPrice: 1.2,
  averagePrice: 1.1,
  lowestPrice: 1.0,
  highestPrice: 1.3,
  priceHistory: [
    { price: 1.0, date: 1_700_000_000_000, storeName: 'Tesco' },
    { price: 1.2, date: 1_700_100_000_000, storeName: 'Aldi' },
  ],
  totalPurchases: 2,
  trend: 'up' as const,
  percentageChange: 9,
};

async function renderLoaded(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<PriceHistoryModal visible itemName="Milk" onClose={jest.fn()} />);
  });
  return tree;
}

beforeEach(() => {
  service.getPriceStats.mockResolvedValue(stats);
  service.getPriceByStore.mockResolvedValue({ Tesco: { average: 1.0, lowest: 1.0, highest: 1.0, count: 1 } });
});

describe('PriceHistoryModal layout', () => {
  it('shows the stats in a ScrollView once loaded', async () => {
    const tree = await renderLoaded();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(1);
  });

  it('the ScrollView does not grow from a zero basis (would collapse to 0 tall)', async () => {
    const tree = await renderLoaded();
    const style = StyleSheet.flatten(tree.root.findByType(ScrollView).props.style) ?? {};
    expect(style.flex).toBeUndefined();
    expect(style.flexBasis).not.toBe(0);
    expect(style.height).not.toBe(0);
  });

  it('the sheet stays capped by maxHeight and can shrink, so a long history scrolls', async () => {
    const tree = await renderLoaded();
    const sheet = tree.root.find(
      (n) => (n.type as unknown) === 'LinearGradient' && n.props.style !== undefined,
    );
    const style = StyleSheet.flatten(sheet.props.style);
    expect(style.maxHeight).toBe('85%');
    expect(style.flexShrink).toBe(1);
    expect(style.height).toBeUndefined();
  });

  it('keeps the inner padding on the scroll area', async () => {
    const tree = await renderLoaded();
    const style = StyleSheet.flatten(tree.root.findByType(ScrollView).props.style) ?? {};
    expect(style.padding).toBeGreaterThan(0);
  });

  it('no stats: the empty message shows and no ScrollView is rendered', async () => {
    service.getPriceStats.mockResolvedValue(null);
    const tree = await renderLoaded();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
  });
});

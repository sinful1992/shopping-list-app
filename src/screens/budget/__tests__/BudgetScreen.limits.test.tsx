import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import BudgetScreen from '../BudgetScreen';
import { useBudgetData } from '../../../hooks';

jest.mock('../../../hooks', () => ({ useBudgetData: jest.fn() }));
jest.mock('../../../contexts/AlertContext', () => ({ useAlert: () => ({ showAlert: jest.fn() }) }));
jest.mock('../../../contexts/ThemeContext', () => {
  const { DARK_THEME: theme } = jest.requireActual('../../../styles/theme');
  return { useTheme: () => ({ theme }) };
});
jest.mock('../../../services/BudgetAlertService', () => ({
  __esModule: true,
  default: { getAlertColor: () => '#0f0' },
}));

const useBudgetDataMock = useBudgetData as jest.Mock;
const save = jest.fn().mockResolvedValue(undefined);

function hookValue(settings: { monthlyLimit: number | null; weeklyLimit: number | null }) {
  return {
    loading: false,
    summary: { totalAmount: 0, listCount: 0, listsWithReceipts: 0, listsWithoutReceipts: 0 },
    breakdown: [],
    dateRange: 'month',
    setDateRange: jest.fn(),
    filterUserId: null,
    toggleFilter: jest.fn(),
    budgetSettings: { ...settings, enableAlerts: true },
    saveBudgetSettings: save,
    monthlyAlert: null,
    weeklyAlert: null,
    getDateRangeLabel: () => 'This month',
    getBudgetProgress: () => 0,
  };
}

function pressByText(r: ReactTestRenderer, label: string) {
  const button = r.root.findAllByType(TouchableOpacity).find(b =>
    b.findAllByType(Text).some(t => t.props.children === label));
  if (!button) throw new Error(`no button ${label}`);
  return act(async () => { await button.props.onPress(); });
}

const inputs = (r: ReactTestRenderer) => r.root.findAllByType(TextInput);

beforeEach(() => { jest.clearAllMocks(); });

describe('BudgetScreen limits (review #6)', () => {
  it('keeps the monthly limit when only the weekly one is changed (settings load after first render)', async () => {
    useBudgetDataMock.mockReturnValue({ ...hookValue({ monthlyLimit: null, weeklyLimit: null }), loading: true });
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: 150 }));
    await act(async () => { r.update(<BudgetScreen />); });

    await pressByText(r, 'Set Budget Limits');
    const [monthly, weekly] = inputs(r);
    expect(monthly.props.value).toBe('500');
    expect(weekly.props.value).toBe('150');
    await act(async () => { weekly.props.onChangeText('200'); });
    await pressByText(r, 'Save Budget Limits');

    expect(save).toHaveBeenCalledWith({ monthlyLimit: 500, weeklyLimit: 200, enableAlerts: true });
  });

  it('shows limits saved from another phone when the form is reopened', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: null }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    await pressByText(r, 'Hide Budget Settings');
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: 90 }));
    await act(async () => { r.update(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    expect(inputs(r)[1].props.value).toBe('90');
  });

  it('clearing a limit on purpose still saves null for it', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: 150 }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    await act(async () => { inputs(r)[0].props.onChangeText(''); });
    await pressByText(r, 'Save Budget Limits');
    expect(save).toHaveBeenCalledWith({ monthlyLimit: null, weeklyLimit: 150, enableAlerts: true });
  });

  it('does not overwrite what the user is typing when settings re-render while the form is open', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: 150 }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    await act(async () => { inputs(r)[0].props.onChangeText('6'); });
    await act(async () => { r.update(<BudgetScreen />); });
    expect(inputs(r)[0].props.value).toBe('6');
  });
});

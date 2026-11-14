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

describe('adabreak #6 BudgetScreen limits', () => {
  it('one limit null: setting the monthly keeps the saved weekly', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: null, weeklyLimit: 75 }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    expect(inputs(r)[0].props.value).toBe('');
    await act(async () => { inputs(r)[0].props.onChangeText('300'); });
    await pressByText(r, 'Save Budget Limits');
    expect(save).toHaveBeenCalledWith({ monthlyLimit: 300, weeklyLimit: 75, enableAlerts: true });
  });

  it('a saved limit of 0 is shown as 0, not blank', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 0, weeklyLimit: 50 }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits');
    expect(inputs(r)[0].props.value).toBe('0');
  });

  it('form opened before the saved limits load: saving the weekly keeps the monthly', async () => {
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: null, weeklyLimit: null }));
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BudgetScreen />); });
    await pressByText(r, 'Set Budget Limits'); // opened before load finished
    useBudgetDataMock.mockReturnValue(hookValue({ monthlyLimit: 500, weeklyLimit: 150 }));
    await act(async () => { r.update(<BudgetScreen />); });
    await act(async () => { inputs(r)[1].props.onChangeText('200'); });
    await pressByText(r, 'Save Budget Limits');
    expect(save).toHaveBeenCalledWith({ monthlyLimit: 500, weeklyLimit: 200, enableAlerts: true });
  });
});

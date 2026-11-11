/**
 * BudgetAlertService: the Budget screen's weekly/monthly limits and alerts.
 * Was 0 % covered (Fable audit task 137).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  },
}));
const mockExpenditure = jest.fn();
jest.mock('../BudgetTracker', () => ({
  __esModule: true,
  default: { calculateExpenditureForDateRange: (...a: unknown[]) => mockExpenditure(...a) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import BudgetAlertService from '../BudgetAlertService';

const NOW = Date.UTC(2026, 10, 11, 20, 0, 0);
const DAY = 24 * 3600 * 1000;
const save = (v: unknown) => mockStore.set('budget_settings_fam', typeof v === 'string' ? v : JSON.stringify(v));

beforeEach(() => {
  mockStore.clear();
  mockExpenditure.mockReset();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => jest.restoreAllMocks());

describe('settings', () => {
  it('nothing saved: no limits, alerts on', async () => {
    expect(await BudgetAlertService.getBudgetSettings('fam')).toEqual({ monthlyLimit: null, weeklyLimit: null, enableAlerts: true });
  });

  it('save then read back, per family', async () => {
    await BudgetAlertService.saveBudgetSettings('fam', { monthlyLimit: 400, weeklyLimit: 100, enableAlerts: false });
    expect(await BudgetAlertService.getBudgetSettings('fam')).toEqual({ monthlyLimit: 400, weeklyLimit: 100, enableAlerts: false });
    expect(await BudgetAlertService.getBudgetSettings('other')).toEqual({ monthlyLimit: null, weeklyLimit: null, enableAlerts: true });
  });

  it('settings saved without enableAlerts (older version) keep alerts on and the limit', async () => {
    save({ monthlyLimit: 300 });
    expect(await BudgetAlertService.getBudgetSettings('fam')).toEqual({ monthlyLimit: 300, weeklyLimit: null, enableAlerts: true });
  });

  it.each([['damaged JSON', '{nope'], ['a list', '[1]'], ['a number', '5'], ['null', 'null']])(
    'saved %s: defaults', async (_l, raw) => {
      save(raw);
      expect(await BudgetAlertService.getBudgetSettings('fam')).toEqual({ monthlyLimit: null, weeklyLimit: null, enableAlerts: true });
    });

  it('wrong field types are ignored', async () => {
    save({ monthlyLimit: '300', weeklyLimit: 50, enableAlerts: 'yes' });
    expect(await BudgetAlertService.getBudgetSettings('fam')).toEqual({ monthlyLimit: null, weeklyLimit: 50, enableAlerts: true });
  });

  it('a failing save is passed on', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('full'));
    await expect(BudgetAlertService.saveBudgetSettings('fam', { monthlyLimit: 1, weeklyLimit: 1, enableAlerts: true })).rejects.toThrow('full');
  });
});

describe('checkBudget', () => {
  const spent = (n: number) => mockExpenditure.mockResolvedValue({ totalAmount: n });

  it('monthly looks back 30 days, weekly 7', async () => {
    save({ monthlyLimit: 100, weeklyLimit: 50, enableAlerts: true });
    spent(10);
    await BudgetAlertService.checkBudget('fam', 'monthly');
    await BudgetAlertService.checkBudget('fam', 'weekly');
    expect(mockExpenditure.mock.calls[0]).toEqual(['fam', NOW - 30 * DAY, NOW]);
    expect(mockExpenditure.mock.calls[1]).toEqual(['fam', NOW - 7 * DAY, NOW]);
  });

  it.each([
    [10, 'safe', '£90.00 remaining', false],
    [49.99, 'safe', '£50.01 remaining', false],
    [50, 'warning', '50% of monthly budget spent', false],
    [74, 'warning', '74% of monthly budget spent', false],
    [75, 'caution', '£25.00 remaining (75% spent)', false],
    [89, 'caution', '£11.00 remaining (89% spent)', false],
    [90, 'danger', 'Only £10.00 remaining (90% spent)', false],
    [100, 'danger', 'Only £0.00 remaining (100% spent)', false],
    [130.5, 'danger', 'Budget exceeded by £30.50', true],
  ])('spent £%s of £100: %s, "%s"', async (amount, level, message, exceeded) => {
    save({ monthlyLimit: 100, weeklyLimit: null, enableAlerts: true });
    spent(amount as number);
    const a = await BudgetAlertService.checkBudget('fam', 'monthly');
    expect(a).toEqual(expect.objectContaining({ level, message, exceeded, spent: amount, limit: 100, remaining: 100 - (amount as number) }));
  });

  it('alerts off, no limit, or a limit of 0 or less: no alert', async () => {
    save({ monthlyLimit: 100, weeklyLimit: null, enableAlerts: false });
    expect(await BudgetAlertService.checkBudget('fam', 'monthly')).toBeNull();
    save({ monthlyLimit: 100, weeklyLimit: null, enableAlerts: true });
    expect(await BudgetAlertService.checkBudget('fam', 'weekly')).toBeNull();
    save({ monthlyLimit: 0, weeklyLimit: -5, enableAlerts: true });
    expect(await BudgetAlertService.checkBudget('fam', 'monthly')).toBeNull();
    expect(await BudgetAlertService.checkBudget('fam', 'weekly')).toBeNull();
    expect(mockExpenditure).not.toHaveBeenCalled();
  });

  it('settings saved by an older version (no enableAlerts) still alert', async () => {
    save({ monthlyLimit: 100 });
    spent(95);
    expect((await BudgetAlertService.checkBudget('fam', 'monthly'))?.level).toBe('danger');
  });

  it('a failing spend total gives no alert instead of an error', async () => {
    save({ monthlyLimit: 100, weeklyLimit: null, enableAlerts: true });
    mockExpenditure.mockRejectedValue(new Error('db'));
    expect(await BudgetAlertService.checkBudget('fam', 'monthly')).toBeNull();
  });
});

describe('display helpers', () => {
  it('colours and icons per level, unknown falls back to safe', () => {
    expect(['safe', 'warning', 'caution', 'danger', 'x'].map(l => BudgetAlertService.getAlertColor(l as any)))
      .toEqual(['#30D158', '#FFD60A', '#FFB340', '#FF453A', '#30D158']);
    expect(['safe', 'warning', 'caution', 'danger', 'x'].map(l => BudgetAlertService.getAlertIcon(l as any)))
      .toEqual(['✅', '⚠️', '🟠', '🚨', '✅']);
  });

  it('alerts show from 50 %', () => {
    expect(BudgetAlertService.shouldShowAlert(null)).toBe(false);
    expect(BudgetAlertService.shouldShowAlert({ percentage: 49.9 } as any)).toBe(false);
    expect(BudgetAlertService.shouldShowAlert({ percentage: 50 } as any)).toBe(true);
  });

  it('progress is capped at 100 and 0 for no limit', () => {
    expect(BudgetAlertService.getBudgetProgress(25, 100)).toBe(25);
    expect(BudgetAlertService.getBudgetProgress(250, 100)).toBe(100);
    expect(BudgetAlertService.getBudgetProgress(5, 0)).toBe(0);
    expect(BudgetAlertService.getBudgetProgress(5, -1)).toBe(0);
  });
});

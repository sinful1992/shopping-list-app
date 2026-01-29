import { useState, useEffect, useCallback } from 'react';
import { ExpenditureSummary, ExpenditureBreakdownItem, User } from '../models/types';
import BudgetTracker from '../services/BudgetTracker';
import BudgetAlertService, { BudgetAlert, BudgetSettings } from '../services/BudgetAlertService';
import AuthenticationModule from '../services/AuthenticationModule';

type DateRange = 'week' | 'month' | 'quarter' | 'year';

/**
 * useBudgetData Hook
 *
 * Manages budget tracking state including summaries, alerts, and settings.
 *
 * Usage:
 *   const { summary, breakdown, alerts, loading, dateRange, setDateRange, ... } = useBudgetData();
 */
export function useBudgetData() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<ExpenditureSummary | null>(null);
  const [breakdown, setBreakdown] = useState<ExpenditureBreakdownItem[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>({
    monthlyLimit: null,
    weeklyLimit: null,
    enableAlerts: true,
  });
  const [monthlyAlert, setMonthlyAlert] = useState<BudgetAlert | null>(null);
  const [weeklyAlert, setWeeklyAlert] = useState<BudgetAlert | null>(null);

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  // Reload data when user, dateRange, or filter changes
  useEffect(() => {
    if (user) {
      loadBudgetData();
    }
  }, [user, dateRange, filterUserId]);

  const loadUser = async () => {
    try {
      const currentUser = await AuthenticationModule.getCurrentUser();
      setUser(currentUser);
      if (currentUser?.familyGroupId) {
        await loadBudgetSettings(currentUser.familyGroupId);
      }
    } catch {
      // Failed to load user
    }
  };

  const loadBudgetSettings = async (familyGroupId: string) => {
    try {
      const settings = await BudgetAlertService.getBudgetSettings(familyGroupId);
      setBudgetSettings(settings);

      const [monthly, weekly] = await Promise.all([
        BudgetAlertService.checkBudget(familyGroupId, 'monthly'),
        BudgetAlertService.checkBudget(familyGroupId, 'weekly'),
      ]);
      setMonthlyAlert(monthly);
      setWeeklyAlert(weekly);
    } catch {
      // Failed to load budget settings
    }
  };

  const getDateRangeTimestamps = useCallback((range: DateRange) => {
    const endDate = Date.now();
    let startDate: number;

    switch (range) {
      case 'week':
        startDate = endDate - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        startDate = endDate - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'quarter':
        startDate = endDate - 90 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        startDate = endDate - 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        startDate = endDate - 30 * 24 * 60 * 60 * 1000;
    }

    return { startDate, endDate };
  }, []);

  const loadBudgetData = useCallback(async () => {
    if (!user?.familyGroupId) return;

    try {
      setLoading(true);

      const { startDate, endDate } = getDateRangeTimestamps(dateRange);

      const summaryData = filterUserId
        ? await BudgetTracker.getExpenditureByMember(
            user.familyGroupId,
            startDate,
            endDate,
            filterUserId
          )
        : await BudgetTracker.calculateExpenditureForDateRange(
            user.familyGroupId,
            startDate,
            endDate
          );

      setSummary(summaryData);

      const breakdownData = await BudgetTracker.getExpenditureBreakdown(
        user.familyGroupId,
        startDate,
        endDate
      );

      const filteredBreakdown = filterUserId
        ? breakdownData.filter((item) => item.createdBy === filterUserId)
        : breakdownData;

      setBreakdown(filteredBreakdown);
    } catch {
      // Failed to load budget data
    } finally {
      setLoading(false);
    }
  }, [user, dateRange, filterUserId, getDateRangeTimestamps]);

  const saveBudgetSettings = useCallback(async (settings: BudgetSettings): Promise<void> => {
    if (!user?.familyGroupId) return;

    await BudgetAlertService.saveBudgetSettings(user.familyGroupId, settings);
    setBudgetSettings(settings);

    // Refresh alerts
    const [monthly, weekly] = await Promise.all([
      BudgetAlertService.checkBudget(user.familyGroupId, 'monthly'),
      BudgetAlertService.checkBudget(user.familyGroupId, 'weekly'),
    ]);
    setMonthlyAlert(monthly);
    setWeeklyAlert(weekly);
  }, [user]);

  const toggleFilter = useCallback(() => {
    if (filterUserId === user?.uid) {
      setFilterUserId(null);
    } else {
      setFilterUserId(user?.uid || null);
    }
  }, [filterUserId, user]);

  const getDateRangeLabel = useCallback(() => {
    switch (dateRange) {
      case 'week':
        return 'Last 7 Days';
      case 'month':
        return 'Last 30 Days';
      case 'quarter':
        return 'Last 90 Days';
      case 'year':
        return 'Last Year';
      default:
        return 'Last 30 Days';
    }
  }, [dateRange]);

  const getBudgetProgress = useCallback((spent: number, limit: number): number => {
    if (limit <= 0) return 0;
    return Math.min((spent / limit) * 100, 100);
  }, []);

  return {
    loading,
    user,
    summary,
    breakdown,
    dateRange,
    setDateRange,
    filterUserId,
    toggleFilter,
    budgetSettings,
    saveBudgetSettings,
    monthlyAlert,
    weeklyAlert,
    getDateRangeLabel,
    getBudgetProgress,
    refresh: loadBudgetData,
  };
}

export default useBudgetData;

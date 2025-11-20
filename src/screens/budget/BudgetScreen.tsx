import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import BudgetTracker from '../../services/BudgetTracker';
import BudgetAlertService, { BudgetAlert, BudgetSettings } from '../../services/BudgetAlertService';
import AuthenticationModule from '../../services/AuthenticationModule';
import {
  ExpenditureSummary,
  ExpenditureBreakdownItem,
  User,
} from '../../models/types';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, SHADOWS } from '../../styles/theme';

/**
 * BudgetScreen
 * Display expenditure tracking and budget overview
 * Implements Req 7.1, 7.2, 7.3, 7.4, 7.6, 7.7
 */
const BudgetScreen = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ExpenditureSummary | null>(null);
  const [breakdown, setBreakdown] = useState<ExpenditureBreakdownItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  // Date range state (default: last 30 days)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [filterUserId, setFilterUserId] = useState<string | null>(null);

  // Budget settings state
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>({
    monthlyLimit: null,
    weeklyLimit: null,
    enableAlerts: true,
  });
  const [monthlyLimitInput, setMonthlyLimitInput] = useState('');
  const [weeklyLimitInput, setWeeklyLimitInput] = useState('');
  const [showBudgetConfig, setShowBudgetConfig] = useState(false);

  // Budget alert state
  const [monthlyAlert, setMonthlyAlert] = useState<BudgetAlert | null>(null);
  const [weeklyAlert, setWeeklyAlert] = useState<BudgetAlert | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

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
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const loadBudgetSettings = async (familyGroupId: string) => {
    try {
      const settings = await BudgetAlertService.getBudgetSettings(familyGroupId);
      setBudgetSettings(settings);
      setMonthlyLimitInput(settings.monthlyLimit?.toString() || '');
      setWeeklyLimitInput(settings.weeklyLimit?.toString() || '');

      // Check budget alerts
      const [monthly, weekly] = await Promise.all([
        BudgetAlertService.checkBudget(familyGroupId, 'monthly'),
        BudgetAlertService.checkBudget(familyGroupId, 'weekly'),
      ]);
      setMonthlyAlert(monthly);
      setWeeklyAlert(weekly);
    } catch (error) {
      console.error('Error loading budget settings:', error);
    }
  };

  const saveBudgetSettings = async () => {
    if (!user?.familyGroupId) return;

    try {
      const settings: BudgetSettings = {
        monthlyLimit: monthlyLimitInput ? parseFloat(monthlyLimitInput) : null,
        weeklyLimit: weeklyLimitInput ? parseFloat(weeklyLimitInput) : null,
        enableAlerts: budgetSettings.enableAlerts,
      };

      await BudgetAlertService.saveBudgetSettings(user.familyGroupId, settings);
      setBudgetSettings(settings);
      setShowBudgetConfig(false);

      // Refresh alerts
      const [monthly, weekly] = await Promise.all([
        BudgetAlertService.checkBudget(user.familyGroupId, 'monthly'),
        BudgetAlertService.checkBudget(user.familyGroupId, 'weekly'),
      ]);
      setMonthlyAlert(monthly);
      setWeeklyAlert(weekly);

      Alert.alert('Success', 'Budget limits saved');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const getBudgetProgress = (spent: number, limit: number): number => {
    if (limit <= 0) return 0;
    return Math.min((spent / limit) * 100, 100);
  };

  const getAlertColor = (alert: BudgetAlert | null): string => {
    if (!alert) return COLORS.accent.green;
    return BudgetAlertService.getAlertColor(alert.level);
  };

  const loadBudgetData = async () => {
    if (!user?.familyGroupId) return;

    try {
      setLoading(true);

      const { startDate, endDate } = getDateRangeTimestamps(dateRange);

      // Get summary
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

      // Get breakdown
      const breakdownData = await BudgetTracker.getExpenditureBreakdown(
        user.familyGroupId,
        startDate,
        endDate
      );

      // Filter by user if selected
      const filteredBreakdown = filterUserId
        ? breakdownData.filter((item) => item.createdBy === filterUserId)
        : breakdownData;

      setBreakdown(filteredBreakdown);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDateRangeTimestamps = (range: 'week' | 'month' | 'quarter' | 'year') => {
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
  };

  const getDateRangeLabel = () => {
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
  };

  const handleToggleFilter = () => {
    if (filterUserId === user?.uid) {
      setFilterUserId(null); // Show all
    } else {
      setFilterUserId(user?.uid || null); // Show only mine
    }
  };

  const renderBreakdownItem = ({ item }: { item: ExpenditureBreakdownItem }) => (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownLeft}>
        <Text style={styles.listName}>{item.listName}</Text>
        <Text style={styles.listDate}>
          {new Date(item.completedAt).toLocaleDateString()}
        </Text>
        {item.merchantName && (
          <Text style={styles.merchantName}>{item.merchantName}</Text>
        )}
      </View>
      <View style={styles.breakdownRight}>
        {item.totalAmount !== null ? (
          <Text style={styles.amount}>£{item.totalAmount.toFixed(2)}</Text>
        ) : (
          <Text style={styles.noReceipt}>No receipt</Text>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading budget data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Date Range Selector */}
      <View style={styles.dateRangeContainer}>
        <Text style={styles.dateRangeLabel}>Time Period</Text>
        <View style={styles.dateRangeButtons}>
          <TouchableOpacity
            style={[
              styles.dateRangeButton,
              dateRange === 'week' && styles.dateRangeButtonActive,
            ]}
            onPress={() => setDateRange('week')}
          >
            <Text
              style={[
                styles.dateRangeButtonText,
                dateRange === 'week' && styles.dateRangeButtonTextActive,
              ]}
            >
              Week
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dateRangeButton,
              dateRange === 'month' && styles.dateRangeButtonActive,
            ]}
            onPress={() => setDateRange('month')}
          >
            <Text
              style={[
                styles.dateRangeButtonText,
                dateRange === 'month' && styles.dateRangeButtonTextActive,
              ]}
            >
              Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dateRangeButton,
              dateRange === 'quarter' && styles.dateRangeButtonActive,
            ]}
            onPress={() => setDateRange('quarter')}
          >
            <Text
              style={[
                styles.dateRangeButtonText,
                dateRange === 'quarter' && styles.dateRangeButtonTextActive,
              ]}
            >
              Quarter
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dateRangeButton,
              dateRange === 'year' && styles.dateRangeButtonActive,
            ]}
            onPress={() => setDateRange('year')}
          >
            <Text
              style={[
                styles.dateRangeButtonText,
                dateRange === 'year' && styles.dateRangeButtonTextActive,
              ]}
            >
              Year
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Total Spending</Text>
          <Text style={styles.summaryPeriod}>{getDateRangeLabel()}</Text>
          <Text style={styles.totalAmount}>
            £{summary.totalAmount.toFixed(2)}
          </Text>
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.listCount}</Text>
              <Text style={styles.statLabel}>Shopping Trips</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.listsWithReceipts}</Text>
              <Text style={styles.statLabel}>With Receipts</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary.listsWithoutReceipts}
              </Text>
              <Text style={styles.statLabel}>Without Receipts</Text>
            </View>
          </View>

          {/* Filter Toggle */}
          <TouchableOpacity
            style={styles.filterButton}
            onPress={handleToggleFilter}
          >
            <Text style={styles.filterButtonText}>
              {filterUserId ? 'Show All Family' : 'Show Only Mine'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Budget Alerts */}
      {(monthlyAlert || weeklyAlert) && (
        <View style={styles.alertsContainer}>
          {monthlyAlert && BudgetAlertService.shouldShowAlert(monthlyAlert) && (
            <View style={[styles.alertCard, { borderLeftColor: getAlertColor(monthlyAlert) }]}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertIcon}>{BudgetAlertService.getAlertIcon(monthlyAlert.level)}</Text>
                <Text style={styles.alertTitle}>Monthly Budget</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${getBudgetProgress(monthlyAlert.spent, monthlyAlert.limit)}%`,
                      backgroundColor: getAlertColor(monthlyAlert),
                    },
                  ]}
                />
              </View>
              <Text style={styles.alertMessage}>{monthlyAlert.message}</Text>
            </View>
          )}
          {weeklyAlert && BudgetAlertService.shouldShowAlert(weeklyAlert) && (
            <View style={[styles.alertCard, { borderLeftColor: getAlertColor(weeklyAlert) }]}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertIcon}>{BudgetAlertService.getAlertIcon(weeklyAlert.level)}</Text>
                <Text style={styles.alertTitle}>Weekly Budget</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${getBudgetProgress(weeklyAlert.spent, weeklyAlert.limit)}%`,
                      backgroundColor: getAlertColor(weeklyAlert),
                    },
                  ]}
                />
              </View>
              <Text style={styles.alertMessage}>{weeklyAlert.message}</Text>
            </View>
          )}
        </View>
      )}

      {/* Budget Configuration */}
      <View style={styles.configContainer}>
        <TouchableOpacity
          style={styles.configToggle}
          onPress={() => setShowBudgetConfig(!showBudgetConfig)}
        >
          <Text style={styles.configToggleText}>
            {showBudgetConfig ? 'Hide Budget Settings' : 'Set Budget Limits'}
          </Text>
          <Text style={styles.configToggleIcon}>{showBudgetConfig ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showBudgetConfig && (
          <View style={styles.configForm}>
            <View style={styles.configInputGroup}>
              <Text style={styles.configLabel}>Monthly Limit</Text>
              <TextInput
                style={styles.configInput}
                value={monthlyLimitInput}
                onChangeText={setMonthlyLimitInput}
                placeholder="e.g., 500"
                placeholderTextColor={COLORS.text.tertiary}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.configInputGroup}>
              <Text style={styles.configLabel}>Weekly Limit</Text>
              <TextInput
                style={styles.configInput}
                value={weeklyLimitInput}
                onChangeText={setWeeklyLimitInput}
                placeholder="e.g., 150"
                placeholderTextColor={COLORS.text.tertiary}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={saveBudgetSettings}>
              <Text style={styles.saveButtonText}>Save Budget Limits</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Breakdown List */}
      <View style={styles.breakdownContainer}>
        <Text style={styles.breakdownTitle}>Shopping Trips</Text>
        {breakdown.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No shopping trips in this period
            </Text>
          </View>
        ) : (
          <View style={styles.breakdownList}>
            {breakdown.map((item) => (
              <View key={item.listId}>
                {renderBreakdownItem({ item })}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#a0a0a0',
  },
  dateRangeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateRangeLabel: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 10,
  },
  dateRangeButtons: {
    flexDirection: 'row',
  },
  dateRangeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dateRangeButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  dateRangeButtonText: {
    fontSize: 14,
    color: '#a0a0a0',
    fontWeight: '600',
  },
  dateRangeButtonTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: 15,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 5,
  },
  summaryPeriod: {
    fontSize: 14,
    color: '#6E6E73',
    marginBottom: 10,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 5,
    textAlign: 'center',
  },
  filterButton: {
    marginTop: 15,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  filterButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  alertsContainer: {
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  alertCard: {
    backgroundColor: COLORS.glass.medium,
    borderRadius: RADIUS.medium,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  alertIcon: {
    fontSize: 16,
  },
  alertTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.glass.subtle,
    borderRadius: 4,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  alertMessage: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
  },
  configContainer: {
    marginHorizontal: 15,
    marginBottom: 10,
  },
  configToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.glass.medium,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
  },
  configToggleText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  configToggleIcon: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.text.secondary,
  },
  configForm: {
    backgroundColor: COLORS.glass.medium,
    padding: SPACING.lg,
    borderRadius: RADIUS.medium,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
  },
  configInputGroup: {
    marginBottom: SPACING.lg,
  },
  configLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  configInput: {
    backgroundColor: COLORS.glass.medium,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  saveButton: {
    backgroundColor: COLORS.accent.blueLight,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    ...SHADOWS.blue,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
  },
  breakdownContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 15,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 15,
  },
  breakdownList: {
    paddingBottom: 20,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  breakdownLeft: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  listDate: {
    fontSize: 13,
    color: '#a0a0a0',
  },
  merchantName: {
    fontSize: 13,
    color: '#6E6E73',
    marginTop: 2,
  },
  breakdownRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#30D158',
  },
  noReceipt: {
    fontSize: 14,
    color: '#6E6E73',
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
  },
});

export default BudgetScreen;

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import BudgetAlertService, { AlertLevel } from '../../services/BudgetAlertService';
import { ExpenditureBreakdownItem } from '../../models/types';
import { RADIUS, SPACING, TYPOGRAPHY, SHADOWS } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useBudgetData } from '../../hooks';

/**
 * BudgetScreen
 * Display expenditure tracking and budget overview
 * Implements Req 7.1, 7.2, 7.3, 7.4, 7.6, 7.7
 */
const BudgetScreen = () => {
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Use custom hook for budget data management
  const {
    loading,
    summary,
    breakdown,
    dateRange,
    setDateRange,
    filterUserId,
    toggleFilter,
    budgetSettings,
    saveBudgetSettings: saveBudgetSettingsHook,
    monthlyAlert,
    weeklyAlert,
    getDateRangeLabel,
    getBudgetProgress,
  } = useBudgetData();

  // UI state only
  const [monthlyLimitInput, setMonthlyLimitInput] = useState(budgetSettings.monthlyLimit?.toString() || '');
  const [weeklyLimitInput, setWeeklyLimitInput] = useState(budgetSettings.weeklyLimit?.toString() || '');
  const [showBudgetConfig, setShowBudgetConfig] = useState(false);

  const handleSaveBudgetSettings = async () => {
    try {
      await saveBudgetSettingsHook({
        monthlyLimit: monthlyLimitInput ? parseFloat(monthlyLimitInput) : null,
        weeklyLimit: weeklyLimitInput ? parseFloat(weeklyLimitInput) : null,
        enableAlerts: budgetSettings.enableAlerts,
      });
      setShowBudgetConfig(false);
      showAlert('Success', 'Budget limits saved', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const getAlertColor = (alert: { level: AlertLevel } | null): string => {
    if (!alert) return theme.accent.green;
    return BudgetAlertService.getAlertColor(alert.level);
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
        <ActivityIndicator size="large" color={theme.accent.blue} />
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
            onPress={toggleFilter}
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
                placeholderTextColor={theme.text.tertiary}
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
                placeholderTextColor={theme.text.tertiary}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudgetSettings}>
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

const createStyles = (theme: import('../../styles/theme').Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.secondary,
  },
  dateRangeContainer: {
    padding: 15,
  },
  dateRangeLabel: {
    fontSize: 14,
    color: theme.text.secondary,
    marginBottom: 10,
  },
  dateRangeButtons: {
    flexDirection: 'row',
  },
  dateRangeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.glass.subtle,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  dateRangeButtonActive: {
    backgroundColor: theme.accent.blueSubtle,
    borderColor: theme.accent.blueDim,
  },
  dateRangeButtonText: {
    fontSize: 14,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  dateRangeButtonTextActive: {
    color: theme.accent.blue,
  },
  summaryCard: {
    backgroundColor: theme.glass.subtle,
    margin: 15,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  summaryTitle: {
    fontSize: 16,
    color: theme.text.secondary,
    marginBottom: 5,
  },
  summaryPeriod: {
    fontSize: 14,
    color: theme.text.tertiary,
    marginBottom: 10,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 20,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.accent.blue,
  },
  statLabel: {
    fontSize: 12,
    color: theme.text.secondary,
    marginTop: 5,
    textAlign: 'center',
  },
  filterButton: {
    marginTop: 15,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.accent.blueLight,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    shadowColor: theme.accent.blue,
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
    backgroundColor: theme.glass.medium,
    borderRadius: RADIUS.medium,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: theme.border.strong,
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
    color: theme.text.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.glass.subtle,
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
    color: theme.text.secondary,
  },
  configContainer: {
    marginHorizontal: 15,
    marginBottom: 10,
  },
  configToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.glass.medium,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.border.strong,
  },
  configToggleText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.primary,
  },
  configToggleIcon: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: theme.text.secondary,
  },
  configForm: {
    backgroundColor: theme.glass.medium,
    padding: SPACING.lg,
    borderRadius: RADIUS.medium,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: theme.border.strong,
  },
  configInputGroup: {
    marginBottom: SPACING.lg,
  },
  configLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  configInput: {
    backgroundColor: theme.glass.medium,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.border.strong,
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  saveButton: {
    backgroundColor: theme.accent.blueLight,
    padding: SPACING.md,
    borderRadius: RADIUS.medium,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    ...SHADOWS.blue,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
  },
  breakdownContainer: {
    flex: 1,
    backgroundColor: theme.glass.subtle,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    padding: 15,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
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
    borderBottomColor: theme.border.medium,
  },
  breakdownLeft: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text.primary,
    marginBottom: 4,
  },
  listDate: {
    fontSize: 13,
    color: theme.text.secondary,
  },
  merchantName: {
    fontSize: 13,
    color: theme.text.tertiary,
    marginTop: 2,
  },
  breakdownRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.secondary,
  },
  noReceipt: {
    fontSize: 14,
    color: theme.text.tertiary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: theme.text.secondary,
  },
});

export default BudgetScreen;

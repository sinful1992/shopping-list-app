import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import BudgetTracker from '../../services/BudgetTracker';
import AuthenticationModule from '../../services/AuthenticationModule';
import {
  ExpenditureSummary,
  ExpenditureBreakdownItem,
  User,
} from '../../models/types';

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
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
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
    <View style={styles.container}>
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
          <FlatList
            data={breakdown}
            renderItem={renderBreakdownItem}
            keyExtractor={(item) => item.listId}
            contentContainerStyle={styles.breakdownList}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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

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
          <Text style={styles.amount}>${item.totalAmount.toFixed(2)}</Text>
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
            ${summary.totalAmount.toFixed(2)}
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
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  dateRangeContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateRangeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  dateRangeButtons: {
    flexDirection: 'row',
  },
  dateRangeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  dateRangeButtonActive: {
    backgroundColor: '#007AFF',
  },
  dateRangeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  dateRangeButtonTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  summaryPeriod: {
    fontSize: 14,
    color: '#999',
    marginBottom: 10,
  },
  totalAmount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
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
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
  },
  filterButton: {
    marginTop: 15,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  breakdownContainer: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
  },
  breakdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
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
    borderBottomColor: '#f0f0f0',
  },
  breakdownLeft: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  listDate: {
    fontSize: 13,
    color: '#666',
  },
  merchantName: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  breakdownRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  noReceipt: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});

export default BudgetScreen;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import AnalyticsService, { AnalyticsSummary } from '../../services/AnalyticsService';
import AuthenticationModule from '../../services/AuthenticationModule';

const screenWidth = Dimensions.get('window').width;

/**
 * AnalyticsScreen
 * Displays shopping analytics with charts and insights
 * Implements Sprint 7: Analytics dashboard
 */
const AnalyticsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [timePeriod, setTimePeriod] = useState<30 | 90 | 365>(30);

  useEffect(() => {
    loadAnalytics();
  }, [timePeriod]);

  const loadAnalytics = async () => {
    setLoading(true);

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user?.familyGroupId) return;

      const data = await AnalyticsService.getAnalyticsSummary(
        user.familyGroupId,
        timePeriod
      );

      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    backgroundColor: '#1c1c1e',
    backgroundGradientFrom: '#1c1c1e',
    backgroundGradientTo: '#2c2c2e',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#007AFF',
    },
  };

  const formatCurrency = (amount: number) => `£${amount.toFixed(2)}`;

  const renderTimePeriodSelector = () => (
    <View style={styles.timePeriodContainer}>
      <TouchableOpacity
        style={[styles.timePeriodButton, timePeriod === 30 && styles.timePeriodButtonActive]}
        onPress={() => setTimePeriod(30)}
      >
        <Text style={[styles.timePeriodText, timePeriod === 30 && styles.timePeriodTextActive]}>
          30 Days
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.timePeriodButton, timePeriod === 90 && styles.timePeriodButtonActive]}
        onPress={() => setTimePeriod(90)}
      >
        <Text style={[styles.timePeriodText, timePeriod === 90 && styles.timePeriodTextActive]}>
          90 Days
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.timePeriodButton, timePeriod === 365 && styles.timePeriodButtonActive]}
        onPress={() => setTimePeriod(365)}
      >
        <Text style={[styles.timePeriodText, timePeriod === 365 && styles.timePeriodTextActive]}>
          1 Year
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  if (!analytics || analytics.totalTrips === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>No shopping data available</Text>
        <Text style={styles.emptySubtext}>Complete some shopping trips to see analytics</Text>
      </View>
    );
  }

  // Prepare monthly trend data
  const monthlyLabels = analytics.monthlyTrend.map(trend => {
    const date = new Date(trend.date);
    return date.toLocaleDateString('en-US', { month: 'short' });
  });

  const monthlyData = analytics.monthlyTrend.map(trend => trend.amount);

  // Prepare store spending data (top 5)
  const topStores = analytics.spendingByStore.slice(0, 5);
  const storeLabels = topStores.map(store => store.storeName.substring(0, 10));
  const storeData = topStores.map(store => store.totalSpent);

  // Prepare category pie chart data (top 5)
  const topCategories = analytics.categoryBreakdown.slice(0, 5);
  const categoryColors = ['#007AFF', '#34C759', '#FFD60A', '#FF453A', '#AF52DE'];
  const categoryPieData = topCategories.map((cat, index) => ({
    name: cat.category,
    population: cat.totalSpent,
    color: categoryColors[index] || '#6E6E73',
    legendFontColor: '#ffffff',
    legendFontSize: 12,
  }));

  return (
    <View style={styles.container}>
      {renderTimePeriodSelector()}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>{formatCurrency(analytics.totalSpent)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Shopping Trips</Text>
            <Text style={styles.summaryValue}>{analytics.totalTrips}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Avg per Trip</Text>
            <Text style={styles.summaryValue}>{formatCurrency(analytics.averagePerTrip)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Items Purchased</Text>
            <Text style={styles.summaryValue}>{analytics.itemsPurchased}</Text>
          </View>
        </View>

        {/* Monthly Spending Trend */}
        {analytics.monthlyTrend.length > 1 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Spending Trend</Text>
            <LineChart
              data={{
                labels: monthlyLabels,
                datasets: [{ data: monthlyData }],
              }}
              width={screenWidth - 40}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
          </View>
        )}

        {/* Spending by Store */}
        {topStores.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Store</Text>
            <BarChart
              data={{
                labels: storeLabels,
                datasets: [{ data: storeData }],
              }}
              width={screenWidth - 40}
              height={220}
              yAxisLabel="£"
              yAxisSuffix=""
              chartConfig={chartConfig}
              style={styles.chart}
              showValuesOnTopOfBars
            />
          </View>
        )}

        {/* Category Breakdown */}
        {categoryPieData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Category</Text>
            <PieChart
              data={categoryPieData}
              width={screenWidth - 40}
              height={220}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="15"
              absolute
            />
          </View>
        )}

        {/* Top Items */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Most Purchased Items</Text>
          {analytics.topItems.slice(0, 5).map((item, index) => (
            <View key={item.name} style={styles.topItemRow}>
              <View style={styles.topItemLeft}>
                <Text style={styles.topItemRank}>{index + 1}</Text>
                <Text style={styles.topItemName}>{item.name}</Text>
              </View>
              <View style={styles.topItemRight}>
                <Text style={styles.topItemCount}>{item.purchaseCount}x</Text>
                <Text style={styles.topItemTotal}>{formatCurrency(item.totalSpent)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Store Details */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Store Breakdown</Text>
          {analytics.spendingByStore.map(store => (
            <View key={store.storeName} style={styles.storeDetailRow}>
              <Text style={styles.storeDetailName}>{store.storeName}</Text>
              <View style={styles.storeDetailStats}>
                <Text style={styles.storeDetailTrips}>{store.tripCount} trips</Text>
                <Text style={styles.storeDetailTotal}>{formatCurrency(store.totalSpent)}</Text>
                <Text style={styles.storeDetailAverage}>
                  Avg: {formatCurrency(store.averagePerTrip)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#a0a0a0',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  timePeriodContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  timePeriodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  timePeriodButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  timePeriodText: {
    fontSize: 14,
    color: '#a0a0a0',
    fontWeight: '600',
  },
  timePeriodTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    margin: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 15,
    marginTop: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 15,
  },
  chart: {
    borderRadius: 16,
  },
  topItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  topItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topItemRank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
    width: 30,
  },
  topItemName: {
    fontSize: 15,
    color: '#ffffff',
    flex: 1,
  },
  topItemRight: {
    alignItems: 'flex-end',
  },
  topItemCount: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 2,
  },
  topItemTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#30D158',
  },
  storeDetailRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  storeDetailName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  storeDetailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storeDetailTrips: {
    fontSize: 13,
    color: '#a0a0a0',
  },
  storeDetailTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  storeDetailAverage: {
    fontSize: 13,
    color: '#6E6E73',
  },
  bottomPadding: {
    height: 40,
  },
});

export default AnalyticsScreen;

import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import AnalyticsService, { AnalyticsSummary } from '../../services/AnalyticsService';
import AuthenticationModule from '../../services/AuthenticationModule';

const screenWidth = Dimensions.get('window').width;

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Analytics Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorBoundaryContainer}>
          <Text style={styles.errorBoundaryIcon}>⚠️</Text>
          <Text style={styles.errorBoundaryTitle}>Something went wrong</Text>
          <Text style={styles.errorBoundaryText}>
            {this.state.error?.message || 'Unknown error occurred'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * AnalyticsScreen
 * Displays shopping analytics with charts and insights
 * Implements Sprint 7: Analytics dashboard
 */
const AnalyticsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [timePeriod, setTimePeriod] = useState<30 | 90 | 365>(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wrap in try-catch to prevent white screen
    try {
      loadAnalytics();
    } catch (err: any) {
      console.error('useEffect error:', err);
      setError(err?.message || 'Failed to initialize');
      setLoading(false);
    }
  }, [timePeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user?.familyGroupId) {
        setError('No family group found');
        setLoading(false);
        return;
      }

      const data = await AnalyticsService.getAnalyticsSummary(
        user.familyGroupId,
        timePeriod
      );

      setAnalytics(data);
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      setError(error?.message || 'Failed to load analytics');
      Alert.alert('Error', error?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
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

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyText}>Error loading analytics</Text>
        <Text style={styles.emptySubtext}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAnalytics}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
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

  // Prepare chart data for gifted-charts with safe checks
  let monthlyChartData: any[] = [];
  let storeChartData: any[] = [];
  let categoryPieData: any[] = [];

  try {
    if (Array.isArray(analytics.monthlyTrend)) {
      monthlyChartData = analytics.monthlyTrend.map((trend, index) => {
        const date = new Date(trend.date);
        const label = date.toLocaleDateString('en-US', { month: 'short' });
        return {
          value: trend.amount,
          label: label,
          labelTextStyle: { color: '#a0a0a0', fontSize: 10 },
        };
      });
    }

    if (Array.isArray(analytics.spendingByStore)) {
      storeChartData = analytics.spendingByStore.slice(0, 5).map(store => ({
        value: store.totalSpent,
        label: store.storeName.length > 8 ? store.storeName.substring(0, 8) + '...' : store.storeName,
        labelTextStyle: { color: '#a0a0a0', fontSize: 10 },
        frontColor: '#007AFF',
      }));
    }

    if (Array.isArray(analytics.categoryBreakdown)) {
      const categoryColors = ['#007AFF', '#34C759', '#FFD60A', '#FF453A', '#AF52DE'];
      categoryPieData = analytics.categoryBreakdown.slice(0, 5).map((cat, index) => ({
        value: cat.totalSpent,
        text: cat.category,
        color: categoryColors[index] || '#6E6E73',
      }));
    }
  } catch (err: any) {
    console.error('Error preparing chart data:', err);
  }

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
        {analytics.monthlyTrend.length > 1 && monthlyChartData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Spending Trend</Text>
            <LineChart
              data={monthlyChartData}
              width={screenWidth - 80}
              height={220}
              adjustToWidth={true}
              initialSpacing={0}
              endSpacing={0}
              color="#007AFF"
              thickness={3}
              startFillColor="rgba(0, 122, 255, 0.3)"
              endFillColor="rgba(0, 122, 255, 0.01)"
              startOpacity={0.9}
              endOpacity={0.2}
              areaChart
              curved
              isAnimated
              animateOnDataChange
              animationDuration={800}
              rulesType="solid"
              rulesColor="rgba(255, 255, 255, 0.1)"
              rulesThickness={1}
              xAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisTextStyle={{ color: '#a0a0a0', fontSize: 10 }}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={40}
              hideDataPoints={false}
              dataPointsColor="#007AFF"
              dataPointsRadius={4}
              textColor="#ffffff"
              textFontSize={10}
            />
          </View>
        )}

        {/* Spending by Store */}
        {storeChartData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Store</Text>
            <BarChart
              data={storeChartData}
              width={screenWidth - 80}
              height={220}
              adjustToWidth={true}
              initialSpacing={0}
              barBorderRadius={8}
              isAnimated
              animationDuration={800}
              showValuesAsTopLabel
              topLabelTextStyle={{
                color: '#ffffff',
                fontSize: 12,
                fontWeight: '600',
              }}
              rulesColor="rgba(255, 255, 255, 0.1)"
              rulesThickness={1}
              xAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisTextStyle={{ color: '#a0a0a0', fontSize: 10 }}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={40}
              hideYAxisText={false}
              noOfSections={5}
            />
          </View>
        )}

        {/* Category Breakdown */}
        {categoryPieData.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Category</Text>
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <PieChart
                data={categoryPieData}
                donut
                radius={100}
                innerRadius={65}
                innerCircleColor="#1c1c1e"
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, color: '#ffffff', fontWeight: '700' }}>
                      £{analytics.totalSpent.toFixed(0)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#a0a0a0' }}>Total</Text>
                  </View>
                )}
                showText
                textColor="#ffffff"
                textSize={13}
                fontWeight="600"
                focusOnPress
                toggleFocusOnPress
                sectionAutoFocus={false}
              />
            </View>
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
  retryButton: {
    marginTop: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBoundaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 40,
  },
  errorBoundaryIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorBoundaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBoundaryText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    marginBottom: 20,
  },
});

// Wrap with Error Boundary
const AnalyticsScreenWithErrorBoundary = () => (
  <ErrorBoundary>
    <AnalyticsScreen />
  </ErrorBoundary>
);

export default AnalyticsScreenWithErrorBoundary;

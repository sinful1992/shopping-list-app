import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import AnalyticsService, { AnalyticsSummary } from '../../services/AnalyticsService';
import AuthenticationModule from '../../services/AuthenticationModule';
import PriceHistoryService from '../../services/PriceHistoryService';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../../styles/theme';
import ItemStoreComparison from './ItemStoreComparison';
import VolatileItemsChart from './VolatileItemsChart';
import SmartSavingsCard from './SmartSavingsCard';

const screenWidth = Dimensions.get('window').width;

// ─── Error Boundary ──────────────────────────────────────────────────────────

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
  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSub}>{this.state.error?.message}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'items' | 'stores' | 'prices';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'items',    label: 'Items',    icon: '🛒' },
  { id: 'stores',   label: 'Stores',   icon: '🏪' },
  { id: 'prices',   label: 'Prices',   icon: '💰' },
];

// ─── Stat card config ─────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: 'totalSpent',      label: 'Total Spent',    icon: '£',  color: '#6EA8FE', bg: 'rgba(110,168,254,0.12)' },
  { key: 'totalTrips',      label: 'Shopping Trips', icon: '🛍', color: '#30D158', bg: 'rgba(48,209,88,0.12)'   },
  { key: 'averagePerTrip',  label: 'Avg per Trip',   icon: '~',  color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  { key: 'itemsPurchased',  label: 'Items Bought',   icon: '#',  color: '#FFD60A', bg: 'rgba(255,214,10,0.12)'  },
] as const;

// ─── Main Screen ──────────────────────────────────────────────────────────────

const AnalyticsScreen = () => {
  const { showAlert } = useAlert();
  const [loading, setLoading]         = useState(true);
  const [analytics, setAnalytics]     = useState<AnalyticsSummary | null>(null);
  const [timePeriod, setTimePeriod]   = useState<30 | 90 | 365>(30);
  const [error, setError]             = useState<string | null>(null);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);
  const [trackedItems, setTrackedItems]   = useState<{ itemName: string; itemNameNormalized: string }[]>([]);
  const [activeTab, setActiveTab]     = useState<Tab>('overview');

  useEffect(() => {
    try { loadAnalytics(); } catch (err: any) {
      setError(err?.message || 'Failed to initialize');
      setLoading(false);
    }
  }, [timePeriod]);

  useEffect(() => {
    (async () => {
      try {
        const user = await AuthenticationModule.getCurrentUser();
        if (!user?.familyGroupId) return;
        setFamilyGroupId(user.familyGroupId);
        const items = await PriceHistoryService.getAllTrackedItems(user.familyGroupId);
        setTrackedItems(items);
      } catch {}
    })();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user?.familyGroupId) { setError('No family group found'); setLoading(false); return; }
      const data = await AnalyticsService.getAnalyticsSummary(user.familyGroupId, timePeriod);
      setAnalytics(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
      showAlert('Error', err?.message || 'Failed to load analytics', undefined, { icon: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `£${n.toFixed(2)}`;

  // ── Loading / Error / Empty ────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.accent.blue} />
        <Text style={styles.loadingText}>Loading analytics…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Error loading analytics</Text>
        <Text style={styles.errorSub}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadAnalytics}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!analytics || analytics.totalTrips === 0) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 52, marginBottom: 12 }}>📊</Text>
        <Text style={styles.errorTitle}>No data yet</Text>
        <Text style={styles.errorSub}>Complete some shopping trips to see analytics</Text>
      </View>
    );
  }

  // ── Chart data ─────────────────────────────────────────────────────────────

  let monthlyChartData: any[] = [];
  let storeChartData:   any[] = [];
  let categoryPieData:  any[] = [];

  try {
    if (Array.isArray(analytics.monthlyTrend)) {
      monthlyChartData = analytics.monthlyTrend.map(trend => ({
        value: trend.amount,
        label: new Date(trend.date).toLocaleDateString('en-US', { month: 'short' }),
        labelTextStyle: { color: COLORS.text.secondary, fontSize: 10 },
      }));
    }
    if (Array.isArray(analytics.spendingByStore)) {
      storeChartData = analytics.spendingByStore.slice(0, 5).map(store => ({
        value: store.totalSpent,
        label: store.storeName.length > 8 ? store.storeName.slice(0, 8) + '…' : store.storeName,
        labelTextStyle: { color: COLORS.text.secondary, fontSize: 10 },
        frontColor: COLORS.accent.blue,
      }));
    }
    if (Array.isArray(analytics.categoryBreakdown)) {
      const PIE_COLORS = [COLORS.accent.blue, COLORS.accent.green, '#FFD60A', '#FF453A', COLORS.accent.purple];
      categoryPieData = analytics.categoryBreakdown.slice(0, 5).map((cat, i) => ({
        value: cat.totalSpent,
        text: cat.category,
        color: PIE_COLORS[i] || '#6E6E73',
      }));
    }
  } catch {}

  const CHART_W = screenWidth - 62;

  // ── Tab content renderers ─────────────────────────────────────────────────

  const renderOverviewTab = () => (
    <>
      {/* Monthly trend */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending Trend</Text>
        <Text style={styles.cardSub}>Monthly spend over the selected period</Text>
        {analytics.monthlyTrend.length > 1 && monthlyChartData.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <LineChart
              data={monthlyChartData}
              width={CHART_W - 24}
              height={180}
              adjustToWidth
              initialSpacing={0}
              endSpacing={0}
              color={COLORS.accent.blue}
              thickness={3}
              startFillColor="rgba(110,168,254,0.3)"
              endFillColor="rgba(110,168,254,0.01)"
              areaChart
              curved
              isAnimated
              animateOnDataChange
              animationDuration={700}
              rulesType="solid"
              rulesColor="rgba(255,255,255,0.07)"
              xAxisColor="transparent"
              yAxisColor="transparent"
              yAxisTextStyle={{ color: COLORS.text.secondary, fontSize: 10 }}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={38}
              hideDataPoints={false}
              dataPointsColor={COLORS.accent.blue}
              dataPointsRadius={4}
            />
          </View>
        ) : (
          <Text style={styles.noData}>Not enough data to display trend</Text>
        )}
      </View>

      {/* Category breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by Category</Text>
        <Text style={styles.cardSub}>What you spend most on</Text>
        {categoryPieData.length > 0 ? (
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <PieChart
              data={categoryPieData}
              donut
              radius={72}
              innerRadius={46}
              innerCircleColor="#12121C"
              centerLabelComponent={() => (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>
                    £{analytics.totalSpent.toFixed(0)}
                  </Text>
                  <Text style={{ fontSize: 10, color: COLORS.text.secondary }}>total</Text>
                </View>
              )}
              focusOnPress
              sectionAutoFocus={false}
            />
            {/* Legend */}
            <View style={{ flex: 1, gap: 8 }}>
              {categoryPieData.map((item: any) => (
                <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                  <Text style={{ flex: 1, fontSize: 12, color: COLORS.text.secondary }} numberOfLines={1}>
                    {item.text}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>
                    £{item.value.toFixed(0)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.noData}>No category data available</Text>
        )}
      </View>
    </>
  );

  const renderItemsTab = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Most Purchased</Text>
      <Text style={styles.cardSub}>Your top items by frequency</Text>
      <View style={{ marginTop: 12, gap: 2 }}>
        {analytics.topItems.slice(0, 8).map((item, index) => {
          const RANK_COLORS = ['#FFD60A', '#C0C0C0', '#CD7F32'];
          const rankColor = RANK_COLORS[index] ?? COLORS.text.secondary;
          return (
            <View key={item.name} style={styles.itemRow}>
              {/* Rank badge */}
              <View style={[styles.rankBadge, { borderColor: rankColor + '60' }]}>
                <Text style={[styles.rankText, { color: rankColor }]}>{index + 1}</Text>
              </View>
              {/* Name */}
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {/* Stats */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.itemCount}>{item.purchaseCount}× bought</Text>
                <Text style={styles.itemSpend}>{fmt(item.totalSpent)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderStoresTab = () => (
    <>
      {/* Bar chart */}
      {storeChartData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spend by Store</Text>
          <Text style={styles.cardSub}>Total spent at each location</Text>
          <View style={{ marginTop: 12 }}>
            <BarChart
              data={storeChartData}
              width={CHART_W - 24}
              height={180}
              adjustToWidth
              initialSpacing={0}
              barBorderRadius={6}
              isAnimated
              animationDuration={700}
              showValuesAsTopLabel
              topLabelTextStyle={{ color: '#fff', fontSize: 11, fontWeight: '600' }}
              rulesColor="rgba(255,255,255,0.07)"
              xAxisColor="transparent"
              yAxisColor="transparent"
              yAxisTextStyle={{ color: COLORS.text.secondary, fontSize: 10 }}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={38}
              noOfSections={4}
            />
          </View>
        </View>
      )}

      {/* Store detail list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Store Breakdown</Text>
        <Text style={styles.cardSub}>Trips, totals, and averages</Text>
        <View style={{ marginTop: 12, gap: 12 }}>
          {analytics.spendingByStore.map((store) => {
            const lowestAvg = Math.min(...analytics.spendingByStore.map(s => s.averagePerTrip));
            const mostVisited = Math.max(...analytics.spendingByStore.map(s => s.tripCount));
            const isBest    = store.averagePerTrip === lowestAvg && analytics.spendingByStore.length > 1;
            const isMost    = store.tripCount === mostVisited && analytics.spendingByStore.length > 1;

            return (
              <View key={store.storeName} style={styles.storeRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={styles.storeName}>{store.storeName}</Text>
                    {isBest && <View style={styles.pill}><Text style={[styles.pillText, { color: COLORS.accent.green }]}>Best avg</Text></View>}
                    {isMost && !isBest && <View style={styles.pill}><Text style={[styles.pillText, { color: COLORS.accent.blue }]}>Most visited</Text></View>}
                  </View>
                  {/* Progress bar: proportion of total spend */}
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${(store.totalSpent / analytics.totalSpent) * 100}%` as any,
                      backgroundColor: isBest ? COLORS.accent.green : COLORS.accent.blue,
                    }]} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                  <Text style={styles.storeTotal}>{fmt(store.totalSpent)}</Text>
                  <Text style={styles.storeMeta}>{store.tripCount} trips · avg {fmt(store.averagePerTrip)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </>
  );

  const renderPricesTab = () => (
    <>
      {familyGroupId ? (
        <>
          <ItemStoreComparison familyGroupId={familyGroupId} trackedItems={trackedItems} />
          <VolatileItemsChart familyGroupId={familyGroupId} />
          <SmartSavingsCard familyGroupId={familyGroupId} trackedItems={trackedItems} />
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.noData}>No price data available yet</Text>
        </View>
      )}
    </>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>

      {/* ── Time period selector ─────────────────────────────────────────── */}
      <View style={styles.periodRow}>
        {([30, 90, 365] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, timePeriod === p && styles.periodBtnActive]}
            onPress={() => setTimePeriod(p)}
          >
            <Text style={[styles.periodText, timePeriod === p && styles.periodTextActive]}>
              {p === 365 ? '1 Year' : `${p} Days`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 2×2 Stat grid ────────────────────────────────────────────────── */}
      <View style={styles.statGrid}>
        {STAT_CONFIG.map(cfg => {
          const raw  = analytics[cfg.key as keyof AnalyticsSummary] as number;
          const value = cfg.key === 'totalSpent' || cfg.key === 'averagePerTrip'
            ? fmt(raw)
            : String(raw);
          return (
            <View key={cfg.key} style={[styles.statCard, { backgroundColor: cfg.bg, borderColor: cfg.color + '30' }]}>
              <Text style={[styles.statIcon, { color: cfg.color }]}>{cfg.icon}</Text>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{cfg.label}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'items'    && renderItemsTab()}
        {activeTab === 'stores'   && renderStoresTab()}
        {activeTab === 'prices'   && renderPricesTab()}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },

  // ── Loading / Error / Empty ───────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background.primary,
    paddingHorizontal: 40,
  },
  loadingText: { marginTop: 14, fontSize: 15, color: COLORS.text.secondary },
  errorIcon:  { fontSize: 52, marginBottom: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6, textAlign: 'center' },
  errorSub:   { fontSize: 14, color: COLORS.text.secondary, textAlign: 'center', marginBottom: 20 },
  retryBtn:   { backgroundColor: 'rgba(110,168,254,0.8)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // ── Period row ────────────────────────────────────────────────────────────
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.large,
    alignItems: 'center',
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
  },
  periodBtnActive: {
    backgroundColor: 'rgba(110,168,254,0.2)',
    borderColor: COLORS.accent.blue,
  },
  periodText:       { fontSize: 13, fontWeight: '600', color: COLORS.text.secondary },
  periodTextActive: { color: COLORS.accent.blue },

  // ── 2×2 Stat grid ─────────────────────────────────────────────────────────
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  statCard: {
    width: (screenWidth - 32) / 2 - 4,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  statIcon:  { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 12, color: COLORS.text.secondary },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: COLORS.glass.subtle,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.medium,
  },
  tabActive: {
    backgroundColor: 'rgba(110,168,254,0.18)',
  },
  tabIcon:  { fontSize: 13 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text.secondary },
  tabLabelActive: { color: COLORS.accent.blue },

  // ── Scroll area ───────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 12,
  },

  // ── Shared card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.glass.subtle,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardSub:   { fontSize: 12, color: COLORS.text.secondary, marginTop: 2 },
  noData:    { fontSize: 13, color: COLORS.text.secondary, fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },

  // ── Items tab ─────────────────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText:  { fontSize: 12, fontWeight: '700' },
  itemName:  { flex: 1, fontSize: 14, color: '#fff', fontWeight: '500' },
  itemCount: { fontSize: 11, color: COLORS.text.secondary },
  itemSpend: { fontSize: 14, fontWeight: '700', color: COLORS.accent.green, marginTop: 1 },

  // ── Stores tab ────────────────────────────────────────────────────────────
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeName:  { fontSize: 15, fontWeight: '600', color: '#fff' },
  storeTotal: { fontSize: 16, fontWeight: '700', color: '#fff' },
  storeMeta:  { fontSize: 11, color: COLORS.text.secondary, marginTop: 2 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700' },
  progressBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});

// ─── Export ───────────────────────────────────────────────────────────────────

const AnalyticsScreenWithErrorBoundary = () => (
  <ErrorBoundary>
    <AnalyticsScreen />
  </ErrorBoundary>
);

export default AnalyticsScreenWithErrorBoundary;

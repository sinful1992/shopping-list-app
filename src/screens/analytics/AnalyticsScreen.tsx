import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import AnalyticsService, { AnalyticsSummary } from '../../services/AnalyticsService';
import { useUser } from '../../contexts/UserContext';
import PriceHistoryService from '../../services/PriceHistoryService';
import CrashReporting from '../../services/CrashReporting';
import { RADIUS, NUMERIC } from '../../styles/theme';
import type { Theme } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ErrorBoundary from '../../components/ErrorBoundary';
import ItemStoreComparison from './ItemStoreComparison';
import VolatileItemsChart from './VolatileItemsChart';
import SmartSavingsCard from './SmartSavingsCard';

const screenWidth = Dimensions.get('window').width;

const PieCenterLabel = ({ totalSpent, containerStyle, totalStyle, labelStyle }: {
  totalSpent: number;
  containerStyle: ViewStyle;
  totalStyle: TextStyle;
  labelStyle: TextStyle;
}) => (
  <View style={containerStyle}>
    <Text style={totalStyle}>£{totalSpent.toFixed(0)}</Text>
    <Text style={labelStyle}>total</Text>
  </View>
);

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
  const user = useUser();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod, user?.familyGroupId]);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.familyGroupId) return;
        setFamilyGroupId(user.familyGroupId);
        const items = await PriceHistoryService.getAllTrackedItems(user.familyGroupId);
        setTrackedItems(items);
      } catch (e) {
        CrashReporting.recordError(e as Error, 'AnalyticsScreen load tracked items');
      }
    })();
  }, [user?.familyGroupId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
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
        <ActivityIndicator size="large" color={theme.accent.blue} />
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
        <Text style={styles.noDataIcon}>📊</Text>
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
        label: new Date(trend.date).toLocaleDateString('en-GB', { month: 'short' }),
        labelTextStyle: { color: theme.text.secondary, fontSize: 10 },
      }));
    }
    if (Array.isArray(analytics.spendingByStore)) {
      storeChartData = analytics.spendingByStore.slice(0, 5).map(store => ({
        value: store.totalSpent,
        label: store.storeName.length > 8 ? store.storeName.slice(0, 8) + '…' : store.storeName,
        labelTextStyle: { color: theme.text.secondary, fontSize: 10 },
        frontColor: theme.accent.blue,
      }));
    }
    if (Array.isArray(analytics.categoryBreakdown)) {
      const PIE_COLORS = [theme.accent.blue, theme.accent.green, '#FFD60A', '#FF453A', theme.accent.purple];
      categoryPieData = analytics.categoryBreakdown.slice(0, 5).map((cat, i) => ({
        value: cat.totalSpent,
        text: cat.category,
        color: PIE_COLORS[i] || '#6E6E73',
      }));
    }
  } catch (e) {
    CrashReporting.recordError(e as Error, 'AnalyticsScreen chart data mapping');
  }

  const CHART_W = screenWidth - 62;

  // ── Tab content renderers ─────────────────────────────────────────────────

  const renderOverviewTab = () => (
    <>
      {/* Monthly trend */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending Trend</Text>
        <Text style={styles.cardSub}>Monthly spend over the selected period</Text>
        {analytics.monthlyTrend.length > 1 && monthlyChartData.length > 0 ? (
          <View style={styles.chartWrapper}>
            <LineChart
              data={monthlyChartData}
              width={CHART_W - 24}
              height={180}
              adjustToWidth
              initialSpacing={0}
              endSpacing={0}
              color={theme.accent.blue}
              thickness={3}
              startFillColor="rgba(110,168,254,0.3)"
              endFillColor="rgba(110,168,254,0.01)"
              areaChart
              curved
              isAnimated
              animateOnDataChange
              animationDuration={700}
              rulesType="solid"
              rulesColor={theme.border.subtle}
              xAxisColor="transparent"
              yAxisColor="transparent"
              yAxisTextStyle={styles.chartAxisStyle}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={38}
              hideDataPoints={false}
              dataPointsColor={theme.accent.blue}
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
          <View style={styles.pieWrapper}>
            <PieChart
              data={categoryPieData}
              donut
              radius={72}
              innerRadius={46}
              innerCircleColor={theme.glass.subtle}
              centerLabelComponent={() => (
                <PieCenterLabel
                  totalSpent={analytics.totalSpent}
                  containerStyle={styles.pieCenterContainer}
                  totalStyle={styles.pieCenterTotal}
                  labelStyle={styles.pieCenterLabel}
                />
              )}
              focusOnPress
              sectionAutoFocus={false}
            />
            {/* Legend */}
            <View style={styles.legendContainer}>
              {categoryPieData.map((item: any) => {
                const dotColorStyle = { backgroundColor: item.color };
                return (
                  <View key={item.text} style={styles.legendItem}>
                    <View style={[styles.legendDot, dotColorStyle]} />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {item.text}
                    </Text>
                    <Text style={styles.legendValue}>
                      £{item.value.toFixed(0)}
                    </Text>
                  </View>
                );
              })}
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
      <View style={styles.itemsContainer}>
        {analytics.topItems.slice(0, 8).map((item, index) => {
          const RANK_COLORS = ['#FFD60A', '#C0C0C0', '#CD7F32'];
          const rankColor = RANK_COLORS[index] ?? theme.text.secondary;
          const rankBorderStyle = { borderColor: rankColor + '60' };
          const rankColorStyle = { color: rankColor };
          return (
            <View key={item.name} style={styles.itemRow}>
              {/* Rank badge */}
              <View style={[styles.rankBadge, rankBorderStyle]}>
                <Text style={[styles.rankText, rankColorStyle]}>{index + 1}</Text>
              </View>
              {/* Name */}
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {/* Stats */}
              <View style={styles.itemStatsColumn}>
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
          <View style={styles.chartWrapper}>
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
              topLabelTextStyle={styles.chartTopLabel}
              rulesColor={theme.border.subtle}
              xAxisColor="transparent"
              yAxisColor="transparent"
              yAxisTextStyle={styles.chartAxisStyle}
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
        <View style={styles.storeListContainer}>
          {analytics.spendingByStore.map((store) => {
            const lowestAvg = Math.min(...analytics.spendingByStore.map(s => s.averagePerTrip));
            const mostVisited = Math.max(...analytics.spendingByStore.map(s => s.tripCount));
            const isBest    = store.averagePerTrip === lowestAvg && analytics.spendingByStore.length > 1;
            const isMost    = store.tripCount === mostVisited && analytics.spendingByStore.length > 1;
            const progressFillStyle = {
              width: `${(store.totalSpent / analytics.totalSpent) * 100}%` as any,
              backgroundColor: isBest ? theme.accent.green : theme.accent.blue,
            };

            return (
              <View key={store.storeName} style={styles.storeRow}>
                <View style={styles.storeFlexLeft}>
                  <View style={styles.storeNameRow}>
                    <Text style={styles.storeName}>{store.storeName}</Text>
                    {isBest && <View style={styles.pill}><Text style={[styles.pillText, styles.pillTextGreen]}>Best avg</Text></View>}
                    {isMost && !isBest && <View style={styles.pill}><Text style={[styles.pillText, styles.pillTextBlue]}>Most visited</Text></View>}
                  </View>
                  {/* Progress bar: proportion of total spend */}
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, progressFillStyle]} />
                  </View>
                </View>
                <View style={styles.storeStatsColumn}>
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
          const statCardStyle = { backgroundColor: cfg.bg, borderColor: cfg.color + '30' };
          const statIconColorStyle = { color: cfg.color };
          return (
            <View key={cfg.key} style={[styles.statCard, statCardStyle]}>
              <Text style={[styles.statIcon, statIconColorStyle]}>{cfg.icon}</Text>
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
        style={styles.scrollFlex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'items'    && renderItemsTab()}
        {activeTab === 'stores'   && renderStoresTab()}
        {activeTab === 'prices'   && renderPricesTab()}
        <View style={styles.spacer32} />
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (theme: Theme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },

  // ── Loading / Error / Empty ───────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
    paddingHorizontal: 40,
  },
  loadingText: { marginTop: 14, fontSize: 15, color: theme.text.secondary },
  errorIcon:  { fontSize: 52, marginBottom: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: theme.text.primary, marginBottom: 6, textAlign: 'center' },
  errorSub:   { fontSize: 14, color: theme.text.secondary, textAlign: 'center', marginBottom: 20 },
  retryBtn:   { backgroundColor: theme.accent.blueLight, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // ── Period row ────────────────────────────────────────────────────────────
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.large,
    alignItems: 'center',
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  periodBtnActive: {
    backgroundColor: theme.accent.blueSubtle,
    borderColor: theme.accent.blue,
  },
  periodText:       { fontSize: 13, fontWeight: '600', color: theme.text.secondary },
  periodTextActive: { color: theme.accent.blue },

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
  statValue: { ...NUMERIC, fontSize: 22, fontWeight: '700', color: theme.text.primary, marginBottom: 2 },
  statLabel: { fontSize: 12, color: theme.text.secondary },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: theme.border.medium,
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
    backgroundColor: theme.accent.blueSubtle,
  },
  tabIcon:  { fontSize: 13 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: theme.text.secondary },
  tabLabelActive: { color: theme.accent.blue },

  // ── Scroll area ───────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 12,
  },

  // ── Shared card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text.primary },
  cardSub:   { fontSize: 12, color: theme.text.secondary, marginTop: 2 },
  noData:    { fontSize: 13, color: theme.text.secondary, fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },

  // ── Items tab ─────────────────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
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
  itemName:  { flex: 1, fontSize: 14, color: theme.text.primary, fontWeight: '500' },
  itemCount: { fontSize: 11, color: theme.text.secondary },
  itemSpend: { fontSize: 14, fontWeight: '700', color: theme.accent.green, marginTop: 1 },

  // ── Stores tab ────────────────────────────────────────────────────────────
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeName:  { fontSize: 15, fontWeight: '600', color: theme.text.primary },
  storeTotal: { ...NUMERIC, fontSize: 16, fontWeight: '700', color: theme.text.primary },
  storeMeta:  { fontSize: 11, color: theme.text.secondary, marginTop: 2 },
  pill: {
    backgroundColor: theme.glass.elevated,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700' },
  progressBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.glass.elevated,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── No-data screen ────────────────────────────────────────────────────────
  noDataIcon: { fontSize: 52, marginBottom: 12 },

  // ── Chart helpers ─────────────────────────────────────────────────────────
  chartWrapper: { marginTop: 12 },
  chartTopLabel: { color: theme.text.primary, fontSize: 11, fontWeight: '600' as const },
  chartAxisStyle: { color: theme.text.secondary, fontSize: 10 },

  // ── Overview – pie section ────────────────────────────────────────────────
  pieWrapper: { marginTop: 16, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 20 },
  pieCenterContainer: { alignItems: 'center' as const },
  pieCenterTotal: { ...NUMERIC, fontSize: 14, color: theme.text.primary, fontWeight: '700' as const },
  pieCenterLabel: { fontSize: 10, color: theme.text.secondary },
  legendContainer: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { flex: 1, fontSize: 12, color: theme.text.secondary },
  legendValue: { ...NUMERIC, fontSize: 12, color: theme.text.primary, fontWeight: '600' as const },

  // ── Items tab ─────────────────────────────────────────────────────────────
  itemsContainer: { marginTop: 12, gap: 2 },
  itemStatsColumn: { alignItems: 'flex-end' as const },

  // ── Stores tab ────────────────────────────────────────────────────────────
  storeListContainer: { marginTop: 12, gap: 12 },
  storeFlexLeft: { flex: 1 },
  storeNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 },
  pillTextGreen: { color: theme.accent.green },
  pillTextBlue: { color: theme.accent.blue },
  storeStatsColumn: { alignItems: 'flex-end' as const, marginLeft: 12 },

  // ── Layout ────────────────────────────────────────────────────────────────
  scrollFlex: { flex: 1 },
  spacer32: { height: 32 },
});

// ─── Export ───────────────────────────────────────────────────────────────────

const AnalyticsScreenWithErrorBoundary = () => (
  <ErrorBoundary>
    <AnalyticsScreen />
  </ErrorBoundary>
);

export default AnalyticsScreenWithErrorBoundary;

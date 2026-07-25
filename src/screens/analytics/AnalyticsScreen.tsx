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
import Icon from 'react-native-vector-icons/Ionicons';
import { RADIUS, NUMERIC, SPACING, TYPOGRAPHY, SHADOWS, RECEIPT_FONT } from '../../styles/theme';
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

// Ionicons rather than emoji, matching the rest of the app after the 1.35.0
// icon sweep. The filled variant marks the active tab, so the selection reads
// without relying on the tint alone. Both names in every pair were checked
// against the installed glyphmap — a wrong name renders as nothing, silently.
type Tab = 'overview' | 'items' | 'stores' | 'prices';
const TABS: { id: Tab; label: string; icon: string; iconActive: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { id: 'items',    label: 'Items',    icon: 'cart-outline',        iconActive: 'cart'        },
  { id: 'stores',   label: 'Stores',   icon: 'storefront-outline',  iconActive: 'storefront'  },
  { id: 'prices',   label: 'Prices',   icon: 'pricetag-outline',    iconActive: 'pricetag'    },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

const AnalyticsScreen = () => {
  const { showAlert } = useAlert();
  const user = useUser();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const rankColors = useMemo(
    () => [theme.medal.gold, theme.medal.silver, theme.medal.bronze],
    [theme],
  );
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
        <Icon name="alert-circle-outline" size={52} color={theme.accent.red} style={styles.stateIcon} />
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
        <Icon name="bar-chart-outline" size={52} color={theme.text.tertiary} style={styles.stateIcon} />
        <Text style={styles.errorTitle}>No data yet</Text>
        <Text style={styles.errorSub}>Complete a few shopping trips and your spending trends appear here</Text>
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
      // All five from the theme (two were pinned dark-theme hexes, so in light
      // mode the pie came out three muted colours and two neon ones), ordered
      // so red and green are never adjacent slices.
      const PIE_COLORS = [
        theme.accent.blue,
        theme.accent.orange,
        theme.accent.green,
        theme.accent.purple,
        theme.accent.red,
      ];
      categoryPieData = analytics.categoryBreakdown.slice(0, 5).map((cat, i) => ({
        value: cat.totalSpent,
        text: cat.category,
        color: PIE_COLORS[i] || theme.text.tertiary,
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
      <View>
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
              startFillColor={theme.accent.blue}
              startOpacity={0.3}
              endFillColor={theme.accent.blue}
              endOpacity={0.01}
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
      <View>
        <Text style={styles.cardTitle}>Spending by Category</Text>
        <Text style={styles.cardSub}>What you spend most on</Text>
        {categoryPieData.length > 0 ? (
          <View style={styles.pieWrapper}>
            <PieChart
              data={categoryPieData}
              donut
              radius={72}
              innerRadius={46}
              innerCircleColor={theme.background.primary}
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
    <View>
      <Text style={styles.cardTitle}>Most Purchased</Text>
      <Text style={styles.cardSub}>Your top items by frequency</Text>
      <View style={styles.itemsContainer}>
        {analytics.topItems.slice(0, 8).map((item, index) => {
          const rankColor = rankColors[index] ?? theme.text.secondary;
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
        <View>
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
      <View>
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
        <View>
          <Text style={styles.noData}>No price data available yet</Text>
        </View>
      )}
    </>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>

      {/* ── Tab bar — the only pinned chrome ─────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Icon
                name={active ? tab.iconActive : tab.icon}
                size={15}
                color={active ? theme.accent.blue : theme.text.secondary}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Everything else scrolls ──────────────────────────────────────── */}
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Period filter */}
        <View style={styles.segmented}>
          {([30, 90, 365] as const).map(p => {
            const active = timePeriod === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setTimePeriod(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {p === 365 ? '1 Year' : `${p} Days`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Period total, set as a till-roll total line */}
        <View style={styles.totalBlock}>
          <View style={styles.rule} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL SPENT</Text>
            <Text style={styles.totalValue} numberOfLines={1}>{fmt(analytics.totalSpent)}</Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.totalMeta}>
            <Text style={styles.totalMetaStrong}>{analytics.totalTrips}</Text> trips
            {'   ·   '}
            <Text style={styles.totalMetaStrong}>{fmt(analytics.averagePerTrip)}</Text> avg
            {'   ·   '}
            <Text style={styles.totalMetaStrong}>{analytics.itemsPurchased}</Text> items
          </Text>
        </View>

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
  loadingText: { marginTop: 14, fontSize: 14, color: theme.text.secondary },
  stateIcon:  { marginBottom: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: theme.text.primary, marginBottom: 6, textAlign: 'center' },
  errorSub:   { fontSize: 14, color: theme.text.secondary, textAlign: 'center', marginBottom: 20 },
  retryBtn:   { backgroundColor: theme.accent.blue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: theme.text.onAccent, fontSize: 14, fontWeight: '600' },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  // The only thing that stays put. It is navigation, so it has to stay
  // reachable; the summary and the period filter below it are read once and
  // then scrolled past, and pinning them cost ~290dp of a ~755dp screen.
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.large,
    padding: SPACING.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.medium,
  },
  tabActive: {
    backgroundColor: theme.accent.blueSubtle,
  },
  tabLabel: { fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: '600', color: theme.text.secondary },
  tabLabelActive: { color: theme.accent.blue },

  // ── Period filter ─────────────────────────────────────────────────────────
  // A segmented control, not pills: the active segment reads as a raised
  // surface rather than a tint, so this does not look like a second tab bar
  // when it scrolls up under the real one.
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.small,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: RADIUS.small - 2,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: theme.background.secondary,
    ...SHADOWS.small,
  },
  segmentText:       { fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: '600', color: theme.text.secondary },
  segmentTextActive: { color: theme.text.primary },

  // ── Period total ──────────────────────────────────────────────────────────
  // The app's own till-roll idiom, reused on the screen that is entirely about
  // money: label left, figure right, ruled above and below, set in the receipt
  // mono. This is the only ruled element on the screen, so a rule here means
  // "this is the total" rather than "this is a box".
  totalBlock: { marginTop: SPACING.xs },
  rule: { height: 1, backgroundColor: theme.border.medium },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  totalLabel: {
    fontFamily: RECEIPT_FONT,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.text.secondary,
  },
  // 32 rather than 36: the widest realistic figure is £99999.99, which at this
  // size is ~173dp of a ~371dp content width, leaving room for the label.
  totalValue: {
    ...NUMERIC,
    fontFamily: RECEIPT_FONT,
    fontSize: TYPOGRAPHY.fontSize.displayLg,
    fontWeight: '700',
    color: theme.text.primary,
  },
  // The small print under the total. Same size throughout — the figures are
  // separated from their units by weight and colour, not by scale.
  totalMeta: {
    fontFamily: RECEIPT_FONT,
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: theme.text.secondary,
    marginTop: SPACING.sm,
  },
  totalMetaStrong: { color: theme.text.primary, fontWeight: '700' },

  // ── Scroll area ───────────────────────────────────────────────────────────
  // gap replaces what card borders used to do: sections are separated by
  // space, so the screen has one framing level instead of five.
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    gap: SPACING.xxl,
  },

  // ── Shared section ────────────────────────────────────────────────────────
  cardTitle: { fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: '700', color: theme.text.primary },
  cardSub:   { fontSize: TYPOGRAPHY.fontSize.sm, color: theme.text.secondary, marginTop: 2 },
  noData:    { fontSize: TYPOGRAPHY.fontSize.sm, color: theme.text.secondary, fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },

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
  itemCount: { fontSize: 12, color: theme.text.secondary },
  itemSpend: { fontSize: 14, fontWeight: '700', color: theme.accent.green, marginTop: 1 },

  // ── Stores tab ────────────────────────────────────────────────────────────
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeName:  { fontSize: 14, fontWeight: '600', color: theme.text.primary },
  storeTotal: { ...NUMERIC, fontSize: 16, fontWeight: '700', color: theme.text.primary },
  storeMeta:  { fontSize: 12, color: theme.text.secondary, marginTop: 2 },
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

  // ── Chart helpers ─────────────────────────────────────────────────────────
  // Chart widths are unchanged from when each sat inside a padded card, so
  // they are now narrower than the space available — centre them rather than
  // widening, which would risk the y-axis labels overflowing on a small screen.
  chartWrapper: { marginTop: SPACING.md, alignItems: 'center' },
  chartTopLabel: { color: theme.text.primary, fontSize: 12, fontWeight: '600' as const },
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

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAlert } from '../../contexts/AlertContext';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import AnalyticsService, { AnalyticsSummary } from '../../services/AnalyticsService';
import { OTHER_CATEGORY, safeDiv, UNKNOWN_STORE } from '../../services/analyticsAggregation';
import { capitalize } from '../../utils/itemGrouping';
import { useUser } from '../../contexts/UserContext';
import PriceHistoryService from '../../services/PriceHistoryService';
import CrashReporting from '../../services/CrashReporting';
import Icon from 'react-native-vector-icons/Ionicons';
import { RADIUS, NUMERIC, SPACING, TYPOGRAPHY, RECEIPT_FONT } from '../../styles/theme';
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
  const [refreshing, setRefreshing]   = useState(false);
  const [analytics, setAnalytics]     = useState<AnalyticsSummary | null>(null);
  const [timePeriod, setTimePeriod]   = useState<30 | 90 | 365>(30);
  const [error, setError]             = useState<string | null>(null);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);
  const [trackedItems, setTrackedItems]   = useState<{ itemName: string; itemNameNormalized: string }[]>([]);
  const [activeTab, setActiveTab]     = useState<Tab>('overview');
  // Bumped on every reload; the Prices tab's children key their fetches off it
  // so a pull-to-refresh reaches them too, now that they stay mounted.
  const [reloadKey, setReloadKey]     = useState(0);

  // Tabs stay mounted once opened, so the Prices tab keeps its selected item
  // and its three loaded datasets across a trip to Overview and back. Mounting
  // is still lazy — an unopened Prices tab costs nothing.
  const [openedTabs, setOpenedTabs] = useState<Tab[]>(['overview']);

  // The summary and the period filter scroll with the content now, so
  // switching tabs while scrolled down would drop you into the middle of the
  // new tab with both of them off screen. Every tab starts at the top.
  const scrollRef = useRef<ScrollView>(null);
  const selectTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setOpenedTabs(prev => (prev.includes(tab) ? prev : [...prev, tab]));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const loadAnalytics = useCallback(async (mode: 'full' | 'refresh' = 'full') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      if (!user?.familyGroupId) { setError('No family group found'); return; }
      const data = await AnalyticsService.getAnalyticsSummary(user.familyGroupId, timePeriod);
      setAnalytics(data);
      setReloadKey(k => k + 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
      if (mode === 'full') {
        showAlert('Error', err?.message || 'Failed to load analytics', undefined, { icon: 'error' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.familyGroupId, timePeriod, showAlert]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // This is a bottom-tab screen, so it stays mounted: without this, finishing
  // a shop and tapping Analytics showed the figures from before the trip until
  // the app was restarted.
  //
  // The callback has to be dependency-free, as HistoryScreen's does. It is not
  // an ordinary effect — useFocusEffect re-runs whenever the callback's
  // identity changes, so depending on loadAnalytics (which changes with the
  // period) fired a second, concurrent load on every period tap.
  const loadAnalyticsRef = useRef(loadAnalytics);
  useEffect(() => { loadAnalyticsRef.current = loadAnalytics; }, [loadAnalytics]);
  const initialLoadDone = useRef(false);
  useFocusEffect(useCallback(() => {
    if (initialLoadDone.current) loadAnalyticsRef.current('refresh');
    else initialLoadDone.current = true;
  }, []));

  const onRefresh = useCallback(() => { loadAnalytics('refresh'); }, [loadAnalytics]);

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

  const fmt = (n: number) => `£${n.toFixed(2)}`;
  const plural = (count: number, word: string) => (count === 1 ? word : `${word}s`);
  // The bucket is keyed 'Unknown' so the breakdown still sums to the period
  // total, but it sat at the top of the list reading like a shop called
  // Unknown. Only the label changes; the row stays.
  const storeLabel = (name: string) => (name === UNKNOWN_STORE ? 'No store recorded' : name);

  // ── Chart data ─────────────────────────────────────────────────────────────
  // Memoised: these were rebuilt on every render, date formatting and all.

  const trendChartData = useMemo(() => {
    const trend = analytics?.spendingTrend;
    if (!Array.isArray(trend)) return [];
    // A week is labelled by the date it starts, a month by its name.
    const format: Intl.DateTimeFormatOptions = analytics?.trendBucket === 'week'
      ? { day: 'numeric', month: 'short' }
      : { month: 'short' };
    // Now that quiet periods get a bucket the series is as long as the
    // window, and a year is thirteen monthly labels across ~300dp — they
    // collide. Label every other bucket past eight, counted back from the end
    // so the most recent one is always the labelled one.
    const stride = trend.length > 8 ? 2 : 1;
    return trend.map((point, i) => ({
      value: point.amount,
      label: (trend.length - 1 - i) % stride === 0
        ? new Date(point.date).toLocaleDateString('en-GB', format)
        : '',
      labelTextStyle: { color: theme.text.secondary, fontSize: 10 },
    }));
  }, [analytics?.spendingTrend, analytics?.trendBucket, theme]);

  const storeChartData = useMemo(() => {
    const stores = analytics?.spendingByStore;
    if (!Array.isArray(stores)) return [];
    // A bar for trips with no store recorded is not a location, and it was
    // taking one of the five slots from a shop that is.
    return stores
      .filter(store => store.storeName !== UNKNOWN_STORE)
      .slice(0, 5)
      .map(store => ({
        value: store.totalSpent,
        label: store.storeName.length > 8 ? store.storeName.slice(0, 8) + '…' : store.storeName,
        labelTextStyle: { color: theme.text.secondary, fontSize: 10 },
        // showValuesAsTopLabel prints the raw float, and a total is a sum of
        // 2dp prices — enough to surface as 112.09000000000002.
        topLabelComponent: () => (
          <Text style={styles.chartTopLabel}>{store.totalSpent.toFixed(2)}</Text>
        ),
        frontColor: theme.accent.blue,
      }));
  }, [analytics?.spendingByStore, theme, styles]);

  const { categoryPieData, pieTotal } = useMemo(() => {
    const categories = analytics?.categoryBreakdown;
    if (!Array.isArray(categories) || categories.length === 0) {
      return { categoryPieData: [] as { value: number; text: string; color: string }[], pieTotal: 0 };
    }
    // All from the theme (two were pinned dark-theme hexes, so in light
    // mode the pie came out three muted colours and two neon ones), ordered
    // so red and green are never adjacent slices.
    //
    // Six, not five: splitting Pantry and Beverages spread spend that used to
    // land in one slice across several, and a top-five cut started hiding most
    // of the basket. Six is every accent the theme has — going wider means new
    // tokens in both palettes, which belongs with the palette work in
    // docs/DESIGN_AUDIT.md, not here.
    const PIE_COLORS = [
      theme.accent.blue,
      theme.accent.orange,
      theme.accent.green,
      theme.accent.purple,
      theme.accent.red,
      theme.accent.yellow,
    ];
    const shown = categories.slice(0, PIE_COLORS.length);
    const data = shown.map((cat, i) => ({
      value: cat.totalSpent,
      text: cat.category,
      color: PIE_COLORS[i] || theme.text.tertiary,
    }));

    // The centre used to print the period total while the slices summed to
    // something else entirely — categories past the sixth were dropped, and
    // receipts carry spend no item accounts for. One "Other" slice absorbs
    // both, so the ring and the figure inside it are the same number.
    const shownSum = shown.reduce((sum, cat) => sum + cat.totalSpent, 0);
    const total = Math.max(analytics?.totalSpent ?? 0, shownSum);
    const remainder = total - shownSum;
    // Below a penny it is float noise, not a category.
    if (remainder >= 0.01) {
      // "Other" is also a real category — it is where an uncategorised item
      // lands — so appending a second slice by that name gave the ring two
      // identical legend rows and React two children with the same key. The
      // remainder joins the slice that is already there.
      const existing = data.find(slice => slice.text === OTHER_CATEGORY);
      if (existing) existing.value += remainder;
      else data.push({ value: remainder, text: OTHER_CATEGORY, color: theme.text.tertiary });
    }
    return { categoryPieData: data, pieTotal: total };
  }, [analytics?.categoryBreakdown, analytics?.totalSpent, theme]);

  // Hoisted out of the per-store map, which recomputed both across every store
  // for every row. reduce keeps the first on a tie, so only one store is
  // badged when several share the lowest average.
  const { smallestTripsStore, mostVisitedStore } = useMemo(() => {
    const stores = analytics?.spendingByStore ?? [];
    // Neither badge is about the no-store bucket, and "Smallest trips" is
    // praise: a shop with a trip but no recorded spend wins a min on average
    // per trip at £0.00 and reads as the frugal one. Both are comparisons, so
    // both need at least two candidates of their own.
    const named = stores.filter(store => store.storeName !== UNKNOWN_STORE);
    const withSpend = named.filter(store => store.totalSpent > 0);
    return {
      smallestTripsStore: withSpend.length >= 2
        ? withSpend.reduce((a, b) => (b.averagePerTrip < a.averagePerTrip ? b : a)).storeName
        : null,
      mostVisitedStore: named.length >= 2
        ? named.reduce((a, b) => (b.tripCount > a.tripCount ? b : a)).storeName
        : null,
    };
  }, [analytics?.spendingByStore]);

  // gifted-charts derives the y-axis from noOfSections alone unless it is
  // given a maxValue, and its default of 10 put trip counts of one and two in
  // the bottom fifth of the chart under ticks of 0/3/6/10. The step is chosen
  // first so every tick is a whole number of trips — half a trip is not a
  // reading.
  const weekdayAxis = useMemo(() => {
    const peak = Math.max(1, ...(analytics?.tripsByWeekday ?? [0]));
    const step = Math.ceil(peak / 4);
    const sections = Math.ceil(peak / step);
    return { maxValue: step * sections, noOfSections: sections };
  }, [analytics?.tripsByWeekday]);

  const weekdayChartData = useMemo(() => {
    const trips = analytics?.tripsByWeekday;
    if (!Array.isArray(trips) || trips.every(count => count === 0)) return [];
    // Rotated to start on Monday, matching the weekly trend buckets.
    const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return LABELS.map((label, i) => ({
      value: trips[(i + 1) % 7] ?? 0,
      label,
      labelTextStyle: { color: theme.text.secondary, fontSize: 10 },
      frontColor: theme.accent.purple,
    }));
  }, [analytics?.tripsByWeekday, theme]);

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
        <TouchableOpacity style={styles.retryBtn} onPress={() => loadAnalytics()}>
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

  const CHART_W = screenWidth - 62;
  // What the charts are actually drawn into. gifted-charts sizes bars from
  // `parentWidth`, which defaults to the whole screen and not to the width it
  // was given, so with adjustToWidth it laid out (screenWidth - yAxisLabelWidth)
  // of bars inside a box this wide and the last one fell off the right edge —
  // Sunday, on a seven-bar week.
  const CHART_PLOT_W = CHART_W - 24;

  // An x-axis label is centred on its point, so a point sitting exactly on the
  // plot edge has half its label outside the box and clipped: "27 Jul" showed
  // as "Jul", "10 Aug" as "10 A". adjustToWidth leaves no room at either end,
  // so the spacing is set here instead, against a padded width.
  const TREND_EDGE_PAD = 22;
  const trendSpacing = Math.max(
    1,
    (CHART_PLOT_W - TREND_EDGE_PAD * 2) / Math.max(trendChartData.length - 1, 1),
  );

  // ── Tab content renderers ─────────────────────────────────────────────────

  const renderOverviewTab = () => (
    <>
      {/* Spending trend */}
      <View>
        <Text style={styles.cardTitle}>Spending Trend</Text>
        <Text style={styles.cardSub}>
          {analytics.trendBucket === 'week' ? 'Weekly' : 'Monthly'} spend over the selected period
        </Text>
        {trendChartData.length > 1 ? (
          <View style={styles.chartWrapper}>
            <LineChart
              data={trendChartData}
              width={CHART_PLOT_W}
              height={180}
              initialSpacing={TREND_EDGE_PAD}
              endSpacing={TREND_EDGE_PAD}
              spacing={trendSpacing}
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
              rulesColor={theme.border.strong}
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
                  totalSpent={pieTotal}
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
              {categoryPieData.map(item => {
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

      {/* When you shop */}
      {weekdayChartData.length > 0 && (
        <View>
          <Text style={styles.cardTitle}>When You Shop</Text>
          <Text style={styles.cardSub}>Trips by day of the week</Text>
          <View style={styles.chartWrapper}>
            <BarChart
              data={weekdayChartData}
              width={CHART_PLOT_W}
              parentWidth={CHART_PLOT_W}
              height={140}
              adjustToWidth
              initialSpacing={0}
              barBorderRadius={6}
              isAnimated
              animationDuration={600}
              rulesColor={theme.border.strong}
              xAxisColor="transparent"
              yAxisColor="transparent"
              yAxisTextStyle={styles.chartAxisStyle}
              yAxisLabelWidth={24}
              maxValue={weekdayAxis.maxValue}
              noOfSections={weekdayAxis.noOfSections}
            />
          </View>
        </View>
      )}
    </>
  );

  const renderItemsTab = () => (
    <View>
      <Text style={styles.cardTitle}>Most Purchased</Text>
      <Text style={styles.cardSub}>Your top items by frequency</Text>
      {/* The pie says "No category data available" and Volatile Prices says
          "Not enough price data yet" for the same input; this pane rendered
          a heading over nothing. */}
      {analytics.topItems.length === 0 ? (
        <Text style={styles.noData}>No item data available</Text>
      ) : (
      <View style={styles.itemsContainer}>
        {analytics.topItems.slice(0, 8).map((item, index) => {
          const rankColor = rankColors[index] ?? theme.text.secondary;
          const rankBorderStyle = { borderColor: rankColor + '60' };
          const rankColorStyle = { color: rankColor };
          // Units only when they say something the trip count does not — a
          // basket of singles would just read "3 units · 3× bought". And
          // nothing at all for a one-off, where "£2.50 each" merely repeats
          // the total sitting next to it.
          const meta = item.unitsPurchased > item.purchaseCount
            ? `${item.unitsPurchased} units · ${fmt(item.averagePrice)} each`
            : item.purchaseCount > 1
              ? `${fmt(item.averagePrice)} each`
              : null;
          return (
            <View key={item.name} style={styles.itemRow}>
              {/* Rank badge */}
              <View style={[styles.rankBadge, rankBorderStyle]}>
                <Text style={[styles.rankText, rankColorStyle]}>{index + 1}</Text>
              </View>
              {/* Name */}
              <View style={styles.itemNameColumn}>
                <Text style={styles.itemName} numberOfLines={1}>{capitalize(item.name)}</Text>
                {meta && <Text style={styles.itemMeta} numberOfLines={1}>{meta}</Text>}
              </View>
              {/* Stats */}
              <View style={styles.itemStatsColumn}>
                <Text style={styles.itemSpend}>{fmt(item.totalSpent)}</Text>
                <Text style={styles.itemCount}>{item.purchaseCount}× bought</Text>
              </View>
            </View>
          );
        })}
      </View>
      )}
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
              width={CHART_PLOT_W}
              parentWidth={CHART_PLOT_W}
              height={180}
              adjustToWidth
              initialSpacing={0}
              barBorderRadius={6}
              isAnimated
              animationDuration={700}
              rulesColor={theme.border.strong}
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
            const isSmallest = store.storeName === smallestTripsStore;
            const isMost     = store.storeName === mostVisitedStore;
            const progressFillStyle = {
              // safeDiv, not a bare divide: a group with trips but no prices
              // has a zero total, and NaN% is not a width.
              width: `${safeDiv(store.totalSpent, analytics.totalSpent) * 100}%` as any,
              backgroundColor: isSmallest ? theme.accent.green : theme.accent.blue,
            };

            return (
              <View key={store.storeName} style={styles.storeRow}>
                <View style={styles.storeFlexLeft}>
                  <View style={styles.storeNameRow}>
                    <Text style={styles.storeName}>{storeLabel(store.storeName)}</Text>
                    {/* "Best avg" read as "cheapest", but the lowest average
                        per trip is where you nip in for milk. */}
                    {isSmallest && <View style={styles.pill}><Text style={[styles.pillText, styles.pillTextGreen]}>Smallest trips</Text></View>}
                    {isMost && !isSmallest && <View style={styles.pill}><Text style={[styles.pillText, styles.pillTextBlue]}>Most visited</Text></View>}
                  </View>
                  {/* Progress bar: proportion of total spend */}
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, progressFillStyle]} />
                  </View>
                </View>
                <View style={styles.storeStatsColumn}>
                  <Text style={styles.storeTotal}>{fmt(store.totalSpent)}</Text>
                  <Text style={styles.storeMeta}>{store.tripCount} {plural(store.tripCount, 'trip')} · avg {fmt(store.averagePerTrip)}</Text>
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
          <VolatileItemsChart familyGroupId={familyGroupId} reloadKey={reloadKey} />
          <SmartSavingsCard familyGroupId={familyGroupId} trackedItems={trackedItems} reloadKey={reloadKey} />
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
              onPress={() => selectTab(tab.id)}
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
        ref={scrollRef}
        style={styles.scrollFlex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent.blue}
            colors={[theme.accent.blue]}
            // Android rests the spinner 64dp down, less its own 40dp diameter,
            // so it settled on top of the period filter and covered the label
            // saying which period you were looking at — while the numbers
            // underneath were being replaced. Pulled up so it tucks against
            // the tab bar and clears the filter text.
            progressViewOffset={-40}
          />
        }
      >
        {/* Period filter. Hidden on Prices, which reads none of it — the
            comparison card carries its own range chips, and two live period
            controls on one screen only ever disagree. */}
        {activeTab !== 'prices' && (
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
        )}

        {/* Period total, set as a till-roll total line. Also period-scoped, so
            it goes with the filter. */}
        {activeTab !== 'prices' && (
        <View style={styles.totalBlock}>
          <View style={styles.rule} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL SPENT</Text>
            <Text style={styles.totalValue} numberOfLines={1}>{fmt(analytics.totalSpent)}</Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.totalMeta}>
            <Text style={styles.totalMetaStrong}>{analytics.totalTrips}</Text> {plural(analytics.totalTrips, 'trip')}
            {'   ·   '}
            <Text style={styles.totalMetaStrong}>{fmt(analytics.averagePerTrip)}</Text> avg
            {'   ·   '}
            <Text style={styles.totalMetaStrong}>{analytics.itemsPurchased}</Text> {plural(analytics.itemsPurchased, 'item')}
          </Text>
        </View>
        )}

        {/* Opened tabs stay mounted and are hidden rather than unmounted, so
            the Prices tab keeps its selection and its loaded data. display:
            'none' takes the pane out of layout, so the container gap does not
            leave a hole where a hidden tab sits. */}
        {openedTabs.map(tab => (
          <View
            key={tab}
            style={[styles.tabPane, activeTab !== tab && styles.tabPaneHidden]}
          >
            {tab === 'overview' && renderOverviewTab()}
            {tab === 'items'    && renderItemsTab()}
            {tab === 'stores'   && renderStoresTab()}
            {tab === 'prices'   && renderPricesTab()}
          </View>
        ))}
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
  // A segmented control, not pills: one container, no per-item borders. The
  // active segment is a solid accent rather than the tab bar's tint, which
  // both keeps the two controls distinguishable and is the only fill that
  // separates from this container in *both* themes. Measured against the
  // container (glass.subtle over background.primary): solid accent 7.21:1
  // dark / 5.48:1 light, where background.secondary managed 1.06:1 dark and
  // glass.strong 1.43:1 — a raised surface does not exist on a near-black
  // ground, so a "lifted" segment would have been invisible in dark mode.
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
    backgroundColor: theme.accent.blue,
  },
  segmentText:       { fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: '600', color: theme.text.secondary },
  segmentTextActive: { color: theme.text.onAccent },

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
  itemNameColumn: { flex: 1 },
  itemName:  { fontSize: 14, color: theme.text.primary, fontWeight: '500' },
  itemMeta:  { fontSize: 12, color: theme.text.secondary, marginTop: 2 },
  itemCount: { fontSize: 12, color: theme.text.secondary, marginTop: 1 },
  itemSpend: { ...NUMERIC, fontSize: 14, fontWeight: '700', color: theme.accent.green },

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
  // Each pane repeats the scroll container's gap: the panes are now the
  // container's direct children, so without this the sections inside a pane
  // would sit flush against each other.
  tabPane: { gap: SPACING.xxl },
  tabPaneHidden: { display: 'none' },
});

// ─── Export ───────────────────────────────────────────────────────────────────

const AnalyticsScreenWithErrorBoundary = () => (
  <ErrorBoundary>
    <AnalyticsScreen />
  </ErrorBoundary>
);

export default AnalyticsScreenWithErrorBoundary;

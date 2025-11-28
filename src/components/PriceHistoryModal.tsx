import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import PriceHistoryService, { PriceStats } from '../services/PriceHistoryService';
import AuthenticationModule from '../services/AuthenticationModule';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

const screenWidth = Dimensions.get('window').width;

interface PriceHistoryModalProps {
  visible: boolean;
  itemName: string;
  onClose: () => void;
}

/**
 * PriceHistoryModal
 * Displays price history and statistics for an item
 * Implements Sprint 7: Price tracking modal
 */
const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  visible,
  itemName,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [priceByStore, setPriceByStore] = useState<{ [store: string]: any }>({});

  useEffect(() => {
    if (visible && itemName) {
      loadPriceData();
    }
  }, [visible, itemName]);

  const loadPriceData = async () => {
    setLoading(true);

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user?.familyGroupId) return;

      const [priceStats, storeComparison] = await Promise.all([
        PriceHistoryService.getPriceStats(user.familyGroupId, itemName),
        PriceHistoryService.getPriceByStore(user.familyGroupId, itemName),
      ]);

      setStats(priceStats);
      setPriceByStore(storeComparison);
    } catch (error) {
      console.error('Failed to load price data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return '📈';
    if (trend === 'down') return '📉';
    return '➡️';
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return COLORS.accent.red;
    if (trend === 'down') return COLORS.accent.green;
    return COLORS.accent.yellow;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Price History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accent.blue} />
              <Text style={styles.loadingText}>Loading price data...</Text>
            </View>
          ) : stats === null ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No price history available for "{itemName}"</Text>
              <Text style={styles.emptySubtext}>Add prices when shopping to track history</Text>
            </View>
          ) : (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Item Name */}
              <View style={styles.itemNameContainer}>
                <Text style={styles.itemNameText}>{itemName}</Text>
              </View>

              {/* Current Price & Trend */}
              <View style={styles.statsCard}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Current Price:</Text>
                  <View style={styles.priceWithTrend}>
                    <Text style={styles.statValueLarge}>
                      £{stats.currentPrice?.toFixed(2) || 'N/A'}
                    </Text>
                    <View style={[styles.trendBadge, { backgroundColor: getTrendColor(stats.trend) }]}>
                      <Text style={styles.trendIcon}>{getTrendIcon(stats.trend)}</Text>
                      <Text style={styles.trendText}>
                        {stats.trend === 'stable' ? 'Stable' : `${Math.abs(stats.percentageChange).toFixed(1)}%`}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Price Statistics */}
              <View style={styles.statsCard}>
                <Text style={styles.cardTitle}>Statistics</Text>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Average Price:</Text>
                  <Text style={styles.statValue}>£{stats.averagePrice.toFixed(2)}</Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Lowest Price:</Text>
                  <Text style={[styles.statValue, styles.priceGreen]}>
                    £{stats.lowestPrice.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Highest Price:</Text>
                  <Text style={[styles.statValue, styles.priceRed]}>
                    £{stats.highestPrice.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Purchases:</Text>
                  <Text style={styles.statValue}>{stats.totalPurchases}</Text>
                </View>
              </View>

              {/* Price by Store with Chart */}
              {Object.keys(priceByStore).length > 0 && (
                <View style={styles.statsCard}>
                  <Text style={styles.cardTitle}>Price by Store</Text>

                  {/* Bar Chart for Store Comparison */}
                  {Object.keys(priceByStore).length > 1 && (
                    <View style={styles.chartContainer}>
                      <BarChart
                        data={Object.entries(priceByStore).map(([store, data], index) => {
                          const lowestAverage = Math.min(
                            ...Object.values(priceByStore).map((d: any) => d.average)
                          );
                          const isCheapest = data.average === lowestAverage;
                          return {
                            value: data.average,
                            label: store.length > 8 ? store.substring(0, 8) + '...' : store,
                            labelTextStyle: { color: COLORS.text.secondary, fontSize: 10 },
                            frontColor: isCheapest ? COLORS.accent.green : COLORS.accent.blue,
                          };
                        })}
                        width={screenWidth - 120}
                        height={150}
                        barWidth={30}
                        barBorderRadius={8}
                        isAnimated
                        animationDuration={600}
                        showValuesAsTopLabel
                        topLabelTextStyle={{
                          color: COLORS.text.primary,
                          fontSize: 10,
                          fontWeight: '600',
                        }}
                        rulesColor={COLORS.border.medium}
                        rulesThickness={1}
                        xAxisColor={COLORS.border.medium}
                        yAxisColor={COLORS.border.medium}
                        yAxisTextStyle={{ color: COLORS.text.secondary, fontSize: 10 }}
                        yAxisLabelPrefix="£"
                        yAxisLabelWidth={35}
                        noOfSections={4}
                      />
                    </View>
                  )}

                  {/* Store List with Best Deal Badge */}
                  {Object.entries(priceByStore).map(([store, data]) => {
                    const lowestAverage = Math.min(
                      ...Object.values(priceByStore).map((d: any) => d.average)
                    );
                    const isCheapest = data.average === lowestAverage && Object.keys(priceByStore).length > 1;

                    return (
                      <View key={store} style={styles.storeRow}>
                        <View style={styles.storeNameContainer}>
                          <Text style={styles.storeName}>{store}</Text>
                          {isCheapest && (
                            <View style={styles.bestDealBadge}>
                              <Text style={styles.bestDealText}>Best Deal</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.storePrices}>
                          <Text style={[styles.storeAverage, isCheapest && styles.bestDealPrice]}>
                            Avg: £{data.average.toFixed(2)}
                          </Text>
                          <Text style={styles.storeRange}>
                            £{data.lowest.toFixed(2)} - £{data.highest.toFixed(2)}
                          </Text>
                          <Text style={styles.storeCount}>({data.count}x)</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Price History Timeline */}
              <View style={styles.statsCard}>
                <Text style={styles.cardTitle}>Purchase History</Text>
                {stats.priceHistory.map((point, index) => (
                    <View key={`${point.listId}-${index}`} style={styles.historyRow}>
                      <View style={styles.historyLeft}>
                        <Text style={styles.historyDate}>{formatDate(point.date)}</Text>
                        {point.storeName && (
                          <Text style={styles.historyStore}>{point.storeName}</Text>
                        )}
                      </View>
                      <Text style={styles.historyPrice}>£{point.price.toFixed(2)}</Text>
                    </View>
                  ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay.darker,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    ...COMMON_STYLES.modal,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.medium,
  },
  headerTitle: {
    ...COMMON_STYLES.sectionHeader,
    marginBottom: 0,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.large,
    backgroundColor: COLORS.glass.medium,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.lg,
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.text.secondary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
  },
  itemNameContainer: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  itemNameText: {
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
  },
  statsCard: {
    ...COMMON_STYLES.glassCard,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.md + 1,
    color: COLORS.text.secondary,
  },
  statValue: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  statValueLarge: {
    fontSize: 28,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
  },
  priceWithTrend: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.medium,
  },
  trendIcon: {
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  trendText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
  },
  priceGreen: {
    color: COLORS.accent.green,
  },
  priceRed: {
    color: COLORS.accent.red,
  },
  chartContainer: {
    marginBottom: SPACING.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
  },
  storeNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  storeName: {
    fontSize: TYPOGRAPHY.fontSize.md + 1,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  bestDealBadge: {
    backgroundColor: COLORS.accent.greenDim,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.small,
  },
  bestDealText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.accent.green,
    textTransform: 'uppercase',
  },
  bestDealPrice: {
    color: COLORS.accent.green,
  },
  storePrices: {
    alignItems: 'flex-end',
  },
  storeAverage: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.accent.blue,
  },
  storeRange: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  storeCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.tertiary,
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: TYPOGRAPHY.fontSize.md + 1,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  historyStore: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  historyPrice: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.accent.green,
  },
});

export default PriceHistoryModal;

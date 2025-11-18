import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import PriceHistoryService, { PriceStats } from '../services/PriceHistoryService';
import AuthenticationModule from '../services/AuthenticationModule';

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
    if (trend === 'up') return '#FF453A';
    if (trend === 'down') return '#30D158';
    return '#FFD60A';
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
              <ActivityIndicator size="large" color="#007AFF" />
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

              {/* Price by Store */}
              {Object.keys(priceByStore).length > 0 && (
                <View style={styles.statsCard}>
                  <Text style={styles.cardTitle}>Price by Store</Text>
                  {Object.entries(priceByStore).map(([store, data]) => (
                    <View key={store} style={styles.storeRow}>
                      <Text style={styles.storeName}>{store}</Text>
                      <View style={styles.storePrices}>
                        <Text style={styles.storeAverage}>Avg: £{data.average.toFixed(2)}</Text>
                        <Text style={styles.storeRange}>
                          £{data.lowest.toFixed(2)} - £{data.highest.toFixed(2)}
                        </Text>
                        <Text style={styles.storeCount}>({data.count}x)</Text>
                      </View>
                    </View>
                  ))}
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#a0a0a0',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  itemNameContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  itemNameText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  statsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 15,
    color: '#a0a0a0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  statValueLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  priceWithTrend: {
    alignItems: 'flex-end',
    gap: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendIcon: {
    fontSize: 14,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  priceGreen: {
    color: '#30D158',
  },
  priceRed: {
    color: '#FF453A',
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  storeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  storePrices: {
    alignItems: 'flex-end',
  },
  storeAverage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  storeRange: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 2,
  },
  storeCount: {
    fontSize: 12,
    color: '#6E6E73',
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  historyStore: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 2,
  },
  historyPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#30D158',
  },
});

export default PriceHistoryModal;

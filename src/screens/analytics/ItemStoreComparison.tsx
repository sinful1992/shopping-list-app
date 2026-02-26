import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import PriceHistoryService, { PricePoint } from '../../services/PriceHistoryService';

const screenWidth = Dimensions.get('window').width;

interface Props {
  familyGroupId: string;
  trackedItems: { itemName: string; itemNameNormalized: string }[];
}

interface StoreStats {
  storeName: string;
  average: number;
  latest: number;
  min: number;
  max: number;
  count: number;
  volatility: number;
}

type DateRange = 30 | 90 | 365;
type ViewMode = 'avg' | 'latest';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ItemStoreComparison: React.FC<Props> = ({ familyGroupId, trackedItems }) => {
  const [selectedItem, setSelectedItem] = useState<{ itemName: string; itemNameNormalized: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(90);
  const [viewMode, setViewMode] = useState<ViewMode>('avg');
  const [pricePoints, setPricePoints] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return trackedItems;
    const q = searchQuery.toLowerCase();
    return trackedItems.filter(i => i.itemNameNormalized.includes(q));
  }, [trackedItems, searchQuery]);

  const loadPriceData = useCallback(async (itemNormalized: string) => {
    setLoading(true);
    try {
      const data = await PriceHistoryService.getPriceHistory(familyGroupId, itemNormalized);
      setPricePoints(data);
    } catch {
      setPricePoints([]);
    } finally {
      setLoading(false);
    }
  }, [familyGroupId]);

  const handleSelectItem = useCallback((item: { itemName: string; itemNameNormalized: string }) => {
    setSelectedItem(item);
    setShowPicker(false);
    setSearchQuery('');
    loadPriceData(item.itemNameNormalized);
  }, [loadPriceData]);

  const filteredPoints = useMemo(() => {
    const cutoff = Date.now() - dateRange * 24 * 60 * 60 * 1000;
    return pricePoints.filter(p => p.date >= cutoff);
  }, [pricePoints, dateRange]);

  const storeStats = useMemo((): StoreStats[] => {
    const grouped = new Map<string, PricePoint[]>();
    for (const p of filteredPoints) {
      const store = p.storeName ?? 'Unknown';
      const arr = grouped.get(store);
      if (arr) arr.push(p);
      else grouped.set(store, [p]);
    }

    const stats: StoreStats[] = [];
    for (const [storeName, points] of grouped) {
      const prices = points.map(p => p.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const average = prices.reduce((s, p) => s + p, 0) / prices.length;
      const latest = points.sort((a, b) => b.date - a.date)[0].price;
      const volatility = average > 0 ? ((max - min) / average) * 100 : 0;

      stats.push({ storeName, average, latest, min, max, count: prices.length, volatility });
    }

    return stats.sort((a, b) => {
      const valA = viewMode === 'avg' ? a.average : a.latest;
      const valB = viewMode === 'avg' ? b.average : b.latest;
      return valA - valB;
    });
  }, [filteredPoints, viewMode]);

  const insights = useMemo(() => {
    if (storeStats.length === 0) return [];
    const lines: string[] = [];

    const cheapest = storeStats[0];
    lines.push(`Cheapest on average: ${cheapest.storeName} (£${cheapest.average.toFixed(2)})`);

    if (storeStats.length > 1) {
      const mostStable = [...storeStats].sort((a, b) => a.volatility - b.volatility)[0];
      lines.push(`Most stable: ${mostStable.storeName}`);

      let biggestDeltaStore = '';
      let biggestDeltaPct = 0;
      for (const s of storeStats) {
        const deltaPct = s.average > 0 ? ((s.latest - s.average) / s.average) * 100 : 0;
        if (deltaPct > biggestDeltaPct) {
          biggestDeltaPct = deltaPct;
          biggestDeltaStore = s.storeName;
        }
      }
      if (biggestDeltaPct > 5) {
        const s = storeStats.find(st => st.storeName === biggestDeltaStore)!;
        lines.push(`Latest vs average: ${s.storeName} £${s.latest.toFixed(2)} vs avg £${s.average.toFixed(2)} (+${biggestDeltaPct.toFixed(0)}%)`);
      }
    }

    return lines;
  }, [storeStats]);

  const chartWidth = screenWidth - 62 - 40;

  const getVolatilityLabel = (v: number) => {
    if (v < 10) return { label: 'Low', color: '#30D158' };
    if (v <= 25) return { label: 'Med', color: '#FFD60A' };
    return { label: 'High', color: '#FF453A' };
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Store Price Comparison</Text>

      {/* Item Picker */}
      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker(!showPicker)}>
        <Text style={selectedItem ? styles.pickerText : styles.pickerPlaceholder}>
          {selectedItem ? capitalize(selectedItem.itemName) : 'Select an item...'}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <View style={styles.pickerDropdown}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#6E6E73"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <FlatList
            data={filteredItems.slice(0, 20)}
            keyExtractor={item => item.itemNameNormalized}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => handleSelectItem(item)}>
                <Text style={styles.pickerItemText}>{capitalize(item.itemName)}</Text>
              </TouchableOpacity>
            )}
            style={styles.pickerList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* Controls Row */}
      {selectedItem && (
        <View style={styles.controlsRow}>
          <View style={styles.controlGroup}>
            {([30, 90, 365] as DateRange[]).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.controlChip, dateRange === d && styles.controlChipActive]}
                onPress={() => setDateRange(d)}
              >
                <Text style={[styles.controlChipText, dateRange === d && styles.controlChipTextActive]}>
                  {d === 365 ? '1Y' : `${d}d`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.controlGroup}>
            <TouchableOpacity
              style={[styles.controlChip, viewMode === 'avg' && styles.controlChipActive]}
              onPress={() => setViewMode('avg')}
            >
              <Text style={[styles.controlChipText, viewMode === 'avg' && styles.controlChipTextActive]}>Avg</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlChip, viewMode === 'latest' && styles.controlChipActive]}
              onPress={() => setViewMode('latest')}
            >
              <Text style={[styles.controlChipText, viewMode === 'latest' && styles.controlChipTextActive]}>Latest</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content */}
      {!selectedItem && (
        <Text style={styles.emptyText}>Select an item to compare prices across stores</Text>
      )}

      {selectedItem && loading && (
        <ActivityIndicator color="#007AFF" style={{ marginVertical: 20 }} />
      )}

      {selectedItem && !loading && filteredPoints.length === 0 && (
        <Text style={styles.emptyText}>No purchases in this period</Text>
      )}

      {selectedItem && !loading && storeStats.length === 1 && (
        <View style={styles.singleStoreCard}>
          <Text style={styles.singleStoreText}>
            All {storeStats[0].count} purchase{storeStats[0].count !== 1 ? 's' : ''} from {storeStats[0].storeName}
          </Text>
          <Text style={styles.singleStorePrice}>
            Avg: £{storeStats[0].average.toFixed(2)}
          </Text>
        </View>
      )}

      {selectedItem && !loading && storeStats.length > 1 && (
        <>
          {/* Bar Chart */}
          <View style={styles.chartContainer}>
            <BarChart
              data={storeStats.map((s, i) => ({
                value: viewMode === 'avg' ? s.average : s.latest,
                label: s.storeName.length > 8 ? s.storeName.substring(0, 8) + '...' : s.storeName,
                labelTextStyle: { color: '#a0a0a0', fontSize: 10 },
                frontColor: i === 0 ? '#30D158' : '#007AFF',
              }))}
              width={chartWidth}
              height={180}
              adjustToWidth
              initialSpacing={0}
              barBorderRadius={8}
              isAnimated
              animationDuration={600}
              showValuesAsTopLabel
              topLabelTextStyle={{ color: '#ffffff', fontSize: 11, fontWeight: '600' }}
              rulesColor="rgba(255, 255, 255, 0.1)"
              rulesThickness={1}
              xAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisColor="rgba(255, 255, 255, 0.1)"
              yAxisTextStyle={{ color: '#a0a0a0', fontSize: 10 }}
              yAxisLabelPrefix="£"
              yAxisLabelWidth={40}
              noOfSections={4}
            />
          </View>

          {/* Stability Section */}
          <Text style={styles.sectionLabel}>Price Stability</Text>
          {storeStats.map(s => {
            const { label, color } = getVolatilityLabel(s.volatility);
            const barWidth = Math.min(s.volatility, 100);
            return (
              <View key={s.storeName} style={styles.stabilityRow}>
                <Text style={styles.stabilityStore} numberOfLines={1}>{s.storeName}</Text>
                <View style={styles.stabilityBarBg}>
                  <View style={[styles.stabilityBar, { width: `${barWidth}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.stabilityLabel, { color }]}>{label} ({s.volatility.toFixed(0)}%)</Text>
              </View>
            );
          })}
        </>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <View style={styles.insightsContainer}>
          <Text style={styles.sectionLabel}>Insights</Text>
          {insights.map((line, i) => (
            <Text key={i} style={styles.insightText}>{line}</Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 12,
    marginHorizontal: 15,
    marginTop: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  pickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 12,
    marginBottom: 8,
  },
  pickerText: {
    color: '#ffffff',
    fontSize: 15,
  },
  pickerPlaceholder: {
    color: '#6E6E73',
    fontSize: 15,
    fontStyle: 'italic',
  },
  pickerDropdown: {
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 8,
    maxHeight: 220,
  },
  searchInput: {
    color: '#ffffff',
    fontSize: 14,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerList: {
    maxHeight: 170,
  },
  pickerItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  pickerItemText: {
    color: '#ffffff',
    fontSize: 14,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  controlGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  controlChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  controlChipActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  controlChipText: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '600',
  },
  controlChipTextActive: {
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  singleStoreCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginVertical: 10,
  },
  singleStoreText: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
  },
  singleStorePrice: {
    color: '#30D158',
    fontSize: 18,
    fontWeight: '700',
  },
  chartContainer: {
    marginTop: 8,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a0a0a0',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  stabilityStore: {
    color: '#ffffff',
    fontSize: 12,
    width: 70,
  },
  stabilityBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stabilityBar: {
    height: '100%',
    borderRadius: 4,
  },
  stabilityLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 70,
    textAlign: 'right',
  },
  insightsContainer: {
    marginTop: 4,
  },
  insightText: {
    color: '#d0d0d0',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
});

export default ItemStoreComparison;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import PriceHistoryService from '../../services/PriceHistoryService';

const screenWidth = Dimensions.get('window').width;

interface Props {
  familyGroupId: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const VolatileItemsChart: React.FC<Props> = ({ familyGroupId }) => {
  const [data, setData] = useState<Array<{ itemName: string; volatility: number; priceRange: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await PriceHistoryService.getMostVolatileItems(familyGroupId, 10);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyGroupId]);

  const chartWidth = screenWidth - 62 - 40;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Most Volatile Prices</Text>
      <Text style={styles.subtitle}>Items with the biggest price swings</Text>

      {loading && <ActivityIndicator color="#007AFF" style={{ marginVertical: 20 }} />}

      {!loading && data.length === 0 && (
        <Text style={styles.emptyText}>Not enough price data yet</Text>
      )}

      {!loading && data.length > 0 && (
        <View style={styles.chartContainer}>
          <BarChart
            data={data.map(d => ({
              value: Math.round(d.volatility),
              label: capitalize(d.itemName).length > 10
                ? capitalize(d.itemName).substring(0, 10) + '...'
                : capitalize(d.itemName),
              labelTextStyle: { color: '#a0a0a0', fontSize: 9 },
              frontColor: '#FF453A',
            }))}
            width={chartWidth}
            height={200}
            adjustToWidth
            initialSpacing={0}
            barBorderRadius={8}
            isAnimated
            animationDuration={600}
            showValuesAsTopLabel
            topLabelTextStyle={{ color: '#ffffff', fontSize: 10, fontWeight: '600' }}
            rulesColor="rgba(255, 255, 255, 0.1)"
            rulesThickness={1}
            xAxisColor="rgba(255, 255, 255, 0.1)"
            yAxisColor="rgba(255, 255, 255, 0.1)"
            yAxisTextStyle={{ color: '#a0a0a0', fontSize: 10 }}
            yAxisLabelSuffix="%"
            yAxisLabelWidth={40}
            noOfSections={4}
          />
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  chartContainer: {
    marginTop: 4,
  },
});

export default VolatileItemsChart;

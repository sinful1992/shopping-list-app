import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import PriceHistoryService from '../../services/PriceHistoryService';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';

const screenWidth = Dimensions.get('window').width;

interface Props {
  familyGroupId: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const VolatileItemsChart: React.FC<Props> = ({ familyGroupId }) => {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const axisColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const labelColor = isDark ? '#a0a0a0' : '#6B7280';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Most Volatile Prices</Text>
      <Text style={styles.subtitle}>Items with the biggest price swings</Text>

      {loading && <ActivityIndicator color={theme.accent.blue} style={{ marginVertical: 20 }} />}

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
              labelTextStyle: { color: labelColor, fontSize: 9 },
              frontColor: theme.accent.red,
            }))}
            width={chartWidth}
            height={200}
            adjustToWidth
            initialSpacing={0}
            barBorderRadius={8}
            isAnimated
            animationDuration={600}
            showValuesAsTopLabel
            topLabelTextStyle={{ color: theme.text.primary, fontSize: 10, fontWeight: '600' }}
            rulesColor={axisColor}
            rulesThickness={1}
            xAxisColor={axisColor}
            yAxisColor={axisColor}
            yAxisTextStyle={{ color: labelColor, fontSize: 10 }}
            yAxisLabelSuffix="%"
            yAxisLabelWidth={40}
            noOfSections={4}
          />
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  card: {
    backgroundColor: theme.glass.subtle,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    padding: 12,
    marginHorizontal: 15,
    marginTop: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: theme.text.secondary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: theme.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  chartContainer: {
    marginTop: 4,
  },
});

export default VolatileItemsChart;

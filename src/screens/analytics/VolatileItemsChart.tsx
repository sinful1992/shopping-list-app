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
  const { theme } = useTheme();
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
  // Tokens, not a hand-rolled isDark ternary: these are the same axis and
  // label colours AnalyticsScreen's own charts use, and they already flip.
  const axisColor = theme.border.strong;
  const labelColor = theme.text.secondary;
  const chartAxisStyle = { color: labelColor, fontSize: 10 };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Most Volatile Prices</Text>
      <Text style={styles.subtitle}>Items with the biggest price swings</Text>

      {loading && <ActivityIndicator color={theme.accent.blue} style={styles.activityIndicator} />}

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
              labelTextStyle: { color: labelColor, fontSize: 10 },
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
            topLabelTextStyle={styles.chartTopLabel}
            rulesColor={axisColor}
            rulesThickness={1}
            xAxisColor={axisColor}
            yAxisColor={axisColor}
            yAxisTextStyle={chartAxisStyle}
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
  // No border or fill: the analytics screen separates its sections with space
  // alone. Insets come from the parent ScrollView's padding, so this lines up
  // with the rest of the screen rather than setting its own margins.
  card: {},
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
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
    // The chart width predates the card's removal, so it is narrower than the
    // space available now — centre it rather than widening it.
    alignItems: 'center',
  },
  activityIndicator: { marginVertical: 20 },
  chartTopLabel: { color: theme.text.primary, fontSize: 10, fontWeight: '600' as const },
});

export default VolatileItemsChart;

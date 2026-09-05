import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PriceHistoryService, { SUGGESTION_WINDOW_DAYS } from '../../services/PriceHistoryService';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';
import { NUMERIC } from '../../styles/theme';
import { capitalize } from '../../utils/itemGrouping';

interface Props {
  familyGroupId: string;
  /** Bumped by the screen on reload, so a pull-to-refresh reaches this card. */
  reloadKey?: number;
  trackedItems: { itemName: string; itemNameNormalized: string }[];
}

const SmartSavingsCard: React.FC<Props> = ({ familyGroupId, trackedItems, reloadKey }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [suggestions, setSuggestions] = useState<Map<string, { bestStore: string; bestPrice: number; savings: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await PriceHistoryService.getSmartSuggestions(
          familyGroupId,
          trackedItems.map(i => i.itemNameNormalized),
          SUGGESTION_WINDOW_DAYS
        );
        if (!cancelled) setSuggestions(result);
      } catch {
        if (!cancelled) setSuggestions(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyGroupId, trackedItems, reloadKey]);

  const entries = Array.from(suggestions.entries());
  const totalSavings = entries.reduce((sum, [, v]) => sum + v.savings, 0);

  const nameMap = new Map<string, string>();
  for (const item of trackedItems) {
    nameMap.set(item.itemNameNormalized, item.itemName);
  }

  return (
    <View>
      <Text style={styles.title}>Smart Savings</Text>
      {/* The range is on screen because the figures are only as current as the
          prices behind them, and the comparison chart above applies its own
          window — two adjacent panels reading different periods with neither
          saying so is how they came to disagree. */}
      <Text style={styles.subtitle}>Where the same item was cheapest, last {SUGGESTION_WINDOW_DAYS} days</Text>

      {loading && <ActivityIndicator color={theme.accent.blue} style={styles.activityIndicator} />}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>
          Nothing to compare in the last {SUGGESTION_WINDOW_DAYS} days — savings need the same item bought at more than one store
        </Text>
      )}

      {!loading && entries.length > 0 && (
        <>
          <View style={styles.totalBanner}>
            <Text style={styles.totalLabel}>Potential savings per shop</Text>
            <Text style={styles.totalValue}>£{totalSavings.toFixed(2)}</Text>
          </View>

          {entries.map(([key, val]) => {
            const displayName = capitalize(nameMap.get(key) ?? key);
            return (
              <View key={key} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.itemStore}>Best at {val.bestStore}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemPrice}>£{val.bestPrice.toFixed(2)}</Text>
                  <Text style={styles.itemSavings}>Save £{val.savings.toFixed(2)}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.text.secondary,
    marginTop: 2,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: theme.text.secondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  totalBanner: {
    backgroundColor: theme.accent.greenDim,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    color: theme.text.secondary,
    fontSize: 12,
  },
  totalValue: {
    ...NUMERIC,
    color: theme.accent.green,
    fontSize: 24,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemStore: {
    color: theme.accent.green,
    fontSize: 12,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    ...NUMERIC,
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemSavings: {
    color: theme.accent.green,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  activityIndicator: { marginVertical: 20 },
});

export default SmartSavingsCard;

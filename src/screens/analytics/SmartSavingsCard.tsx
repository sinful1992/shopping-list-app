import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PriceHistoryService from '../../services/PriceHistoryService';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';

interface Props {
  familyGroupId: string;
  trackedItems: { itemName: string; itemNameNormalized: string }[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SmartSavingsCard: React.FC<Props> = ({ familyGroupId, trackedItems }) => {
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
          trackedItems.map(i => i.itemNameNormalized)
        );
        if (!cancelled) setSuggestions(result);
      } catch {
        if (!cancelled) setSuggestions(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyGroupId, trackedItems]);

  const entries = Array.from(suggestions.entries());
  const totalSavings = entries.reduce((sum, [, v]) => sum + v.savings, 0);

  const nameMap = new Map<string, string>();
  for (const item of trackedItems) {
    nameMap.set(item.itemNameNormalized, item.itemName);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Smart Savings</Text>

      {loading && <ActivityIndicator color={theme.accent.blue} style={{ marginVertical: 20 }} />}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>Buy from multiple stores to see savings tips</Text>
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
    fontSize: 13,
  },
  totalValue: {
    color: theme.accent.green,
    fontSize: 22,
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
});

export default SmartSavingsCard;

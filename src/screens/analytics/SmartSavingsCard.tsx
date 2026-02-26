import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import PriceHistoryService from '../../services/PriceHistoryService';

interface Props {
  familyGroupId: string;
  trackedItems: { itemName: string; itemNameNormalized: string }[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SmartSavingsCard: React.FC<Props> = ({ familyGroupId, trackedItems }) => {
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

  // Build a lookup from normalized name to original casing
  const nameMap = new Map<string, string>();
  for (const item of trackedItems) {
    nameMap.set(item.itemNameNormalized, item.itemName);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Smart Savings</Text>

      {loading && <ActivityIndicator color="#007AFF" style={{ marginVertical: 20 }} />}

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
  emptyText: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  totalBanner: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    color: '#a0a0a0',
    fontSize: 13,
  },
  totalValue: {
    color: '#30D158',
    fontSize: 22,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  itemStore: {
    color: '#30D158',
    fontSize: 12,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  itemSavings: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default SmartSavingsCard;

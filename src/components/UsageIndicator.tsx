import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SubscriptionTier } from '../models/types';
import { useTheme } from '../contexts/ThemeContext';

interface UsageIndicatorProps {
  label: string;
  used: number;
  limit: number | null;
  tier: SubscriptionTier;
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({ label, used, limit }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const percentage = limit === null ? 100 : Math.min((used / limit) * 100, 100);

  const getProgressColor = (): string => {
    if (limit === null) return theme.accent.green;
    if (percentage >= 100) return theme.accent.red;
    if (percentage >= 80) return theme.accent.orange;
    return theme.accent.blue;
  };

  const progressColor = getProgressColor();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.usageText}>
          {limit === null ? 'Unlimited' : `${used} / ${limit}`}
        </Text>
      </View>
      <View style={styles.progressBarBackground}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${percentage}%`, backgroundColor: progressColor },
          ]}
        />
      </View>
      {limit !== null && percentage >= 80 && (
        <Text style={[styles.warningText, { color: progressColor }]}>
          {percentage >= 100 ? 'Limit reached - Upgrade to continue' : 'Almost at your limit'}
        </Text>
      )}
    </View>
  );
};

const createStyles = (theme: import('../styles/theme').Theme) => StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  usageText: {
    color: theme.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: theme.glass.elevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  warningText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});

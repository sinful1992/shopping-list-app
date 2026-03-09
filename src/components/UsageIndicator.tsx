import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SubscriptionTier } from '../models/types';

interface UsageIndicatorProps {
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  tier: SubscriptionTier;
}

/**
 * UsageIndicator Component
 * Sprint 2: Displays usage progress for subscription limits
 */
export const UsageIndicator: React.FC<UsageIndicatorProps> = ({
  label,
  used,
  limit,
  tier,
}) => {
  // Calculate progress percentage
  const percentage = limit === null ? 100 : Math.min((used / limit) * 100, 100);

  // Determine color based on usage
  const getProgressColor = (): string => {
    if (limit === null) return '#30D158';
    if (percentage >= 100) return '#FF453A';
    if (percentage >= 80) return '#FF9F0A';
    return '#6EA8FE';
  };

  const progressColor = getProgressColor();

  return (
    <View style={styles.container}>
      {/* Label and Usage Text */}
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.usageText}>
          {limit === null ? 'Unlimited' : `${used} / ${limit}`}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBackground}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${percentage}%`,
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>

      {/* Warning Text for Near/At Limit */}
      {limit !== null && percentage >= 80 && (
        <Text style={[styles.warningText, { color: progressColor }]}>
          {percentage >= 100
            ? 'Limit reached - Upgrade to continue'
            : 'Almost at your limit'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  usageText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
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

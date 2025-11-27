import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { SubscriptionTier } from '../models/types';
import { SUBSCRIPTION_PRICES, TIER_FEATURES } from '../models/SubscriptionConfig';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';
import { useColorShiftingBorder } from './ColorShiftingCard';

// Create animated version of TouchableOpacity
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface UpgradePromptProps {
  visible: boolean;
  currentTier: SubscriptionTier;
  limitMessage: string;
  onClose: () => void;
  onUpgrade: (tier: 'premium' | 'family') => void;
}

/**
 * UpgradePrompt Component
 * Sprint 2: Displays upgrade options when user hits tier limits
 */
export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  visible,
  currentTier,
  limitMessage,
  onClose,
  onUpgrade,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Limit Message */}
            <View style={styles.limitMessageContainer}>
              <Text style={styles.limitIcon}>🔒</Text>
              <Text style={styles.limitMessage}>{limitMessage}</Text>
            </View>

            {/* Upgrade Options */}
            <Text style={styles.upgradeTitle}>Unlock More Features</Text>

            {/* Premium Tier */}
            {currentTier === 'free' && (() => {
              const borderStyles = useColorShiftingBorder(0, 2, RADIUS.medium);
              return (
                <AnimatedTouchableOpacity
                  style={[styles.tierCard, styles.tierCardWrapper, borderStyles]}
                  onPress={() => onUpgrade('premium')}
                >
                  <View style={styles.tierHeader}>
                    <Text style={styles.tierName}>Premium</Text>
                    <View style={styles.priceContainer}>
                      <Text style={styles.price}>
                        {SUBSCRIPTION_PRICES.premium.symbol}{SUBSCRIPTION_PRICES.premium.monthly}
                      </Text>
                      <Text style={styles.priceLabel}>/month</Text>
                    </View>
                  </View>
                  <View style={styles.featuresContainer}>
                    {TIER_FEATURES.premium.map((feature, index) => (
                      <View key={index} style={styles.featureRow}>
                        <Text style={styles.checkmark}>✓</Text>
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
                  </View>
                </AnimatedTouchableOpacity>
              );
            })()}

            {/* Family Tier */}
            {(() => {
              const borderStyles = useColorShiftingBorder(1, 2, RADIUS.medium);
              return (
                <AnimatedTouchableOpacity
                  style={[styles.tierCard, styles.tierCardWrapper, borderStyles]}
                  onPress={() => onUpgrade('family')}
                >
                  <View style={styles.tierHeader}>
                    <Text style={styles.tierName}>Family</Text>
                    <View style={styles.priceContainer}>
                      <Text style={styles.price}>
                        {SUBSCRIPTION_PRICES.family.symbol}{SUBSCRIPTION_PRICES.family.yearly}
                      </Text>
                      <Text style={styles.priceLabel}>/year</Text>
                    </View>
                  </View>
                  <View style={styles.featuresContainer}>
                    {TIER_FEATURES.family.map((feature, index) => (
                      <View key={index} style={styles.featureRow}>
                        <Text style={styles.checkmark}>✓</Text>
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>Upgrade to Family</Text>
                  </View>
                </AnimatedTouchableOpacity>
              );
            })()}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Maybe Later</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay.darker,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContainer: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: RADIUS.large,
    padding: SPACING.xxl,
    maxWidth: 400,
    width: '100%',
    maxHeight: '90%',
    ...SHADOWS.large,
  },
  limitMessageContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  limitIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  limitMessage: {
    color: COLORS.accent.red,
    fontSize: TYPOGRAPHY.fontSize.lg,
    textAlign: 'center',
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  upgradeTitle: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  tierCardWrapper: {
    marginBottom: SPACING.lg,
  },
  tierCard: {
    backgroundColor: COLORS.background.tertiary,
    borderRadius: RADIUS.medium,
    padding: SPACING.xl,
    borderWidth: 0, // Remove border as StarBorder provides it
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  tierName: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    color: COLORS.accent.green,
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  priceLabel: {
    color: COLORS.text.dim,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  featuresContainer: {
    marginBottom: SPACING.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  checkmark: {
    color: COLORS.accent.green,
    fontSize: TYPOGRAPHY.fontSize.lg,
    marginRight: SPACING.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  featureText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  upgradeButton: {
    backgroundColor: COLORS.accent.blue,
    borderRadius: RADIUS.small,
    padding: SPACING.md + 2,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  closeButton: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.text.dim,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
});

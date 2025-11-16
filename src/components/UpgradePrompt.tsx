import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { SubscriptionTier } from '../models/types';
import { SUBSCRIPTION_PRICES, TIER_FEATURES } from '../models/SubscriptionConfig';

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
            {currentTier === 'free' && (
              <TouchableOpacity
                style={styles.tierCard}
                onPress={() => onUpgrade('premium')}
              >
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>Premium</Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.price}>
                      ${SUBSCRIPTION_PRICES.premium.monthly}
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
              </TouchableOpacity>
            )}

            {/* Family Tier */}
            <TouchableOpacity
              style={styles.tierCard}
              onPress={() => onUpgrade('family')}
            >
              <View style={styles.tierHeader}>
                <Text style={styles.tierName}>Family</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>
                    ${SUBSCRIPTION_PRICES.family.monthly}
                  </Text>
                  <Text style={styles.priceLabel}>/month</Text>
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
            </TouchableOpacity>

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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    maxHeight: '90%',
  },
  limitMessageContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  limitIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  limitMessage: {
    color: '#FF453A',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  upgradeTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  tierCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    color: '#30D158',
    fontSize: 24,
    fontWeight: 'bold',
  },
  priceLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  featuresContainer: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkmark: {
    color: '#30D158',
    fontSize: 16,
    marginRight: 8,
    fontWeight: 'bold',
  },
  featureText: {
    color: '#E5E5E7',
    fontSize: 14,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    padding: 16,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#8E8E93',
    fontSize: 16,
  },
});

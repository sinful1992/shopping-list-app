import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { SubscriptionTier, User } from '../../models/types';
import { SUBSCRIPTION_LIMITS, SUBSCRIPTION_PRICES, TIER_FEATURES } from '../../models/SubscriptionConfig';
import { UsageIndicator } from '../../components/UsageIndicator';
import AuthenticationModule from '../../services/AuthenticationModule';
import UsageTracker from '../../services/UsageTracker';

type SubscriptionScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Subscription'
>;

interface Props {
  navigation: SubscriptionScreenNavigationProp;
}

/**
 * SubscriptionScreen
 * Sprint 2: Manages subscription tier and displays usage statistics
 */
export const SubscriptionScreen: React.FC<Props> = ({ navigation }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyTier, setFamilyTier] = useState<SubscriptionTier>('free');
  const [usageSummary, setUsageSummary] = useState<{
    lists: { used: number; limit: number | null };
    ocr: { used: number; limit: number | null };
    urgentItems: { used: number; limit: number | null };
  } | null>(null);

  useEffect(() => {
    loadUserAndUsage();
  }, []);

  const loadUserAndUsage = async () => {
    try {
      const currentUser = await AuthenticationModule.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        const summary = await UsageTracker.getUsageSummary(currentUser);
        setUsageSummary(summary);
        const tier = await UsageTracker.getFamilySubscriptionTier(currentUser.familyGroupId);
        setFamilyTier(tier);
      }
    } catch (error) {
      console.error('Error loading user and usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (newTier: 'premium' | 'family') => {
    if (!user || !user.familyGroupId) return;

    Alert.alert(
      'Upgrade Subscription',
      `Upgrade your family group to ${newTier} for $${newTier === 'premium' ? SUBSCRIPTION_PRICES.premium.monthly : SUBSCRIPTION_PRICES.family.monthly}/month? Everyone in your family group will get the benefits!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          onPress: async () => {
            try {
              // TODO: Integrate with RevenueCat for actual payment processing (Sprint 3)
              // For now, just update the tier directly
              await AuthenticationModule.upgradeSubscription(user.familyGroupId!, newTier);

              Alert.alert(
                'Success',
                `Your family group has been upgraded to ${newTier}!`,
                [{ text: 'OK', onPress: loadUserAndUsage }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const getTierBadgeColor = (tier: SubscriptionTier): string => {
    switch (tier) {
      case 'free':
        return '#8E8E93';
      case 'premium':
        return '#007AFF';
      case 'family':
        return '#30D158';
      default:
        return '#8E8E93';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user || !usageSummary) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load subscription info</Text>
      </View>
    );
  }

  const currentTier = familyTier;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Current Plan Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Your Subscription</Text>
        <View
          style={[
            styles.tierBadge,
            { backgroundColor: getTierBadgeColor(currentTier) },
          ]}
        >
          <Text style={styles.tierBadgeText}>
            {currentTier.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Usage Statistics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Usage This Month</Text>
        <View style={styles.usageContainer}>
          <UsageIndicator
            label="Shopping Lists"
            used={usageSummary.lists.used}
            limit={usageSummary.lists.limit}
            tier={currentTier}
          />
          <UsageIndicator
            label="Receipt Scans"
            used={usageSummary.ocr.used}
            limit={usageSummary.ocr.limit}
            tier={currentTier}
          />
          <UsageIndicator
            label="Urgent Items"
            used={usageSummary.urgentItems.used}
            limit={usageSummary.urgentItems.limit}
            tier={currentTier}
          />
        </View>
      </View>

      {/* Upgrade Options */}
      {currentTier !== 'family' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upgrade Options</Text>

          {/* Premium Tier */}
          {currentTier === 'free' && (
            <View style={styles.tierCard}>
              <View style={styles.tierCardHeader}>
                <Text style={styles.tierCardName}>Premium</Text>
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
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => handleUpgrade('premium')}
              >
                <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Family Tier */}
          <View style={styles.tierCard}>
            <View style={styles.tierCardHeader}>
              <Text style={styles.tierCardName}>Family</Text>
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
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => handleUpgrade('family')}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Family</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Current Plan Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Plan Features</Text>
        <View style={styles.currentFeaturesContainer}>
          {TIER_FEATURES[currentTier].map((feature, index) => (
            <View key={index} style={styles.currentFeatureRow}>
              <Text style={styles.currentFeatureCheckmark}>✓</Text>
              <Text style={styles.currentFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF453A',
    fontSize: 16,
  },
  headerContainer: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tierBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  usageContainer: {
    gap: 12,
  },
  tierCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  tierCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierCardName: {
    color: '#FFFFFF',
    fontSize: 20,
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
  currentFeaturesContainer: {
    gap: 12,
  },
  currentFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentFeatureCheckmark: {
    color: '#30D158',
    fontSize: 18,
    marginRight: 10,
    fontWeight: 'bold',
  },
  currentFeatureText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

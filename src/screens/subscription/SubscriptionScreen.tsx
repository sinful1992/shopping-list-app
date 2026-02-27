import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useRevenueCat } from '../../contexts/RevenueCatContext';
import { SubscriptionTier, User } from '../../models/types';
import { TIER_FEATURES } from '../../models/SubscriptionConfig';
import { UsageIndicator } from '../../components/UsageIndicator';
import AuthenticationModule from '../../services/AuthenticationModule';
import UsageTracker from '../../services/UsageTracker';

export const SubscriptionScreen: React.FC = () => {
  const { showAlert } = useAlert();
  const {
    tier,
    offerings,
    isPurchasing,
    isLoading: rcLoading,
    presentPaywall,
    presentCustomerCenter,
    restorePurchases,
  } = useRevenueCat();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageSummary, setUsageSummary] = useState<{
    lists: { used: number; limit: number | null };
    ocr: { used: number; limit: number | null };
    urgentItems: { used: number; limit: number | null };
  } | null>(null);

  useEffect(() => {
    loadUserAndUsage();
  }, []);

  // Reload usage when tier changes (e.g., after purchase)
  useEffect(() => {
    if (user) {
      UsageTracker.getUsageSummary(user).then(setUsageSummary).catch(() => {});
    }
  }, [tier]);

  const loadUserAndUsage = async () => {
    try {
      const currentUser = await AuthenticationModule.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        const summary = await UsageTracker.getUsageSummary(currentUser);
        setUsageSummary(summary);
      }
    } catch {
      // Failed to load user/usage
    } finally {
      setLoading(false);
    }
  };

  const monthlyPrice = (() => {
    if (!offerings) return null;
    const monthlyPackage = offerings.availablePackages.find(
      pkg => pkg.identifier === 'monthly' || pkg.packageType === 'MONTHLY'
    );
    return monthlyPackage?.product.priceString ?? null;
  })();

  const handleUpgrade = async () => {
    if (!user?.familyGroupId) return;
    await presentPaywall();
  };

  const handleManageSubscription = async () => {
    try {
      await presentCustomerCenter();
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleRestorePurchases = async () => {
    if (!user?.familyGroupId) return;
    try {
      await restorePurchases();
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const getTierBadgeColor = (t: SubscriptionTier): string => {
    switch (t) {
      case 'free': return '#8E8E93';
      case 'premium': return '#007AFF';
      case 'family': return '#30D158';
      default: return '#8E8E93';
    }
  };

  if (loading || rcLoading) {
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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Activating overlay */}
      {isPurchasing && (
        <View style={styles.activatingBanner}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.activatingText}>Activating your subscription...</Text>
        </View>
      )}

      {/* Current Plan Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Your Subscription</Text>
        <View
          style={[styles.tierBadge, { backgroundColor: getTierBadgeColor(tier) }]}
        >
          <Text style={styles.tierBadgeText}>{tier.toUpperCase()}</Text>
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
            tier={tier}
          />
          <UsageIndicator
            label="Urgent Items"
            used={usageSummary.urgentItems.used}
            limit={usageSummary.urgentItems.limit}
            tier={tier}
          />
        </View>
      </View>

      {/* Upgrade Options */}
      {tier !== 'family' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upgrade Options</Text>

          {tier === 'free' && (
            <View style={styles.tierCard}>
              <View style={styles.tierCardHeader}>
                <Text style={styles.tierCardName}>Premium</Text>
                {monthlyPrice && (
                  <View style={styles.priceContainer}>
                    <Text style={styles.price}>{monthlyPrice}</Text>
                    <Text style={styles.priceLabel}>/month</Text>
                  </View>
                )}
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
                onPress={handleUpgrade}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.upgradeButtonText}>View Subscription Options</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Manage Subscription (Customer Center) */}
      {tier !== 'free' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Management</Text>
          <TouchableOpacity
            style={styles.manageButton}
            onPress={handleManageSubscription}
          >
            <Text style={styles.manageButtonText}>Manage Subscription</Text>
          </TouchableOpacity>
          <Text style={styles.manageHintText}>
            View billing, change plan, cancel subscription, or contact support
          </Text>
        </View>
      )}

      {/* Current Plan Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Plan Features</Text>
        <View style={styles.currentFeaturesContainer}>
          {TIER_FEATURES[tier].map((feature, index) => (
            <View key={index} style={styles.currentFeatureRow}>
              <Text style={styles.currentFeatureCheckmark}>✓</Text>
              <Text style={styles.currentFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Restore Purchases */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestorePurchases}
          disabled={isPurchasing}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>
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
  activatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 10,
  },
  activatingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  restoreButton: {
    padding: 14,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  manageButton: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  manageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  manageHintText: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
  },
});

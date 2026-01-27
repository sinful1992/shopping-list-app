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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { SubscriptionTier, User } from '../../models/types';
import { SUBSCRIPTION_LIMITS, SUBSCRIPTION_PRICES, TIER_FEATURES } from '../../models/SubscriptionConfig';
import { UsageIndicator } from '../../components/UsageIndicator';
import AuthenticationModule from '../../services/AuthenticationModule';
import UsageTracker from '../../services/UsageTracker';
import PaymentService from '../../services/PaymentService';
import { PurchasesOffering } from 'react-native-purchases';
import database from '@react-native-firebase/database';

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
  const { showAlert } = useAlert();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyTier, setFamilyTier] = useState<SubscriptionTier>('free');
  const [usageSummary, setUsageSummary] = useState<{
    lists: { used: number; limit: number | null };
    ocr: { used: number; limit: number | null };
    urgentItems: { used: number; limit: number | null };
  } | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState<string>('£9.99');

  useEffect(() => {
    loadUserAndUsage();
    loadOfferings();
  }, []);

  // Real-time listener for subscription tier changes
  useEffect(() => {
    if (!user?.familyGroupId) return;

    const subscriptionRef = database().ref(`/familyGroups/${user.familyGroupId}/subscriptionTier`);

    const onSubscriptionChange = (snapshot: any) => {
      const newTier = snapshot.val() as SubscriptionTier;
      if (newTier && newTier !== familyTier) {
        setFamilyTier(newTier);
        // Optionally reload usage limits when tier changes
        loadUserAndUsage();
      }
    };

    subscriptionRef.on('value', onSubscriptionChange);

    return () => {
      subscriptionRef.off('value', onSubscriptionChange);
    };
  }, [user?.familyGroupId]);

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
      // Failed to load user/usage
    } finally {
      setLoading(false);
    }
  };

  const loadOfferings = async () => {
    try {
      const currentOfferings = await PaymentService.getOfferings();
      setOfferings(currentOfferings);

      // Extract monthly price from offerings
      if (currentOfferings) {
        const monthlyPackage = currentOfferings.availablePackages.find(
          pkg => pkg.identifier === 'monthly' || pkg.packageType === 'MONTHLY'
        );

        if (monthlyPackage) {
          // Get localized price string (e.g., "£9.99", "$9.99", "€9.99")
          const priceString = monthlyPackage.product.priceString;
          setMonthlyPrice(priceString);
        }
      }
    } catch (error) {
      // Failed to load offerings
    }
  };

  const handleUpgrade = async () => {
    if (!user || !user.familyGroupId || purchasing) return;

    setPurchasing(true);

    try {
      // Present RevenueCat Paywall (modern UI)
      const result = await PaymentService.presentPaywall();

      if (result.success && result.customerInfo) {
        // Sync subscription status to Firebase
        await PaymentService.syncSubscriptionToFirebase(user.familyGroupId, result.customerInfo);

        const tier = PaymentService.getSubscriptionTierFromCustomerInfo(result.customerInfo);

        showAlert(
          'Welcome to Pro!',
          `Your family group has been upgraded! Everyone in your family group now has full access.`,
          [{ text: 'OK', onPress: loadUserAndUsage }],
          { icon: 'success' }
        );
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to process purchase', undefined, { icon: 'error' });
    } finally {
      setPurchasing(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const canPresent = await PaymentService.canPresentCustomerCenter();
      if (canPresent) {
        await PaymentService.presentCustomerCenter();
      } else {
        showAlert('No Active Subscription', 'You need an active subscription to access Customer Center.', undefined, { icon: 'info' });
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to open Customer Center', undefined, { icon: 'error' });
    }
  };

  const handleRestorePurchases = async () => {
    if (!user || !user.familyGroupId) return;

    setPurchasing(true);

    try {
      const result = await PaymentService.restorePurchases();

      if (result.success && result.customerInfo) {
        // Sync restored subscription to Firebase
        await PaymentService.syncSubscriptionToFirebase(user.familyGroupId, result.customerInfo);

        const tier = PaymentService.getSubscriptionTierFromCustomerInfo(result.customerInfo);

        if (tier !== 'free') {
          showAlert(
            'Restored!',
            `Your ${tier} subscription has been restored!`,
            [{ text: 'OK', onPress: loadUserAndUsage }],
            { icon: 'success' }
          );
        } else {
          showAlert('No Active Subscription', 'No active subscriptions were found to restore.', undefined, { icon: 'info' });
        }
      } else {
        showAlert('Restore Failed', result.error || 'Failed to restore purchases', undefined, { icon: 'error' });
      }
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to restore purchases', undefined, { icon: 'error' });
    } finally {
      setPurchasing(false);
    }
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
          {/* OCR FEATURE HIDDEN
          <UsageIndicator
            label="Receipt Scans"
            used={usageSummary.ocr.used}
            limit={usageSummary.ocr.limit}
            tier={currentTier}
          />
          */}
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
                    {monthlyPrice}
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
                onPress={handleUpgrade}
                disabled={purchasing}
              >
                {purchasing ? (
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
      {currentTier !== 'free' && (
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
          {TIER_FEATURES[currentTier].map((feature, index) => (
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
          disabled={purchasing}
        >
          {purchasing ? (
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

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import RevenueCatUI from 'react-native-purchases-ui';
import { SubscriptionTier } from '../models/types';
import AuthenticationModule from './AuthenticationModule';
import { REVENUECAT_ANDROID_API_KEY } from '@env';

/**
 * PaymentService
 * Handles in-app purchases and subscriptions via RevenueCat
 * Includes Paywalls and Customer Center support
 * Sprint 3: Complete Payment Integration
 */
class PaymentService {
  private initialized = false;
  private readonly API_KEY = REVENUECAT_ANDROID_API_KEY || 'test_lHnyYxixgAVAQJvtsrSJvEdVzaw'; // Fallback to test key for development
  private readonly ENTITLEMENT_ID = 'Family shopping list pro';

  /**
   * Initialize RevenueCat SDK with Paywalls support
   * Call this on app launch
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Enable debug logs in development
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      // Configure RevenueCat with your API key
      await Purchases.configure({
        apiKey: this.API_KEY,
      });

      // Set user ID for RevenueCat
      const user = await AuthenticationModule.getCurrentUser();
      if (user) {
        await Purchases.logIn(user.uid);
      }

      this.initialized = true;
      console.log('✅ RevenueCat initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize RevenueCat:', error);
      throw error;
    }
  }

  /**
   * Get available subscription offerings
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current;
    } catch (error) {
      console.error('Failed to get offerings:', error);
      return null;
    }
  }

  /**
   * Purchase a subscription package
   */
  async purchasePackage(packageToPurchase: PurchasesPackage): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
    error?: string;
  }> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return { success: true, customerInfo };
    } catch (error: any) {
      if (error.userCancelled) {
        return { success: false, error: 'Purchase cancelled by user' };
      }
      console.error('Purchase failed:', error);
      return { success: false, error: error.message || 'Purchase failed' };
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
    error?: string;
  }> {
    try {
      const customerInfo = await Purchases.restorePurchases();
      return { success: true, customerInfo };
    } catch (error: any) {
      console.error('Restore purchases failed:', error);
      return { success: false, error: error.message || 'Restore failed' };
    }
  }

  /**
   * Get current customer info
   */
  async getCustomerInfo(): Promise<CustomerInfo | null> {
    try {
      return await Purchases.getCustomerInfo();
    } catch (error) {
      console.error('Failed to get customer info:', error);
      return null;
    }
  }

  /**
   * Check if user has Pro entitlement
   */
  hasProEntitlement(customerInfo: CustomerInfo): boolean {
    return customerInfo.entitlements.active[this.ENTITLEMENT_ID] !== undefined;
  }

  /**
   * Determine subscription tier from RevenueCat entitlements
   * Uses product identifiers to determine tier level
   */
  getSubscriptionTierFromCustomerInfo(customerInfo: CustomerInfo): SubscriptionTier {
    // Check if user has Pro entitlement
    if (!this.hasProEntitlement(customerInfo)) {
      return 'free';
    }

    // Check product identifier to determine tier
    const proEntitlement = customerInfo.entitlements.active[this.ENTITLEMENT_ID];
    const productId = proEntitlement.productIdentifier;

    // Map product IDs to tiers
    if (productId === 'lifetime') {
      return 'family'; // Lifetime gets family tier benefits
    }

    if (productId === 'yearly') {
      return 'family'; // Yearly gets family tier benefits
    }

    if (productId === 'monthly') {
      return 'premium'; // Monthly gets premium tier benefits
    }

    // Default to premium if has entitlement but unknown product
    return 'premium';
  }

  /**
   * Sync RevenueCat subscription status to Firebase
   * Call this after successful purchase or restore
   */
  async syncSubscriptionToFirebase(familyGroupId: string, customerInfo: CustomerInfo): Promise<void> {
    try {
      const tier = this.getSubscriptionTierFromCustomerInfo(customerInfo);
      await AuthenticationModule.upgradeSubscription(familyGroupId, tier as 'premium' | 'family');
      console.log(`Synced subscription tier to Firebase: ${tier}`);
    } catch (error) {
      console.error('Failed to sync subscription to Firebase:', error);
      throw error;
    }
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(): Promise<boolean> {
    const customerInfo = await this.getCustomerInfo();
    if (!customerInfo) return false;

    const tier = this.getSubscriptionTierFromCustomerInfo(customerInfo);
    return tier !== 'free';
  }

  /**
   * Listen to customer info updates
   * This fires when subscription status changes (purchase, renewal, expiration, etc.)
   */
  addCustomerInfoUpdateListener(
    callback: (customerInfo: CustomerInfo) => void
  ): () => void {
    Purchases.addCustomerInfoUpdateListener(callback);

    // Return unsubscribe function
    return () => {
      Purchases.removeCustomerInfoUpdateListener(callback);
    };
  }

  /**
   * Set user ID for RevenueCat
   * Call this when user logs in
   */
  async setUserID(userId: string): Promise<void> {
    try {
      await Purchases.logIn(userId);
      console.log(`RevenueCat user ID set: ${userId}`);
    } catch (error) {
      console.error('Failed to set RevenueCat user ID:', error);
    }
  }

  /**
   * Clear user ID from RevenueCat
   * Call this when user logs out
   */
  async logout(): Promise<void> {
    try {
      await Purchases.logOut();
      console.log('RevenueCat user logged out');
    } catch (error) {
      console.error('Failed to logout from RevenueCat:', error);
    }
  }

  /**
   * Present RevenueCat Paywall
   * Modern UI for subscription offerings
   * @param offeringId - Optional offering identifier (default uses current offering)
   */
  async presentPaywall(offeringId?: string): Promise<{
    success: boolean;
    customerInfo?: CustomerInfo;
  }> {
    try {
      const result = await RevenueCatUI.presentPaywall({
        offering: offeringId,
      });

      if (result === RevenueCatUI.PAYWALL_RESULT.PURCHASED) {
        const customerInfo = await this.getCustomerInfo();
        return { success: true, customerInfo: customerInfo || undefined };
      }

      if (result === RevenueCatUI.PAYWALL_RESULT.RESTORED) {
        const customerInfo = await this.getCustomerInfo();
        return { success: true, customerInfo: customerInfo || undefined };
      }

      // User cancelled or closed paywall
      return { success: false };
    } catch (error) {
      console.error('Failed to present paywall:', error);
      return { success: false };
    }
  }

  /**
   * Present Customer Center
   * Allows users to manage subscription, view billing, contact support
   */
  async presentCustomerCenter(): Promise<void> {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (error) {
      console.error('Failed to present customer center:', error);
      throw error;
    }
  }

  /**
   * Check if Customer Center is supported
   */
  async canPresentCustomerCenter(): Promise<boolean> {
    try {
      // Customer Center requires active subscription
      const customerInfo = await this.getCustomerInfo();
      return customerInfo ? this.hasProEntitlement(customerInfo) : false;
    } catch (error) {
      return false;
    }
  }
}

export default new PaymentService();

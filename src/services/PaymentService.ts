import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { SubscriptionTier } from '../models/types';
import AuthenticationModule from './AuthenticationModule';

/**
 * PaymentService
 * Handles in-app purchases and subscriptions via RevenueCat
 * Sprint 3: Payment Integration
 */
class PaymentService {
  private initialized = false;

  /**
   * Initialize RevenueCat SDK
   * Call this on app launch
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // TODO: Replace with your actual RevenueCat API keys
      const apiKey = Platform.select({
        ios: process.env.REVENUECAT_IOS_API_KEY || 'YOUR_IOS_API_KEY',
        android: process.env.REVENUECAT_ANDROID_API_KEY || 'YOUR_ANDROID_API_KEY',
      });

      if (!apiKey || apiKey.startsWith('YOUR_')) {
        console.warn('RevenueCat API key not configured. Payment features will not work.');
        return;
      }

      // Configure RevenueCat
      await Purchases.configure({ apiKey });

      // Set user ID for RevenueCat
      const user = await AuthenticationModule.getCurrentUser();
      if (user) {
        await Purchases.logIn(user.uid);
      }

      this.initialized = true;
      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
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
   * Determine subscription tier from RevenueCat entitlements
   */
  getSubscriptionTierFromCustomerInfo(customerInfo: CustomerInfo): SubscriptionTier {
    // Check active entitlements
    const entitlements = customerInfo.entitlements.active;

    if (entitlements['family']) {
      return 'family';
    }

    if (entitlements['premium']) {
      return 'premium';
    }

    return 'free';
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
}

export default new PaymentService();

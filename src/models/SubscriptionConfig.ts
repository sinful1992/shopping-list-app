import { SubscriptionTier, SubscriptionLimits } from './types';
import productConfig from '../../shared/product-config.json';

export const ENTITLEMENT_ID: string = productConfig.entitlementId;
export const PRODUCT_TIER_MAP: Record<string, SubscriptionTier> = productConfig.productTierMap as Record<string, SubscriptionTier>;
export const TIER_CACHE_KEY = '@cached_subscription_tier';

export function getTierFromProductId(productId: string): SubscriptionTier {
  return PRODUCT_TIER_MAP[productId] ?? 'premium';
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    maxLists: 4,
    maxOCRPerMonth: 1,
    maxUrgentItemsPerMonth: 1,
    maxFamilyMembers: null,
  },
  premium: {
    maxLists: null,
    maxOCRPerMonth: 20,
    maxUrgentItemsPerMonth: 3,
    maxFamilyMembers: null,
  },
  family: {
    maxLists: null,
    maxOCRPerMonth: null,
    maxUrgentItemsPerMonth: null,
    maxFamilyMembers: null,
  },
};

export const TIER_FEATURES = {
  free: [
    '4 Shopping Lists',
    '1 Urgent Item/month',
    'Basic Features',
  ],
  premium: [
    'Unlimited Shopping Lists',
    '3 Urgent Items/month',
    'Priority Support',
  ],
  family: [
    'Unlimited Everything',
    'Up to 10 Family Members',
    'Shared Shopping Lists',
    'Unlimited Urgent Items',
    'Priority Support',
  ],
};

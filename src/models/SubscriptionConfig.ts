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
    maxLists: null,
    maxOCRPerMonth: 0,            // hard-block — OCR is premium+ only
    maxUrgentItemsPerMonth: null, // gate is "ad per creation", not monthly cap
    maxFamilyMembers: null,
  },
  premium: {
    maxLists: null,
    maxOCRPerMonth: null,         // inversion fix — was 20, premium unlocks OCR fully
    maxUrgentItemsPerMonth: null, // inversion fix — was 3, dead code anyway
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
    'Unlimited Shopping Lists',
    'Urgent Items (Watch Ad)',
    'Ad-supported',
  ],
  premium: [
    'No Ads — for you',
    'Receipt Scanning',
    'Urgent Items Without Ads',
    'Priority Support',
  ],
  family: [
    'No Ads — for everyone in your group',
    'Receipt Scanning',
    'Urgent Items Without Ads',
    'Up to 10 Family Members',
    'Priority Support',
  ],
};

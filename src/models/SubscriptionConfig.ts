import { SubscriptionTier, SubscriptionLimits } from './types';
import productConfig from '../../shared/product-config.json';

export const ENTITLEMENT_ID: string = productConfig.entitlementId;
export const TIER_CACHE_KEY = '@cached_subscription_tier';

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    maxLists: null,
    maxOCRPerMonth: null,         // gate is now ad-based in UI, not a numeric cap
    maxFamilyMembers: null,
  },
  premium: {
    maxLists: null,
    maxOCRPerMonth: null,         // inversion fix — was 20, premium unlocks OCR fully
    maxFamilyMembers: null,
  },
  family: {
    maxLists: null,
    maxOCRPerMonth: null,
    maxFamilyMembers: null,
  },
};

export const TIER_FEATURES = {
  free: [
    'Unlimited Shopping Lists',
    'Receipt Scanning (Watch Ad)',
    'Ad-supported',
  ],
  premium: [
    'No Ads — for you',
    'Receipt Scanning',
    'Priority Support',
  ],
  family: [
    'No Ads — for everyone in your group',
    'Receipt Scanning',
    'Up to 10 Family Members',
    'Priority Support',
  ],
};

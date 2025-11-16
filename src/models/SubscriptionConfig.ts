import { SubscriptionTier, SubscriptionLimits } from './types';

/**
 * Subscription tier limits configuration
 * Defines what each tier can access
 */
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    maxLists: 4,
    maxOCRPerMonth: 1, // Only 1 OCR scan per month for free users
    maxUrgentItemsPerMonth: 1,
    maxFamilyMembers: null, // No family group for free tier
  },
  premium: {
    maxLists: null, // Unlimited
    maxOCRPerMonth: 20,
    maxUrgentItemsPerMonth: 3,
    maxFamilyMembers: null, // Solo use, no family sharing
  },
  family: {
    maxLists: null, // Unlimited
    maxOCRPerMonth: null, // Unlimited
    maxUrgentItemsPerMonth: null, // Unlimited
    maxFamilyMembers: 10,
  },
};

/**
 * Subscription pricing
 */
export const SUBSCRIPTION_PRICES = {
  premium: {
    monthly: 4.99,
    currency: 'USD',
  },
  family: {
    monthly: 9.99,
    currency: 'USD',
  },
};

/**
 * Tier feature descriptions for UI display
 */
export const TIER_FEATURES = {
  free: [
    '4 Shopping Lists',
    '1 Receipt Scan/month',
    '1 Urgent Item/month',
    'Basic Features',
  ],
  premium: [
    'Unlimited Shopping Lists',
    '20 Receipt Scans/month',
    '3 Urgent Items/month',
    'Priority Support',
  ],
  family: [
    'Unlimited Everything',
    'Up to 10 Family Members',
    'Shared Shopping Lists',
    'Unlimited Receipt Scans',
    'Unlimited Urgent Items',
    'Priority Support',
  ],
};

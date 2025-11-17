import { SubscriptionTier, SubscriptionLimits } from './types';

/**
 * Owner email whitelist
 * Users with these emails bypass all subscription limits (free unlimited access)
 */
export const OWNER_EMAILS = [
  'barkus.giedrius@gmail.com',
  // Add more owner emails here if needed
];

/**
 * Subscription tier limits configuration
 * Defines what each tier can access
 */
export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    maxLists: 4,
    maxOCRPerMonth: 1, // Only 1 OCR scan per month for free users
    maxUrgentItemsPerMonth: 1,
    maxFamilyMembers: null,
  },
  premium: {
    maxLists: null, // Unlimited
    maxOCRPerMonth: 20,
    maxUrgentItemsPerMonth: 3,
    maxFamilyMembers: null,
  },
  family: {
    maxLists: null, // Unlimited
    maxOCRPerMonth: null, // Unlimited
    maxUrgentItemsPerMonth: null, // Unlimited
    maxFamilyMembers: null,
  },
};

/**
 * Subscription pricing (GBP)
 * Note: Actual pricing comes from RevenueCat/Google Play
 * These are display values only
 */
export const SUBSCRIPTION_PRICES = {
  premium: {
    monthly: 9.99, // Monthly subscription
    currency: 'GBP',
    symbol: '£',
  },
  family: {
    yearly: 99.99, // Yearly subscription
    lifetime: 199.99, // Lifetime purchase
    currency: 'GBP',
    symbol: '£',
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

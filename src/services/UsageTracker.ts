import database from '@react-native-firebase/database';
import { User, UsageCounters, FamilyGroup, SubscriptionTier } from '../models/types';
import { SUBSCRIPTION_LIMITS } from '../models/SubscriptionConfig';

/**
 * UsageTracker
 * Tracks and enforces usage limits for subscription tiers
 * Implements Sprint 2: Freemium Model & Usage Limits
 * Subscription is at FAMILY level - one person pays, everyone benefits
 */
class UsageTracker {
  /**
   * Get family group's subscription tier
   * This is the key fix: check family tier, not individual user tier
   */
  async getFamilySubscriptionTier(familyGroupId: string | null): Promise<SubscriptionTier> {
    if (!familyGroupId) {
      return 'free'; // Solo users without family group default to free
    }

    try {
      const groupSnapshot = await database().ref(`/familyGroups/${familyGroupId}`).once('value');
      const familyGroup: FamilyGroup | null = groupSnapshot.val();
      return familyGroup?.subscriptionTier || 'free';
    } catch (error) {
      console.error('Error fetching family subscription tier:', error);
      return 'free';
    }
  }

  /**
   * Check if monthly reset is needed and reset if necessary
   */
  async checkAndResetIfNeeded(user: User): Promise<UsageCounters> {
    const now = Date.now();
    const counters = user.usageCounters;
    const lastReset = new Date(counters.lastResetDate);
    const currentMonth = new Date(now);

    // Check if we're in a new month
    if (
      lastReset.getMonth() !== currentMonth.getMonth() ||
      lastReset.getFullYear() !== currentMonth.getFullYear()
    ) {
      const resetCounters: UsageCounters = {
        listsCreated: 0,
        ocrProcessed: 0,
        urgentItemsCreated: 0,
        lastResetDate: now,
      };

      // Update Firebase
      await database().ref(`/users/${user.uid}/usageCounters`).set(resetCounters);

      return resetCounters;
    }

    return counters;
  }

  /**
   * Check if user can create a shopping list
   * Uses FAMILY subscription tier, not individual user tier
   */
  async canCreateList(user: User): Promise<{ allowed: boolean; reason?: string }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = SUBSCRIPTION_LIMITS[familyTier];

    if (limits.maxLists === null) {
      return { allowed: true };
    }

    if (counters.listsCreated >= limits.maxLists) {
      return {
        allowed: false,
        reason: `You've reached your limit of ${limits.maxLists} lists. Upgrade to Premium for unlimited lists!`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can process OCR
   * Uses FAMILY subscription tier, not individual user tier
   */
  async canProcessOCR(user: User): Promise<{ allowed: boolean; reason?: string }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = SUBSCRIPTION_LIMITS[familyTier];

    if (limits.maxOCRPerMonth === null) {
      return { allowed: true };
    }

    if (counters.ocrProcessed >= limits.maxOCRPerMonth) {
      return {
        allowed: false,
        reason: `You've used your ${limits.maxOCRPerMonth} OCR scan${limits.maxOCRPerMonth > 1 ? 's' : ''} this month. Upgrade for more!`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can create urgent item
   * Uses FAMILY subscription tier, not individual user tier
   */
  async canCreateUrgentItem(user: User): Promise<{ allowed: boolean; reason?: string }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = SUBSCRIPTION_LIMITS[familyTier];

    if (limits.maxUrgentItemsPerMonth === null) {
      return { allowed: true };
    }

    if (counters.urgentItemsCreated >= limits.maxUrgentItemsPerMonth) {
      return {
        allowed: false,
        reason: `You've reached your limit of ${limits.maxUrgentItemsPerMonth} urgent item${limits.maxUrgentItemsPerMonth > 1 ? 's' : ''} this month. Upgrade for more!`,
      };
    }

    return { allowed: true };
  }

  /**
   * Increment list counter
   */
  async incrementListCounter(userId: string): Promise<void> {
    await database()
      .ref(`/users/${userId}/usageCounters/listsCreated`)
      .transaction((current) => (current || 0) + 1);
  }

  /**
   * Increment OCR counter
   */
  async incrementOCRCounter(userId: string): Promise<void> {
    await database()
      .ref(`/users/${userId}/usageCounters/ocrProcessed`)
      .transaction((current) => (current || 0) + 1);
  }

  /**
   * Increment urgent item counter
   */
  async incrementUrgentItemCounter(userId: string): Promise<void> {
    await database()
      .ref(`/users/${userId}/usageCounters/urgentItemsCreated`)
      .transaction((current) => (current || 0) + 1);
  }

  /**
   * Get remaining usage for display
   */
  async getRemainingUsage(user: User): Promise<{
    lists: number | 'unlimited';
    ocr: number | 'unlimited';
    urgentItems: number | 'unlimited';
  }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const limits = SUBSCRIPTION_LIMITS[user.subscriptionTier];

    return {
      lists:
        limits.maxLists === null
          ? 'unlimited'
          : Math.max(0, limits.maxLists - counters.listsCreated),
      ocr:
        limits.maxOCRPerMonth === null
          ? 'unlimited'
          : Math.max(0, limits.maxOCRPerMonth - counters.ocrProcessed),
      urgentItems:
        limits.maxUrgentItemsPerMonth === null
          ? 'unlimited'
          : Math.max(0, limits.maxUrgentItemsPerMonth - counters.urgentItemsCreated),
    };
  }

  /**
   * Get usage summary for display (used/limit)
   * Uses FAMILY subscription tier, not individual user tier
   */
  async getUsageSummary(user: User): Promise<{
    lists: { used: number; limit: number | null };
    ocr: { used: number; limit: number | null };
    urgentItems: { used: number; limit: number | null };
  }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = SUBSCRIPTION_LIMITS[familyTier];

    return {
      lists: {
        used: counters.listsCreated,
        limit: limits.maxLists,
      },
      ocr: {
        used: counters.ocrProcessed,
        limit: limits.maxOCRPerMonth,
      },
      urgentItems: {
        used: counters.urgentItemsCreated,
        limit: limits.maxUrgentItemsPerMonth,
      },
    };
  }
}

export default new UsageTracker();

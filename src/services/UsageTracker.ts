import { getDatabase, ref, get, set, runTransaction } from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import { User, UsageCounters, FamilyGroup, SubscriptionTier } from '../models/types';
import { SUBSCRIPTION_LIMITS } from '../models/SubscriptionConfig';

/**
 * UsageTracker
 * Tracks monthly usage counters per family for display on the subscription
 * screen. Subscription is at FAMILY level - one person pays, everyone benefits.
 *
 * Numeric caps are currently DISABLED: every tier's limits are null in
 * SubscriptionConfig because the freemium gate is ad-based (free = ads; paid =
 * no ads), not a per-month count. So canCreateList() always allows today — it's
 * kept as the single place a numeric cap could be reintroduced. There is no
 * server-side count enforcement; if one is ever needed it must live in an edge
 * function or RTDB rule, not here.
 */
class UsageTracker {
  /**
   * Check if current user has admin custom claim.
   * Admin users bypass numeric limits here. The admin claim itself is enforced
   * server-side by the RTDB rules (only auth.token.admin may write a tier).
   */
  private async isAdmin(): Promise<boolean> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return false;
      }

      const idTokenResult = await currentUser.getIdTokenResult();
      return idTokenResult.claims.admin === true;
    } catch {
      return false;
    }
  }

  /**
   * Get family group's subscription tier
   * This is the key fix: check family tier, not individual user tier
   */
  async getFamilySubscriptionTier(familyGroupId: string | null): Promise<SubscriptionTier> {
    if (!familyGroupId) {
      return 'free'; // Solo users without family group default to free
    }

    try {
      const groupSnapshot = await get(ref(getDatabase(), `/familyGroups/${familyGroupId}`));
      const familyGroup: FamilyGroup | null = groupSnapshot.val();
      return familyGroup?.subscriptionTier || 'free';
    } catch {
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
      await set(ref(getDatabase(), `/users/${user.uid}/usageCounters`), resetCounters);

      return resetCounters;
    }

    return counters;
  }

  /**
   * Check if user can create a shopping list, using the FAMILY subscription tier.
   * Returns allowed:true today because maxLists is null on every tier (caps are
   * ad-based, not numeric). Kept as the single seam for reintroducing a numeric
   * cap; it is a client-side UX gate only, never an enforcement boundary.
   */
  async canCreateList(user: User): Promise<{ allowed: boolean; reason?: string }> {
    // Admin check via Firebase Custom Claims
    if (await this.isAdmin()) {
      return { allowed: true };
    }

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
   * Increment list counter (drives the used/limit display on the subscription
   * screen; not an enforcement gate).
   */
  async incrementListCounter(userId: string): Promise<void> {
    await runTransaction(ref(getDatabase(), `/users/${userId}/usageCounters/listsCreated`), (current) => (current || 0) + 1);
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

import { getDatabase, ref, get, set, runTransaction } from '@react-native-firebase/database';
import { getAuth, getIdTokenResult } from '@react-native-firebase/auth';
import { User, UsageCounters, FamilyGroup, SubscriptionTier } from '../models/types';
import { SUBSCRIPTION_LIMITS } from '../models/SubscriptionConfig';
import CrashReporting from './CrashReporting';

const EMPTY_COUNTERS: UsageCounters = { listsCreated: 0, ocrProcessed: 0, urgentItemsCreated: 0, lastResetDate: 0 };

/** No tier has a numeric list cap: creating a list needs no server answer. */
function noListCaps(): boolean {
  return Object.values(SUBSCRIPTION_LIMITS).every(l => l.maxLists === null);
}

function limitsFor(tier: SubscriptionTier) {
  return SUBSCRIPTION_LIMITS[tier] ?? SUBSCRIPTION_LIMITS.free;
}

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
      const currentUser = getAuth().currentUser;
      if (!currentUser) {
        return false;
      }

      const idTokenResult = await getIdTokenResult(currentUser);
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
      // The one field, not the whole group: the group node holds every list
      // of the family, and this ran on every list created.
      const tierSnapshot = await get(ref(getDatabase(), `/familyGroups/${familyGroupId}/subscriptionTier`));
      const tier = tierSnapshot.val() as FamilyGroup['subscriptionTier'] | null;
      return tier && tier in SUBSCRIPTION_LIMITS ? tier : 'free';
    } catch {
      return 'free';
    }
  }

  /**
   * Check if monthly reset is needed and reset if necessary
   */
  async checkAndResetIfNeeded(user: User): Promise<UsageCounters> {
    const now = Date.now();
    const counters = user.usageCounters ?? EMPTY_COUNTERS;
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

      // Not awaited: offline, a Firebase write only resolves once the server
      // has it, and nothing here needs to wait for that.
      set(ref(getDatabase(), `/users/${user.uid}/usageCounters`), resetCounters)
        .catch(err => CrashReporting.recordError(err as Error, 'UsageTracker monthly reset'));

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
    // With no cap on any tier the answer is always yes; asking the server
    // first only made creating a list wait on the network (offline: forever).
    if (noListCaps()) {
      return { allowed: true };
    }

    // Admin check via Firebase Custom Claims
    if (await this.isAdmin()) {
      return { allowed: true };
    }

    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = limitsFor(familyTier);

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
  incrementListCounter(userId: string): void {
    // Fire and forget: a transaction only completes with the server, so
    // awaiting it offline held list creation (Partial Shop's new list) forever.
    runTransaction(ref(getDatabase(), `/users/${userId}/usageCounters/listsCreated`), (current) => (current || 0) + 1)
      .catch(err => CrashReporting.recordError(err as Error, 'UsageTracker incrementListCounter'));
  }

  /**
   * Get usage summary for display (used/limit)
   * Uses FAMILY subscription tier, not individual user tier
   */
  async getUsageSummary(user: User): Promise<{
    lists: { used: number; limit: number | null };
    ocr: { used: number; limit: number | null };
  }> {
    const counters = await this.checkAndResetIfNeeded(user);
    const familyTier = await this.getFamilySubscriptionTier(user.familyGroupId);
    const limits = limitsFor(familyTier);

    return {
      lists: {
        used: counters.listsCreated,
        limit: limits.maxLists,
      },
      ocr: {
        used: counters.ocrProcessed,
        limit: limits.maxOCRPerMonth,
      },
    };
  }
}

export default new UsageTracker();

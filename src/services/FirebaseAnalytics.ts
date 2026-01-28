import analytics from '@react-native-firebase/analytics';

/**
 * FirebaseAnalytics Service
 * Wraps Firebase Analytics for event tracking and user engagement metrics
 */
class FirebaseAnalytics {
  /**
   * Initialize Analytics (call on app start)
   */
  async initialize(): Promise<void> {
    // Enable analytics collection
    await analytics().setAnalyticsCollectionEnabled(true);
  }

  /**
   * Set user ID for analytics
   */
  async setUserId(userId: string): Promise<void> {
    await analytics().setUserId(userId);
  }

  /**
   * Set user properties
   */
  async setUserProperties(properties: Record<string, string | null>): Promise<void> {
    for (const [key, value] of Object.entries(properties)) {
      await analytics().setUserProperty(key, value);
    }
  }

  /**
   * Log screen view
   */
  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  }

  // ===== SHOPPING LIST EVENTS =====

  /**
   * Log when a new shopping list is created
   */
  async logListCreated(listId: string): Promise<void> {
    await analytics().logEvent('list_created', {
      list_id: listId,
    });
  }

  /**
   * Log when a shopping list is completed
   */
  async logListCompleted(listId: string, itemCount: number, totalAmount?: number): Promise<void> {
    await analytics().logEvent('shopping_completed', {
      list_id: listId,
      item_count: itemCount,
      total_amount: totalAmount || 0,
    });
  }

  /**
   * Log when a list is deleted
   */
  async logListDeleted(listId: string): Promise<void> {
    await analytics().logEvent('list_deleted', {
      list_id: listId,
    });
  }

  // ===== ITEM EVENTS =====

  /**
   * Log when an item is added to a list
   */
  async logItemAdded(listId: string, itemName: string, category?: string): Promise<void> {
    await analytics().logEvent('item_added', {
      list_id: listId,
      item_name: itemName,
      category: category || 'uncategorized',
    });
  }

  /**
   * Log when an item is checked off
   */
  async logItemChecked(listId: string, itemId: string): Promise<void> {
    await analytics().logEvent('item_checked', {
      list_id: listId,
      item_id: itemId,
    });
  }

  // ===== URGENT ITEM EVENTS =====

  /**
   * Log when an urgent item is created
   */
  async logUrgentItemCreated(itemId: string): Promise<void> {
    await analytics().logEvent('urgent_item_created', {
      item_id: itemId,
    });
  }

  /**
   * Log when an urgent item is resolved
   */
  async logUrgentItemResolved(itemId: string): Promise<void> {
    await analytics().logEvent('urgent_item_resolved', {
      item_id: itemId,
    });
  }

  // ===== RECEIPT EVENTS =====

  /**
   * Log when a receipt is captured
   */
  async logReceiptCaptured(listId: string): Promise<void> {
    await analytics().logEvent('receipt_captured', {
      list_id: listId,
    });
  }

  // ===== FAMILY GROUP EVENTS =====

  /**
   * Log when a family group is created
   */
  async logFamilyGroupCreated(groupId: string): Promise<void> {
    await analytics().logEvent('family_group_created', {
      group_id: groupId,
    });
  }

  /**
   * Log when a user joins a family group
   */
  async logFamilyGroupJoined(groupId: string): Promise<void> {
    await analytics().logEvent('family_group_joined', {
      group_id: groupId,
    });
  }

  // ===== SUBSCRIPTION EVENTS =====

  /**
   * Log when subscription paywall is viewed
   */
  async logPaywallViewed(): Promise<void> {
    await analytics().logEvent('paywall_viewed', {});
  }

  /**
   * Log successful subscription purchase
   */
  async logSubscriptionPurchased(tier: string, price?: number): Promise<void> {
    await analytics().logEvent('subscription_purchased', {
      tier: tier,
      price: price || 0,
    });
  }

  // ===== BUDGET EVENTS =====

  /**
   * Log when budget is set
   */
  async logBudgetSet(amount: number, period: string): Promise<void> {
    await analytics().logEvent('budget_set', {
      amount: amount,
      period: period,
    });
  }

  // ===== GENERIC EVENTS =====

  /**
   * Log a custom event
   */
  async logEvent(eventName: string, params?: Record<string, any>): Promise<void> {
    await analytics().logEvent(eventName, params || {});
  }

  /**
   * Clear user data on logout
   */
  async clearUser(): Promise<void> {
    await analytics().setUserId(null);
  }
}

export default new FirebaseAnalytics();

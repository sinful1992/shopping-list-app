import {
  getAnalytics,
  setAnalyticsCollectionEnabled,
  setUserId as setAnalyticsUserId,
  setUserProperty,
  logScreenView as logAnalyticsScreenView,
  logEvent as logAnalyticsEvent,
} from '@react-native-firebase/analytics';

/**
 * FirebaseAnalytics Service
 * Wraps Firebase Analytics for event tracking and user engagement metrics
 *
 * Imports that share a name with one of this class's own methods are aliased,
 * so a call reads as the SDK's rather than a recursive one. getAnalytics() is
 * called per method, keeping the instance as lazy as the namespaced accessor.
 */
class FirebaseAnalytics {
  /**
   * Initialize Analytics (call on app start)
   */
  async initialize(): Promise<void> {
    // Enable analytics collection
    await setAnalyticsCollectionEnabled(getAnalytics(), true);
  }

  /**
   * Set user ID for analytics
   */
  async setUserId(userId: string): Promise<void> {
    await setAnalyticsUserId(getAnalytics(), userId);
  }

  /**
   * Set user properties
   */
  async setUserProperties(properties: Record<string, string | null>): Promise<void> {
    for (const [key, value] of Object.entries(properties)) {
      await setUserProperty(getAnalytics(), key, value);
    }
  }

  /**
   * Log screen view
   */
  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    await logAnalyticsScreenView(getAnalytics(), {
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  }

  /**
   * Log a custom event
   */
  async logEvent(eventName: string, params?: Record<string, any>): Promise<void> {
    await logAnalyticsEvent(getAnalytics(), eventName, params || {});
  }

  /**
   * Clear user data on logout
   */
  async clearUser(): Promise<void> {
    await setAnalyticsUserId(getAnalytics(), null);
  }
}

export default new FirebaseAnalytics();

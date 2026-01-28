import crashlytics from '@react-native-firebase/crashlytics';

/**
 * CrashReporting Service
 * Wraps Firebase Crashlytics for error reporting and crash monitoring
 */
class CrashReporting {
  /**
   * Initialize Crashlytics (call on app start)
   */
  async initialize(): Promise<void> {
    // Enable Crashlytics collection (can be disabled for testing)
    await crashlytics().setCrashlyticsCollectionEnabled(true);
  }

  /**
   * Set user identifier for crash reports
   */
  async setUserId(userId: string): Promise<void> {
    await crashlytics().setUserId(userId);
  }

  /**
   * Set custom attributes for crash reports
   */
  async setAttributes(attributes: Record<string, string>): Promise<void> {
    await crashlytics().setAttributes(attributes);
  }

  /**
   * Log a non-fatal error
   * Use this for caught exceptions that don't crash the app
   */
  recordError(error: Error, context?: string): void {
    if (context) {
      crashlytics().log(`Context: ${context}`);
    }
    crashlytics().recordError(error);
  }

  /**
   * Log a message (for debugging in crash reports)
   */
  log(message: string): void {
    crashlytics().log(message);
  }

  /**
   * Log a JavaScript error from ErrorBoundary
   */
  recordJSError(error: Error, componentStack?: string): void {
    crashlytics().log('ErrorBoundary caught an error');
    if (componentStack) {
      crashlytics().log(`Component stack: ${componentStack}`);
    }
    crashlytics().recordError(error);
  }

  /**
   * Force a crash (for testing purposes only)
   */
  testCrash(): void {
    if (__DEV__) {
      crashlytics().crash();
    }
  }

  /**
   * Clear user data on logout
   */
  async clearUser(): Promise<void> {
    await crashlytics().setUserId('');
    await crashlytics().setAttributes({});
  }
}

export default new CrashReporting();

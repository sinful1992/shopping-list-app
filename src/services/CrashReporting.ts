import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
  setUserId as setCrashlyticsUserId,
  setAttributes as setCrashlyticsAttributes,
  log as crashlyticsLog,
  recordError as crashlyticsRecordError,
  crash as crashlyticsCrash,
} from '@react-native-firebase/crashlytics';

/**
 * CrashReporting Service
 * Wraps Firebase Crashlytics for error reporting and crash monitoring
 *
 * The imports are aliased because this class has methods of the same names —
 * an unaliased `log` would read like a recursive call rather than the SDK's.
 * getCrashlytics() is called per method rather than once at module scope, so
 * the instance is still created lazily, as the namespaced accessor was.
 */
class CrashReporting {
  /**
   * Initialize Crashlytics (call on app start)
   */
  async initialize(): Promise<void> {
    // Enable Crashlytics collection (can be disabled for testing)
    await setCrashlyticsCollectionEnabled(getCrashlytics(), true);
  }

  /**
   * Set user identifier for crash reports
   */
  async setUserId(userId: string): Promise<void> {
    await setCrashlyticsUserId(getCrashlytics(), userId);
  }

  /**
   * Set custom attributes for crash reports
   */
  async setAttributes(attributes: Record<string, string>): Promise<void> {
    await setCrashlyticsAttributes(getCrashlytics(), attributes);
  }

  /**
   * Log a non-fatal error
   * Use this for caught exceptions that don't crash the app
   */
  recordError(error: Error, context?: string): void {
    if (context) {
      crashlyticsLog(getCrashlytics(), `Context: ${context}`);
    }
    crashlyticsRecordError(getCrashlytics(), error);
  }

  /**
   * Log a message (for debugging in crash reports)
   */
  log(message: string): void {
    crashlyticsLog(getCrashlytics(), message);
  }

  /**
   * Log a JavaScript error from ErrorBoundary
   */
  recordJSError(error: Error, componentStack?: string): void {
    crashlyticsLog(getCrashlytics(), 'ErrorBoundary caught an error');
    if (componentStack) {
      crashlyticsLog(getCrashlytics(), `Component stack: ${componentStack}`);
    }
    crashlyticsRecordError(getCrashlytics(), error);
  }

  /**
   * Force a crash (for testing purposes only)
   */
  testCrash(): void {
    if (__DEV__) {
      crashlyticsCrash(getCrashlytics());
    }
  }

  /**
   * Clear user data on logout
   */
  async clearUser(): Promise<void> {
    await setCrashlyticsUserId(getCrashlytics(), '');
    await setCrashlyticsAttributes(getCrashlytics(), {});
  }
}

export default new CrashReporting();

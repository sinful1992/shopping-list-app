/**
 * Custom Error Types
 *
 * Structured error hierarchy for consistent error handling.
 * Each error type has: code, userMessage (safe to show), isRetryable.
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    userMessage: string = 'Something went wrong. Please try again.',
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.isRetryable = isRetryable;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Network-related errors (connectivity issues, timeouts)
 * These are typically retryable
 */
export class NetworkError extends AppError {
  constructor(
    message: string = 'Network request failed',
    code: string = 'NETWORK_ERROR',
    userMessage: string = 'Unable to connect. Please check your internet connection and try again.'
  ) {
    super(message, code, userMessage, true); // retryable
    this.name = 'NetworkError';
  }
}

/**
 * Authentication errors (login failures, expired tokens, unauthorized)
 * Not retryable - user needs to take action
 */
export class AuthError extends AppError {
  constructor(
    message: string = 'Authentication failed',
    code: string = 'AUTH_ERROR',
    userMessage: string = 'Authentication failed. Please sign in again.'
  ) {
    super(message, code, userMessage, false); // not retryable
    this.name = 'AuthError';
  }

  /**
   * Factory methods for common auth errors
   */
  static invalidCredentials(): AuthError {
    return new AuthError(
      'Invalid email or password',
      'INVALID_CREDENTIALS',
      'Invalid email or password. Please try again.'
    );
  }

  static emailInUse(): AuthError {
    return new AuthError(
      'Email already in use',
      'EMAIL_IN_USE',
      'This email is already registered. Please sign in or use a different email.'
    );
  }

  static weakPassword(): AuthError {
    return new AuthError(
      'Password is too weak',
      'WEAK_PASSWORD',
      'Password must be at least 6 characters long.'
    );
  }

  static userNotFound(): AuthError {
    return new AuthError(
      'User not found',
      'USER_NOT_FOUND',
      'No account found with this email. Please sign up.'
    );
  }

  static sessionExpired(): AuthError {
    return new AuthError(
      'Session expired',
      'SESSION_EXPIRED',
      'Your session has expired. Please sign in again.'
    );
  }
}

/**
 * Input validation errors
 * Not retryable - user needs to fix input
 */
export class ValidationError extends AppError {
  readonly field?: string;

  constructor(
    message: string,
    field?: string,
    userMessage?: string
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      userMessage || message,
      false // not retryable
    );
    this.name = 'ValidationError';
    this.field = field;
  }

  /**
   * Factory method for field-specific validation errors
   */
  static forField(field: string, message: string): ValidationError {
    return new ValidationError(message, field, message);
  }
}

/**
 * Data sync errors (Firebase sync failures, conflict resolution)
 * Retryable - sync can be attempted again
 */
export class SyncError extends AppError {
  readonly entityType?: string;
  readonly entityId?: string;

  constructor(
    message: string = 'Sync failed',
    entityType?: string,
    entityId?: string,
    code: string = 'SYNC_ERROR',
    userMessage: string = 'Failed to sync data. Changes will be saved locally and synced later.'
  ) {
    super(message, code, userMessage, true); // retryable
    this.name = 'SyncError';
    this.entityType = entityType;
    this.entityId = entityId;
  }

  static forEntity(entityType: string, entityId: string, message?: string): SyncError {
    return new SyncError(
      message || `Failed to sync ${entityType}`,
      entityType,
      entityId
    );
  }
}

/**
 * Local storage errors (WatermelonDB, AsyncStorage)
 * Retryable
 */
export class StorageError extends AppError {
  constructor(
    message: string = 'Storage operation failed',
    code: string = 'STORAGE_ERROR',
    userMessage: string = 'Failed to save data locally. Please try again.'
  ) {
    super(message, code, userMessage, true); // retryable
    this.name = 'StorageError';
  }
}

/**
 * Permission errors (access denied, insufficient rights)
 * Not retryable - user needs different permissions
 */
export class PermissionError extends AppError {
  constructor(
    message: string = 'Permission denied',
    code: string = 'PERMISSION_ERROR',
    userMessage: string = 'You don\'t have permission to perform this action.'
  ) {
    super(message, code, userMessage, false); // not retryable
    this.name = 'PermissionError';
  }

  static familyGroupRequired(): PermissionError {
    return new PermissionError(
      'Family group required',
      'NO_FAMILY_GROUP',
      'Please create or join a family group first.'
    );
  }

  static listLocked(lockedByName?: string): PermissionError {
    const by = lockedByName ? ` by ${lockedByName}` : '';
    return new PermissionError(
      'List is locked',
      'LIST_LOCKED',
      `This list is currently locked${by}. Please wait until they finish shopping.`
    );
  }
}

/**
 * Subscription/limit errors (free tier limits reached)
 * Not retryable - user needs to upgrade
 */
export class SubscriptionError extends AppError {
  readonly limitType?: string;
  readonly currentValue?: number;
  readonly limitValue?: number;

  constructor(
    message: string = 'Subscription limit reached',
    limitType?: string,
    currentValue?: number,
    limitValue?: number,
    userMessage: string = 'You\'ve reached your limit. Upgrade to create more.'
  ) {
    super(message, 'SUBSCRIPTION_LIMIT', userMessage, false); // not retryable
    this.name = 'SubscriptionError';
    this.limitType = limitType;
    this.currentValue = currentValue;
    this.limitValue = limitValue;
  }

  static listLimit(current: number, limit: number): SubscriptionError {
    return new SubscriptionError(
      `List limit reached: ${current}/${limit}`,
      'lists',
      current,
      limit,
      `You've reached your limit of ${limit} lists. Delete a list or upgrade to create more.`
    );
  }

  static urgentItemLimit(current: number, limit: number): SubscriptionError {
    return new SubscriptionError(
      `Urgent item limit reached: ${current}/${limit}`,
      'urgentItems',
      current,
      limit,
      `You've reached your limit of ${limit} urgent items. Wait for items to be resolved or upgrade.`
    );
  }
}

/**
 * Utility to check if an error is one of our custom types
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get user-safe message from any error
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    // Don't expose internal error messages to users
    return 'Something went wrong. Please try again.';
  }
  return 'An unexpected error occurred.';
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  // Default: assume network errors are retryable
  if (error instanceof Error && error.message.toLowerCase().includes('network')) {
    return true;
  }
  return false;
}

/**
 * Convert Firebase error codes to our error types
 */
export function fromFirebaseError(error: { code?: string; message?: string }): AppError {
  const code = error.code || '';
  const message = error.message || 'Firebase error';

  // Auth errors
  if (code.startsWith('auth/')) {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/wrong-password':
      case 'auth/user-disabled':
        return AuthError.invalidCredentials();
      case 'auth/email-already-in-use':
        return AuthError.emailInUse();
      case 'auth/weak-password':
        return AuthError.weakPassword();
      case 'auth/user-not-found':
        return AuthError.userNotFound();
      case 'auth/requires-recent-login':
        return AuthError.sessionExpired();
      default:
        return new AuthError(message, code);
    }
  }

  // Database errors
  if (code.startsWith('database/')) {
    if (code === 'database/permission-denied') {
      return new PermissionError(message, code);
    }
    return new SyncError(message, undefined, undefined, code);
  }

  // Storage errors
  if (code.startsWith('storage/')) {
    if (code === 'storage/unauthorized') {
      return new PermissionError(message, code);
    }
    return new StorageError(message, code);
  }

  // Network errors
  if (
    code.includes('unavailable') ||
    code.includes('network') ||
    message.toLowerCase().includes('network')
  ) {
    return new NetworkError(message, code);
  }

  // Default
  return new AppError(message, code);
}

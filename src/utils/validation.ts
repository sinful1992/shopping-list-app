/**
 * Validation Utilities
 *
 * Pure validation functions for form inputs.
 * Returns { valid: boolean, error?: string } for consistent error handling.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || !email.trim()) {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim();

  // Basic email pattern validation
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address is too long' };
  }

  return { valid: true };
}

/**
 * Validate password
 * Firebase Auth requires minimum 6 characters
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password is too long' };
  }

  return { valid: true };
}

/**
 * Validate password confirmation matches
 */
export function validatePasswordMatch(password: string, confirmPassword: string): ValidationResult {
  if (!confirmPassword) {
    return { valid: false, error: 'Please confirm your password' };
  }

  if (password !== confirmPassword) {
    return { valid: false, error: 'Passwords do not match' };
  }

  return { valid: true };
}

/**
 * Validate shopping list name
 */
export function validateListName(name: string): ValidationResult {
  if (!name || !name.trim()) {
    return { valid: false, error: 'List name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length > 100) {
    return { valid: false, error: 'List name must be 100 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate item name
 */
export function validateItemName(name: string): ValidationResult {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Item name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length > 200) {
    return { valid: false, error: 'Item name must be 200 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate price input
 */
export function validatePrice(price: string): ValidationResult {
  if (!price || !price.trim()) {
    // Price is optional, empty is valid
    return { valid: true };
  }

  const trimmed = price.trim();
  const numValue = parseFloat(trimmed);

  if (isNaN(numValue)) {
    return { valid: false, error: 'Please enter a valid price' };
  }

  if (numValue < 0) {
    return { valid: false, error: 'Price cannot be negative' };
  }

  if (numValue > 999999.99) {
    return { valid: false, error: 'Price is too large' };
  }

  return { valid: true };
}

/**
 * Validate invitation code format
 */
export function validateInvitationCode(code: string): ValidationResult {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Invitation code is required' };
  }

  const trimmed = code.trim().toUpperCase();

  // Invitation codes are alphanumeric, typically 6-8 characters
  if (trimmed.length < 4 || trimmed.length > 20) {
    return { valid: false, error: 'Invalid invitation code format' };
  }

  const alphanumericPattern = /^[A-Z0-9]+$/;
  if (!alphanumericPattern.test(trimmed)) {
    return { valid: false, error: 'Invitation code can only contain letters and numbers' };
  }

  return { valid: true };
}

/**
 * Validate budget amount
 */
export function validateBudgetAmount(amount: string): ValidationResult {
  if (!amount || !amount.trim()) {
    // Budget is optional, empty is valid
    return { valid: true };
  }

  const trimmed = amount.trim();
  const numValue = parseFloat(trimmed);

  if (isNaN(numValue)) {
    return { valid: false, error: 'Please enter a valid amount' };
  }

  if (numValue < 0) {
    return { valid: false, error: 'Budget cannot be negative' };
  }

  if (numValue > 999999.99) {
    return { valid: false, error: 'Budget amount is too large' };
  }

  return { valid: true };
}

/**
 * Validate family group name
 */
export function validateGroupName(name: string): ValidationResult {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Group name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Group name must be at least 2 characters' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Group name must be 50 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate display name
 */
export function validateDisplayName(name: string): ValidationResult {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 1) {
    return { valid: false, error: 'Name is required' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Name must be 50 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate urgent item name
 */
export function validateUrgentItemName(name: string): ValidationResult {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Item name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length > 100) {
    return { valid: false, error: 'Item name must be 100 characters or less' };
  }

  return { valid: true };
}

/**
 * Validate quantity input
 */
export function validateQuantity(quantity: string): ValidationResult {
  if (!quantity || !quantity.trim()) {
    // Quantity is optional
    return { valid: true };
  }

  const trimmed = quantity.trim();

  if (trimmed.length > 20) {
    return { valid: false, error: 'Quantity text is too long' };
  }

  return { valid: true };
}

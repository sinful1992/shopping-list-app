/**
 * Input sanitization utilities
 *
 * Centralizes text sanitization to prevent:
 * - XSS via special characters (though React Native doesn't render HTML)
 * - Overly long strings that could cause performance issues
 * - Leading/trailing whitespace
 *
 * Usage: Call these functions in service methods before writing to database
 */

/**
 * Sanitize generic text input
 * - Trims whitespace
 * - Limits length
 * - Strips potentially dangerous characters
 */
export function sanitizeText(input: string, maxLength: number = 200): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>{}]/g, ''); // Strip angle brackets and braces
}

/**
 * Sanitize shopping list name
 * Max 100 characters
 */
export function sanitizeListName(name: string): string {
  return sanitizeText(name, 100);
}

/**
 * Sanitize shopping list item name
 * Max 200 characters
 */
export function sanitizeItemName(name: string): string {
  return sanitizeText(name, 200);
}

/**
 * Sanitize urgent item name
 * Max 200 characters
 */
export function sanitizeUrgentItemName(name: string): string {
  return sanitizeText(name, 200);
}

/**
 * Sanitize store name
 * Max 100 characters
 */
export function sanitizeStoreName(name: string): string {
  return sanitizeText(name, 100);
}

/**
 * Sanitize and validate price input
 * Returns null if invalid, otherwise returns the price rounded to 2 decimal places
 */
export function sanitizePrice(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }

  const num = typeof input === 'number' ? input : parseFloat(String(input));

  if (isNaN(num) || num < 0 || num > 99999) {
    return null;
  }

  // Round to 2 decimal places
  return Math.round(num * 100) / 100;
}

/**
 * Sanitize quantity string
 * Max 50 characters
 */
export function sanitizeQuantity(quantity: string | null | undefined): string | null {
  if (!quantity || typeof quantity !== 'string') {
    return null;
  }

  const sanitized = sanitizeText(quantity, 50);
  return sanitized || null;
}

/**
 * Sanitize display name
 * Max 50 characters
 */
export function sanitizeDisplayName(name: string): string {
  return sanitizeText(name, 50);
}

/**
 * Sanitize family group name
 * Max 50 characters
 */
export function sanitizeGroupName(name: string): string {
  return sanitizeText(name, 50);
}

/**
 * Sanitize category name
 * Max 50 characters
 */
export function sanitizeCategory(category: string | null | undefined): string | null {
  if (!category || typeof category !== 'string') {
    return null;
  }

  const sanitized = sanitizeText(category, 50);
  return sanitized || null;
}

/**
 * Centralized Theme Constants
 * Liquid Glass Dark Theme with glassmorphism effects
 */

export const COLORS = {
  // Background colors
  background: {
    primary: '#0a0a0a',
    secondary: '#1c1c1e',
    tertiary: '#2c2c2e',
  },

  // Glass effect backgrounds (rgba with varying opacity)
  glass: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.08)',
    elevated: 'rgba(255, 255, 255, 0.12)',
    strong: 'rgba(255, 255, 255, 0.15)',
  },

  // Accent colors (iOS-inspired)
  accent: {
    blue: '#007AFF',
    blueLight: 'rgba(0, 122, 255, 0.8)',
    blueDim: 'rgba(0, 122, 255, 0.3)',
    blueSubtle: 'rgba(0, 122, 255, 0.15)',
    green: '#30D158',
    greenDim: 'rgba(48, 209, 88, 0.3)',
    yellow: '#FFD60A',
    yellowDim: 'rgba(255, 214, 10, 0.3)',
    red: '#FF453A',
    redDim: 'rgba(255, 69, 58, 0.3)',
    redSubtle: 'rgba(255, 59, 48, 0.15)',
    orange: '#FFB340',
    purple: '#AF52DE',
  },

  // Text colors
  text: {
    primary: '#ffffff',
    secondary: '#a0a0a0',
    tertiary: '#6E6E73',
    dim: '#8E8E93',
  },

  // Border colors
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    medium: 'rgba(255, 255, 255, 0.1)',
    strong: 'rgba(255, 255, 255, 0.12)',
  },

  // Overlay colors
  overlay: {
    dark: 'rgba(0, 0, 0, 0.5)',
    darker: 'rgba(0, 0, 0, 0.8)',
    darkest: 'rgba(0, 0, 0, 0.85)',
  },
} as const;

export const SHADOWS = {
  // Small shadow for subtle depth
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  // Medium shadow for interactive elements
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  // Large shadow for elevated cards
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Colored shadows for accents
  blue: {
    shadowColor: COLORS.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },

  green: {
    shadowColor: COLORS.accent.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },

  red: {
    shadowColor: COLORS.accent.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

export const RADIUS = {
  small: 8,
  medium: 12,
  large: 16,
  xlarge: 20,
  xxlarge: 24,
  pill: 25,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const TYPOGRAPHY = {
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    huge: 42,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

// Common style combinations for reusability
export const COMMON_STYLES = {
  // Standard glassmorphic card
  glassCard: {
    backgroundColor: COLORS.glass.medium,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    ...SHADOWS.large,
  },

  // Elevated glassmorphic card
  glassCardElevated: {
    backgroundColor: COLORS.glass.elevated,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    ...SHADOWS.large,
  },

  // Active/selected state for buttons
  buttonActive: {
    backgroundColor: COLORS.accent.blueLight,
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    borderRadius: RADIUS.medium,
    ...SHADOWS.blue,
  },

  // Standard button
  button: {
    backgroundColor: COLORS.glass.medium,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    borderRadius: RADIUS.medium,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },

  // Input field
  input: {
    backgroundColor: COLORS.glass.medium,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    borderRadius: RADIUS.medium,
    color: COLORS.text.primary,
    padding: SPACING.md,
  },

  // Modal container
  modal: {
    backgroundColor: COLORS.background.secondary,
    borderTopLeftRadius: RADIUS.xlarge,
    borderTopRightRadius: RADIUS.xlarge,
    ...SHADOWS.large,
  },

  // Section header
  sectionHeader: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.lg,
  },

  // Card with colored accent
  accentCard: (color: string, dimColor: string) => ({
    backgroundColor: color,
    borderWidth: 1,
    borderColor: dimColor,
    borderRadius: RADIUS.medium,
    ...SHADOWS.medium,
  }),
} as const;

// Budget alert color states
export const BUDGET_ALERT_COLORS = {
  safe: COLORS.accent.green, // <50%
  warning: COLORS.accent.yellow, // 50-75%
  caution: COLORS.accent.orange, // 75-90%
  danger: COLORS.accent.red, // >90%
} as const;

// Animation durations (milliseconds)
export const ANIMATION = {
  fast: 200,
  normal: 300,
  slow: 500,
} as const;

export default {
  COLORS,
  SHADOWS,
  RADIUS,
  SPACING,
  TYPOGRAPHY,
  COMMON_STYLES,
  BUDGET_ALERT_COLORS,
  ANIMATION,
};

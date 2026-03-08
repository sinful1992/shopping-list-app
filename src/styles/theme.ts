/**
 * Centralized Theme Constants
 * Liquid Glass Dark Theme with glassmorphism effects — v2
 */

export const COLORS = {
  // Background colors
  background: {
    primary: '#12121C',
    secondary: '#1E1E2E',
    tertiary: '#181825',
  },

  // Glass effect backgrounds (rgba with varying opacity)
  glass: {
    subtle: 'rgba(255, 255, 255, 0.03)',
    medium: 'rgba(255, 255, 255, 0.05)',
    elevated: 'rgba(255, 255, 255, 0.08)',
    strong: 'rgba(255, 255, 255, 0.12)',
  },

  // Accent colors
  accent: {
    blue: '#6EA8FE',
    blueLight: 'rgba(110, 168, 254, 0.8)',
    blueDim: 'rgba(110, 168, 254, 0.3)',
    blueSubtle: 'rgba(110, 168, 254, 0.15)',
    green: '#30D158',
    greenDim: 'rgba(48, 209, 88, 0.3)',
    yellow: '#FFD60A',
    yellowDim: 'rgba(255, 214, 10, 0.3)',
    red: '#FF453A',
    redDim: 'rgba(255, 69, 58, 0.3)',
    redSubtle: 'rgba(255, 59, 48, 0.15)',
    orange: '#FFB340',
    purple: '#A78BFA',
  },

  // Text colors
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.45)',
    tertiary: 'rgba(255, 255, 255, 0.3)',
    dim: 'rgba(255, 255, 255, 0.2)',
  },

  // Border colors
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.08)',
    strong: 'rgba(255, 255, 255, 0.10)',
  },

  // Overlay colors
  overlay: {
    dark: 'rgba(0, 0, 0, 0.6)',
    darker: 'rgba(0, 0, 0, 0.75)',
    darkest: 'rgba(0, 0, 0, 0.85)',
  },

  // Gradient definitions
  gradient: {
    buttonStart: '#6EA8FE',
    buttonEnd: '#A78BFA',
    modalStart: '#1E1E2E',
    modalEnd: '#181825',
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
  large: 14,
  xlarge: 16,
  xxlarge: 20,
  modal: 24,
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
    backgroundColor: COLORS.glass.subtle,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Elevated glassmorphic card
  glassCardElevated: {
    backgroundColor: COLORS.glass.elevated,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Active/selected state for buttons
  buttonActive: {
    backgroundColor: COLORS.accent.blueLight,
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    borderRadius: RADIUS.large,
    shadowColor: COLORS.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },

  // Standard button
  button: {
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },

  // Input field
  input: {
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1.5,
    borderColor: COLORS.border.medium,
    borderRadius: RADIUS.large,
    color: COLORS.text.primary,
    padding: 14,
  },

  // Modal container
  modal: {
    backgroundColor: COLORS.background.secondary,
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  // Modal handle bar container
  modalHandleContainer: {
    alignItems: 'center' as const,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // Modal handle bar
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  // Section header
  sectionHeader: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.lg,
  },

  // Uppercase label
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    color: COLORS.text.tertiary,
    marginBottom: SPACING.sm,
  },

  // Card with colored accent
  accentCard: (color: string, dimColor: string) => ({
    backgroundColor: color,
    borderWidth: 1,
    borderColor: dimColor,
    borderRadius: RADIUS.large,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  }),
};

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

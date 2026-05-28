/**
 * Centralized Theme Constants
 * Liquid Glass Dark Theme with glassmorphism effects — v2
 */

const COLORS = {
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

// Animation durations (milliseconds)
export const ANIMATION = {
  fast: 200,
  normal: 300,
  slow: 500,
} as const;

export type Theme = {
  [K in keyof typeof COLORS]: { [P in keyof (typeof COLORS)[K]]: string }
};

export const DARK_THEME: Theme = COLORS;

export const LIGHT_THEME: Theme = {
  background: {
    primary: '#F0F2F5',
    secondary: '#FFFFFF',
    tertiary: '#F8F9FA',
  },

  glass: {
    subtle: 'rgba(0, 0, 0, 0.04)',
    medium: 'rgba(0, 0, 0, 0.06)',
    elevated: 'rgba(0, 0, 0, 0.08)',
    strong: 'rgba(0, 0, 0, 0.12)',
  },

  accent: {
    blue: '#2563EB',
    blueLight: 'rgba(37, 99, 235, 0.8)',
    blueDim: 'rgba(37, 99, 235, 0.3)',
    blueSubtle: 'rgba(37, 99, 235, 0.12)',
    green: '#16A34A',
    greenDim: 'rgba(22, 163, 74, 0.3)',
    yellow: '#CA8A04',
    yellowDim: 'rgba(202, 138, 4, 0.3)',
    red: '#DC2626',
    redDim: 'rgba(220, 38, 38, 0.3)',
    redSubtle: 'rgba(220, 38, 38, 0.12)',
    orange: '#EA580C',
    purple: '#7C3AED',
  },

  text: {
    primary: '#111827',
    secondary: 'rgba(17, 24, 39, 0.55)',
    tertiary: 'rgba(17, 24, 39, 0.4)',
    dim: 'rgba(17, 24, 39, 0.25)',
  },

  border: {
    subtle: 'rgba(0, 0, 0, 0.06)',
    medium: 'rgba(0, 0, 0, 0.10)',
    strong: 'rgba(0, 0, 0, 0.14)',
  },

  overlay: {
    dark: 'rgba(0, 0, 0, 0.45)',
    darker: 'rgba(0, 0, 0, 0.60)',
    darkest: 'rgba(0, 0, 0, 0.75)',
  },

  gradient: {
    buttonStart: '#2563EB',
    buttonEnd: '#7C3AED',
    modalStart: '#FFFFFF',
    modalEnd: '#F8F9FA',
  },
};

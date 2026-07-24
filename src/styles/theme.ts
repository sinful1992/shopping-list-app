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
    greenSubtle: 'rgba(48, 209, 88, 0.1)',
    yellow: '#FFD60A',
    yellowDim: 'rgba(255, 214, 10, 0.3)',
    yellowSubtle: 'rgba(255, 214, 10, 0.1)',
    // Lighter than iOS systemRed: at #FF453A the red only cleared 4.81:1 on a
    // card bare, so anything drawn on its own tint fell under the bar.
    red: '#FF7A70',
    redDim: 'rgba(255, 122, 112, 0.3)',
    redSubtle: 'rgba(255, 122, 112, 0.15)',
    orange: '#FFB340',
    orangeDim: 'rgba(255, 179, 64, 0.2)',
    orangeSubtle: 'rgba(255, 179, 64, 0.12)',
    purple: '#A78BFA',
    purpleDim: 'rgba(167, 139, 250, 0.3)',
    purpleSubtle: 'rgba(167, 139, 250, 0.15)',
  },

  // Sync status indicators
  sync: {
    synced: '#30D158',
    pending: '#FFD60A',
    failed: '#FF7A70',
  },

  // Leaderboard ranks. The metal semantics don't map onto the accent palette,
  // so they get their own pair of triads. Used as text on background.secondary.
  medal: {
    gold: '#FFD60A',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  },

  // Text colors. secondary/tertiary must stay readable at small sizes on
  // background.primary (WCAG-ish); dim is for disabled/placeholder only.
  // onAccent is for text sitting ON a filled accent surface — it is dark here
  // because the dark theme's accents are light colours.
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.65)',
    tertiary: 'rgba(255, 255, 255, 0.55)',
    dim: 'rgba(255, 255, 255, 0.25)',
    onAccent: '#111827',
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

// Tabular (fixed-width) numerals for money and quantities — keeps digit
// columns aligned in lists and stops totals jiggling as values change.
export const NUMERIC = {
  fontVariant: ['tabular-nums' as const],
};

// Shopping-mode status bar. Deliberately theme-independent: the bar is a mode
// indicator that has to read identically in-store in either theme, and pinning
// the surface as well as the ink is what makes its contrast provable. Every
// surface here is a saturated light colour, so the ink is dark in both themes.
// Worst measured pair is `ink` on `budgetOver` at 5.21:1. These deliberately do
// not track accent.* — budgetOver stayed at iOS systemRed after the dark accent
// red was lightened, because here the ink is dark and the surface must not be.
export const STATUS_BAR = {
  shopping: '#30D158',
  locked: '#FFB340',
  completed: '#8E8E93',
  shoppingBorder: 'rgba(48, 209, 88, 0.35)',
  lockedBorder: 'rgba(255, 179, 64, 0.35)',
  completedBorder: 'rgba(142, 142, 147, 0.35)',
  budgetWarning: '#FFD60A',
  budgetOver: '#FF453A',
  // White scrims lighten the bar, so they only improve the dark ink's ratio.
  scrim: 'rgba(255, 255, 255, 0.3)',
  ink: '#111827',
  inkMuted: 'rgba(17, 24, 39, 0.75)',
  inkWarning: '#4D3300',
  inkOver: '#6B1616',
} as const;

// Extends an icon button's touch target without changing its layout. Icon-only
// controls in this app sit at 26-32dp of padded box; Android's minimum is 48dp
// and Apple's is 44pt, and 8dp on each side closes that gap.
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

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

  // Accents here are a step darker than the -600 shades they started as. The
  // dark theme's accents are light colours on a dark ground; mirroring that in
  // light mode needs genuinely dark ink, or accent-coloured text collapses on a
  // white card (prices measured 3.30:1 at -600). The *Dim tints are halved to
  // match: a darker foreground on an equally dark tint gains nothing.
  accent: {
    blue: '#1D4ED8',
    blueLight: 'rgba(29, 78, 216, 0.8)',
    blueDim: 'rgba(29, 78, 216, 0.15)',
    blueSubtle: 'rgba(29, 78, 216, 0.10)',
    green: '#166534',
    greenDim: 'rgba(22, 101, 52, 0.15)',
    greenSubtle: 'rgba(22, 101, 52, 0.08)',
    yellow: '#854D0E',
    yellowDim: 'rgba(133, 77, 14, 0.15)',
    yellowSubtle: 'rgba(133, 77, 14, 0.10)',
    red: '#B91C1C',
    redDim: 'rgba(185, 28, 28, 0.15)',
    redSubtle: 'rgba(185, 28, 28, 0.12)',
    orange: '#9A3412',
    orangeDim: 'rgba(154, 52, 18, 0.12)',
    orangeSubtle: 'rgba(154, 52, 18, 0.10)',
    purple: '#6D28D9',
    purpleDim: 'rgba(109, 40, 217, 0.15)',
    purpleSubtle: 'rgba(109, 40, 217, 0.10)',
  },

  sync: {
    synced: '#166534',
    pending: '#854D0E',
    failed: '#B91C1C',
  },

  medal: {
    gold: '#856404',
    silver: '#5F6368',
    bronze: '#8B5A2B',
  },

  text: {
    primary: '#111827',
    secondary: 'rgba(17, 24, 39, 0.70)',
    tertiary: 'rgba(17, 24, 39, 0.62)',
    dim: 'rgba(17, 24, 39, 0.30)',
    onAccent: '#FFFFFF',
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
    buttonStart: '#1D4ED8',
    buttonEnd: '#6D28D9',
    modalStart: '#FFFFFF',
    modalEnd: '#F8F9FA',
  },
};

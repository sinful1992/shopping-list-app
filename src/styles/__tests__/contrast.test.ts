/**
 * Contrast regression tests for the theme tokens.
 *
 * Every colour pair asserted here is one that shipped as an unreadable
 * combination at least once. The point is not to prove the whole UI is
 * accessible — it's to stop these specific pairs regressing when someone
 * retunes an accent, because none of them are visible in a dark-only
 * emulator pass.
 *
 * WCAG 2.1: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold).
 */

import { DARK_THEME, LIGHT_THEME, STATUS_BAR, Theme } from '../theme';

const AA_BODY = 4.5;
const AA_LARGE = 3;

type Rgb = [number, number, number];

function parseColor(color: string): [number, number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      alpha,
    ];
  }
  const match = c.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Unparseable colour: ${color}`);
  const parts = match[1].split(',').map(p => parseFloat(p.trim()));
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

/** Flattens a stack of (possibly translucent) layers, outermost first. */
function composite(layers: string[]): Rgb {
  let [r, g, b] = parseColor(layers[0]);
  for (const layer of layers.slice(1)) {
    const [lr, lg, lb, la] = parseColor(layer);
    r = lr * la + r * (1 - la);
    g = lg * la + g * (1 - la);
    b = lb * la + b * (1 - la);
  }
  return [r, g, b];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast of `fg` (alpha allowed) over the composited `background` stack. */
export function contrast(fg: string, background: string | string[]): number {
  const stack = Array.isArray(background) ? background : [background];
  const bg = composite(stack);
  const resolvedFg = composite([`rgb(${bg[0]},${bg[1]},${bg[2]})`, fg]);
  const l1 = luminance(resolvedFg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** 12% tint of an accent, the pattern the analytics stat cards use. */
const tint12 = (hex: string) => `${hex}1F`;

const THEMES: Array<[string, Theme]> = [
  ['dark', DARK_THEME],
  ['light', LIGHT_THEME],
];

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('composites alpha against the parent stack', () => {
    // 50% white over black is mid-grey, not white.
    expect(contrast('rgba(255,255,255,0.5)', '#000000')).toBeLessThan(11);
  });
});

describe('status bar is readable in both themes', () => {
  // The bar pins its own surfaces, so these hold regardless of theme — that is
  // the whole reason it stopped using theme.text.primary.
  const surfaces = {
    shopping: STATUS_BAR.shopping,
    locked: STATUS_BAR.locked,
    completed: STATUS_BAR.completed,
    budgetWarning: STATUS_BAR.budgetWarning,
    budgetOver: STATUS_BAR.budgetOver,
  };

  it.each(Object.entries(surfaces))('ink on %s', (_name, surface) => {
    expect(contrast(STATUS_BAR.ink, surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('ink on the Done button scrim', () => {
    expect(
      contrast(STATUS_BAR.ink, [STATUS_BAR.shopping, STATUS_BAR.scrim]),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each([
    ['inkMuted', STATUS_BAR.inkMuted],
    ['inkWarning', STATUS_BAR.inkWarning],
    ['inkOver', STATUS_BAR.inkOver],
  ])('%s on the shopping bar (the only bar that expands)', (_name, ink) => {
    expect(contrast(ink, STATUS_BAR.shopping)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe.each(THEMES)('%s theme', (_name, theme) => {
  const card = theme.background.secondary;
  const page = theme.background.primary;

  it('body text is readable on cards and on the page', () => {
    for (const role of ['primary', 'secondary', 'tertiary'] as const) {
      expect(contrast(theme.text[role], card)).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrast(theme.text[role], page)).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrast(theme.text[role], theme.background.tertiary)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('onAccent is readable on every filled accent surface', () => {
    // yellow included: the price-trend badge fills itself with it.
    for (const key of ['blue', 'green', 'red', 'orange', 'purple', 'yellow'] as const) {
      expect(contrast(theme.text.onAccent, theme.accent[key])).toBeGreaterThanOrEqual(AA_BODY);
    }
    // The gradient the FAB and the complete/done buttons use.
    expect(contrast(theme.text.onAccent, theme.gradient.buttonStart)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrast(theme.text.onAccent, theme.gradient.buttonEnd)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accent-coloured text is readable on a card (prices, badges)', () => {
    for (const key of ['blue', 'green', 'red', 'orange', 'purple', 'yellow'] as const) {
      expect(contrast(theme.accent[key], card)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('medal ranks are readable on a card', () => {
    for (const key of ['gold', 'silver', 'bronze'] as const) {
      expect(contrast(theme.medal[key], card)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('accent text stays readable on its own Subtle tint, card or page', () => {
    const pairs = [
      ['blue', 'blueSubtle'],
      ['green', 'greenSubtle'],
      ['red', 'redSubtle'],
      ['orange', 'orangeSubtle'],
      ['purple', 'purpleSubtle'],
      ['yellow', 'yellowSubtle'],
    ] as const;
    for (const [fg, tint] of pairs) {
      expect(contrast(theme.accent[fg], [card, theme.accent[tint]])).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrast(theme.accent[fg], [page, theme.accent[tint]])).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('tinted badges stay readable on their own tint', () => {
    // Shopping badge: orange on orangeSubtle, on a list card.
    expect(
      contrast(theme.accent.orange, [card, theme.accent.orangeSubtle]),
    ).toBeGreaterThanOrEqual(AA_BODY);
    // Completed badge: green on greenSubtle, on a card that is itself
    // greenSubtle — three green layers, which is what made this the worst case.
    expect(
      contrast(theme.accent.green, [card, theme.accent.greenSubtle, theme.accent.greenSubtle]),
    ).toBeGreaterThanOrEqual(AA_BODY);
    // Store warning banner: yellow on yellowDim, directly on the page.
    expect(
      contrast(theme.accent.yellow, [page, theme.accent.yellowDim]),
    ).toBeGreaterThanOrEqual(AA_BODY);
    // Sync status banner: body copy and the Retry link on blueSubtle, on the
    // page. blueDim was the first pick and missed AA in dark by 0.14.
    expect(
      contrast(theme.text.primary, [page, theme.accent.blueSubtle]),
    ).toBeGreaterThanOrEqual(AA_BODY);
    expect(
      contrast(theme.accent.blue, [page, theme.accent.blueSubtle]),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('stat-card icons clear large-text contrast on their own 12% tint', () => {
    for (const key of ['blue', 'green', 'purple', 'yellow'] as const) {
      const accent = theme.accent[key];
      expect(
        contrast(accent, [page, tint12(accent)]),
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

/**
 * PocketVerse design tokens.
 *
 * Single source of truth for every visual constant in the app. Games and hub
 * screens must never hard-code a hex value — they pull from here (or from a
 * module's `accent` pair) so that a future theme swap is one file.
 */

export const palette = {
  // Base surfaces — near-black with a violet bias so neon accents read warm.
  void: '#08080F',
  abyss: '#0C0C17',
  surface: '#12121F',
  surfaceAlt: '#181829',
  elevated: '#1E1E33',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineStrong: 'rgba(255,255,255,0.14)',

  // Text
  text: '#F4F4FF',
  textMuted: '#A0A0BF',
  textFaint: '#63637F',

  // Brand + semantic accents
  violet: '#7C5CFF',
  violetDim: '#5B3FE0',
  cyan: '#22D3EE',
  mint: '#34E2A8',
  lime: '#A3E635',
  amber: '#FFB443',
  gold: '#FFD166',
  coral: '#FF6B6B',
  rose: '#FF4D8D',
  magenta: '#C05CFF',
  sky: '#4EA8FF',

  // Currency + resource colours (used identically in every game)
  coin: '#FFC53D',
  gem: '#57E0FF',
  xp: '#A78BFA',
  energy: '#4ADE80',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export type Gradient = readonly [string, string, ...string[]];

export const gradients = {
  hub: ['#12061F', '#08080F', '#050510'] as Gradient,
  violet: ['#8B5CFF', '#5B3FE0'] as Gradient,
  cyan: ['#22D3EE', '#3B82F6'] as Gradient,
  mint: ['#34E2A8', '#0EA5A0'] as Gradient,
  sunset: ['#FF8A3D', '#FF4D8D'] as Gradient,
  gold: ['#FFD166', '#FF9F1C'] as Gradient,
  toxic: ['#A3E635', '#22C55E'] as Gradient,
  blood: ['#FF4D4D', '#8B1E3F'] as Gradient,
  deep: ['#4EA8FF', '#1D3FA8'] as Gradient,
  candy: ['#C05CFF', '#FF6BD6'] as Gradient,
  slate: ['#2A2A44', '#171728'] as Gradient,
  glass: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)'] as Gradient,
} as const;

export type GradientName = keyof typeof gradients;

/** 4pt base scale. Every margin/padding in the app is one of these. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
  huge: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  /** Weight-forward type ramp; sizes are scaled by `useResponsive` at runtime. */
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
  subheading: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14.5, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 },
  micro: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  numeric: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
} as const;

export const shadow = {
  none: {},
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  hard: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  /** Coloured bloom used behind accent buttons and rarity tiles. */
  glow: (color: string, opacity = 0.55) => ({
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  }),
} as const;

/** Animation durations & spring configs — shared so motion feels like one app. */
export const motion = {
  instant: 90,
  fast: 160,
  normal: 240,
  slow: 380,
  lazy: 620,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 130, mass: 1 },
  springPop: { damping: 12, stiffness: 320, mass: 0.7 },
} as const;

export const rarityColor = {
  common: '#8A8AA8',
  rare: '#4EA8FF',
  epic: '#C05CFF',
  legendary: '#FFC53D',
  mythic: '#FF4D8D',
} as const;

export type Rarity = keyof typeof rarityColor;

export const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

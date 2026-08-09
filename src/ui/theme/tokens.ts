/**
 * Donut Tycoon design tokens.
 *
 * Single source of truth for every visual constant in the app. The palette is a
 * warm café theme — dark espresso surfaces, cream text, caramel + glaze accents.
 * Key names are stable so components never hard-code a hex value.
 */

export const palette = {
  // Base surfaces — espresso blacks with a warm bias so caramel accents glow.
  void: '#160F0B',
  abyss: '#1E140D',
  surface: '#281A10',
  surfaceAlt: '#332114',
  elevated: '#3E2A1A',
  hairline: 'rgba(255,236,214,0.08)',
  hairlineStrong: 'rgba(255,236,214,0.16)',

  // Text
  text: '#FFF6EC',
  textMuted: '#D9BFA6',
  textFaint: '#96795C',

  // Brand + semantic accents
  violet: '#E8934A',
  violetDim: '#C26F2B',
  cyan: '#6FD3C0',
  mint: '#7FD8A0',
  lime: '#B8D47E',
  amber: '#FFB85C',
  gold: '#FFD98A',
  coral: '#FF8A6B',
  rose: '#FF8FB3',
  magenta: '#D98BD8',
  sky: '#8AB8E8',

  // Currency + resource colours
  coin: '#FFC94D',
  gem: '#6FD3C0',
  xp: '#C7A0F0',
  energy: '#7FDB8A',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export type Gradient = readonly [string, string, ...string[]];

export const gradients = {
  hub: ['#2A160D', '#160F0B', '#0F0906'] as Gradient,
  violet: ['#F0A45C', '#C26F2B'] as Gradient,
  cyan: ['#6FD3C0', '#3B8F82'] as Gradient,
  mint: ['#7FD8A0', '#3FA373'] as Gradient,
  sunset: ['#FFB85C', '#F2789F'] as Gradient,
  gold: ['#FFD98A', '#E8934A'] as Gradient,
  toxic: ['#B8D47E', '#7FBF5A'] as Gradient,
  blood: ['#FF7A6B', '#A13A2A'] as Gradient,
  deep: ['#8AB8E8', '#3B5F8F'] as Gradient,
  candy: ['#E08BD0', '#F2789F'] as Gradient,
  slate: ['#4A3A2C', '#2A1E14'] as Gradient,
  glass: ['rgba(255,236,214,0.10)', 'rgba(255,236,214,0.02)'] as Gradient,
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

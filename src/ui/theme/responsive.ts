import { Dimensions, PixelRatio, Platform } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

/**
 * Responsive scaling.
 *
 * Reference device is a 390x844 logical viewport (iPhone 14 / typical 6.1").
 * `s()` scales spatially, `f()` scales type with a damped curve so that text on
 * tablets does not become comically large.
 */
const BASE_W = 390;
const BASE_H = 844;

/**
 * Widest the playfield is ever allowed to get.
 *
 * Every size in the app derives from window width against a 390pt reference, so
 * on a 1920px desktop `s(18)` would resolve to 88px and the whole UI would be
 * comically large. On web the app is therefore laid out as a centred column of
 * at most this width — the same shape it has on a phone — and `useResponsive`
 * reports the *column* rather than the window, so a game's arena maths lands
 * inside the frame it is actually drawn in.
 *
 * Native is untouched: a phone is narrower than this, so the clamp never binds.
 */
export const MAX_FRAME_WIDTH = 520;

const win = Dimensions.get('window');

export function scaleWidth(size: number, width = win.width) {
  return (width / BASE_W) * size;
}

export function scaleHeight(size: number, height = win.height) {
  return (height / BASE_H) * size;
}

/** Damped font scale: 0.5 factor keeps large screens readable, not bloated. */
export function scaleFont(size: number, width = win.width) {
  const scaled = size + (scaleWidth(size, width) - size) * 0.5;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

export const responsive = { scaleWidth, scaleHeight, scaleFont };

export type ResponsiveInfo = {
  width: number;
  height: number;
  /** Spatial scale (paddings, sizes). */
  s: (n: number) => number;
  /** Vertical scale. */
  v: (n: number) => number;
  /** Font scale. */
  f: (n: number) => number;
  isSmall: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  /** Usable square play-area edge for arcade surfaces. */
  shortEdge: number;
};

export function useResponsive(): ResponsiveInfo {
  const win = useWindowDimensions();
  // Match the centred column `_layout.tsx` renders the app into on web.
  const width = Platform.OS === 'web' ? Math.min(win.width, MAX_FRAME_WIDTH) : win.width;
  const height = win.height;
  return useMemo(() => {
    const isLandscape = width > height;
    const shortEdge = Math.min(width, height);
    return {
      width,
      height,
      s: (n: number) => scaleWidth(n, width),
      v: (n: number) => scaleHeight(n, height),
      f: (n: number) => scaleFont(n, width),
      isSmall: shortEdge < 360 || height < 700,
      isTablet: shortEdge >= 600,
      isLandscape,
      shortEdge,
    };
  }, [width, height]);
}

export const IS_ANDROID = Platform.OS === 'android';
export const IS_IOS = Platform.OS === 'ios';
export const IS_WEB = Platform.OS === 'web';

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
  const { width, height } = useWindowDimensions();
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

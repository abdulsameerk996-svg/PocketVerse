import React, { memo, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { createRng } from '../utils/rng';
import { palette } from '../theme/tokens';

type Star = { x: number; y: number; size: number; delay: number; dur: number; opacity: number };

const COUNT = 26;

function Dot({ star, width, height }: { star: Star; width: number; height: number }) {
  const t = useSharedValue(0);

  React.useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: star.dur, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [star.dur, t]);

  const style = useAnimatedStyle(() => ({
    opacity: star.opacity * (0.35 + t.value * 0.65),
    transform: [{ translateY: -t.value * 18 }, { scale: 0.8 + t.value * 0.4 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: star.x * width,
          top: star.y * height,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: palette.white,
        },
        style,
      ]}
    />
  );
}

/** Ambient background life — 26 shared-value dots, all on the UI thread. */
export const Starfield = memo(function Starfield({ seed = 7 }: { seed?: number }) {
  const { width, height } = useWindowDimensions();

  const stars = useMemo<Star[]>(() => {
    const rng = createRng(seed);
    return Array.from({ length: COUNT }, () => ({
      x: rng(),
      y: rng() * 0.85,
      size: 1 + rng() * 2.4,
      delay: rng() * 2000,
      dur: 2600 + rng() * 3800,
      opacity: 0.12 + rng() * 0.4,
    }));
  }, [seed]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Dot key={i} star={s} width={width} height={height} />
      ))}
    </View>
  );
});

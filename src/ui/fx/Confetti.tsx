import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { createRng } from '@/core/utils/rng';
import { useSettingsStore } from '@/core/state/settingsStore';

const COLORS = ['#FFD166', '#7C5CFF', '#22D3EE', '#34E2A8', '#FF4D8D', '#FFFFFF'];

function Ribbon({
  x,
  delay,
  duration,
  color,
  w,
  h,
  drift,
  spin,
  height,
  trigger,
}: {
  x: number;
  delay: number;
  duration: number;
  color: string;
  w: number;
  h: number;
  drift: number;
  spin: number;
  height: number;
  trigger: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.linear }));
  }, [trigger, delay, duration, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0.85 ? (1 - t.value) / 0.15 : 1,
    transform: [
      { translateY: -60 + t.value * (height + 120) },
      { translateX: Math.sin(t.value * Math.PI * 3) * drift },
      { rotateZ: `${spin * t.value}deg` },
      { scaleY: 0.6 + Math.abs(Math.cos(t.value * Math.PI * 4)) * 0.8 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: x, width: w, height: h, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** Full-screen celebration confetti — level-ups, achievements, day-7 rewards. */
export const Confetti = memo(function Confetti({
  trigger,
  count = 42,
}: {
  trigger: number;
  count?: number;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  const ribbons = useMemo(() => {
    const rng = createRng(trigger * 7919 + 13);
    return Array.from({ length: count }, () => ({
      x: rng() * width,
      delay: rng() * 700,
      duration: 1700 + rng() * 1600,
      color: COLORS[Math.floor(rng() * COLORS.length)],
      w: 4 + rng() * 6,
      h: 8 + rng() * 12,
      drift: 20 + rng() * 60,
      spin: (rng() - 0.5) * 1200,
    }));
  }, [trigger, count, width]);

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ribbons.map((r, i) => (
        <Ribbon key={i} {...r} height={height} trigger={trigger} />
      ))}
    </View>
  );
});

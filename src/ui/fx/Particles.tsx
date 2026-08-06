import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { createRng } from '@/core/utils/rng';
import { useSettingsStore } from '@/core/state/settingsStore';

type BurstProps = {
  /** Change this value to re-fire the burst. */
  trigger: number | string;
  colors?: string[];
  count?: number;
  radius?: number;
  size?: number;
  duration?: number;
  /** Emoji/glyph particles instead of dots. */
  glyphs?: string[];
};

function Particle({
  angle,
  distance,
  color,
  size,
  delay,
  duration,
  spin,
  trigger,
}: {
  angle: number;
  distance: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  spin: number;
  trigger: number | string;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
  }, [trigger, delay, duration, t]);

  const style = useAnimatedStyle(() => {
    const d = distance * t.value;
    return {
      opacity: t.value < 0.15 ? t.value / 0.15 : 1 - (t.value - 0.15) / 0.85,
      transform: [
        { translateX: Math.cos(angle) * d },
        // slight gravity arc — particles rise then fall
        { translateY: Math.sin(angle) * d + t.value * t.value * distance * 0.5 },
        { scale: 1 - t.value * 0.5 },
        { rotate: `${spin * t.value}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Radial particle burst.
 *
 * Used for coin pickups, level-ups, perfect hits and harvests. Purely
 * declarative: mount it centred on a point and bump `trigger`.
 */
export const Burst = memo(function Burst({
  trigger,
  colors = ['#FFD166', '#FF9F1C', '#FFFFFF'],
  count = 14,
  radius = 62,
  size = 6,
  duration = 620,
}: BurstProps) {
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);
  const seed = typeof trigger === 'number' ? trigger : trigger.length;

  const particles = useMemo(() => {
    const rng = createRng(seed * 9301 + 49297);
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + rng() * 0.5,
      distance: radius * (0.55 + rng() * 0.65),
      color: colors[Math.floor(rng() * colors.length)],
      size: size * (0.6 + rng() * 0.8),
      delay: rng() * 60,
      duration: duration * (0.8 + rng() * 0.5),
      spin: (rng() - 0.5) * 540,
    }));
  }, [seed, count, radius, size, duration, colors]);

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={styles.center}>
      {particles.map((p, i) => (
        <Particle key={i} {...p} trigger={trigger} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

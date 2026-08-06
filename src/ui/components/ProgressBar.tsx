import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { gradients, motion, palette, radius, type Gradient } from '../theme/tokens';
import { clamp } from '@/core/utils/format';
import { useSettingsStore } from '@/core/state/settingsStore';

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  height?: number;
  gradient?: Gradient;
  track?: string;
  style?: StyleProp<ViewStyle>;
  /** Renders a soft leading-edge glow — good for XP / boss health. */
  glow?: boolean;
  rounded?: boolean;
  /** Segmented look (energy pips). */
  segments?: number;
};

export const ProgressBar = memo(function ProgressBar({
  value,
  height = 10,
  gradient = gradients.violet,
  track = 'rgba(255,255,255,0.08)',
  style,
  glow = true,
  rounded = true,
  segments,
}: ProgressBarProps) {
  const pct = clamp(value, 0, 1);
  const progress = useSharedValue(pct);
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  useEffect(() => {
    progress.value = reduced ? pct : withSpring(pct, motion.springSoft);
  }, [pct, progress, reduced]);

  const fill = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));

  if (segments && segments > 0) {
    return <SegmentedBar value={pct} segments={segments} height={height} gradient={gradient} style={style} />;
  }

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: rounded ? height / 2 : radius.xs, backgroundColor: track },
        style,
      ]}
    >
      <Animated.View style={[styles.fill, fill]}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: rounded ? height / 2 : radius.xs },
            glow ? { shadowColor: gradient[1], shadowOpacity: 0.9, shadowRadius: 8 } : null,
          ]}
        />
      </Animated.View>
    </View>
  );
});

const SegmentedBar = memo(function SegmentedBar({
  value,
  segments,
  height,
  gradient,
  style,
}: {
  value: number;
  segments: number;
  height: number;
  gradient: Gradient;
  style?: StyleProp<ViewStyle>;
}) {
  const filled = Math.round(value * segments);
  return (
    <View style={[styles.segRow, { height }, style]}>
      {Array.from({ length: segments }, (_, i) => (
        <Segment key={i} on={i < filled} height={height} color={gradient[0]} index={i} />
      ))}
    </View>
  );
});

const Segment = memo(function Segment({
  on,
  height,
  color,
  index,
}: {
  on: boolean;
  height: number;
  color: string;
  index: number;
}) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(on ? 1 : 0, { duration: motion.fast });
  }, [on, t]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: t.value > 0.5 ? color : 'rgba(255,255,255,0.10)',
    opacity: 0.4 + t.value * 0.6,
    transform: [{ scaleY: 0.85 + t.value * 0.15 }],
  }));
  return (
    <Animated.View
      style={[{ flex: 1, height, borderRadius: height / 2, marginLeft: index === 0 ? 0 : 3 }, style]}
    />
  );
});

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: palette.hairline },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  segRow: { flexDirection: 'row', width: '100%', alignItems: 'center' },
});

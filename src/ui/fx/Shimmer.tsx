import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSettingsStore } from '@/core/state/settingsStore';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Diagonal sheen that sweeps across a surface. Used on legendary items, the
 * daily-reward card and primary CTAs to signal "this is worth touching".
 */
export const Shimmer = memo(function Shimmer({
  width,
  style,
  duration = 2400,
  delay = 0,
  color = 'rgba(255,255,255,0.20)',
}: {
  width: number;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  delay?: number;
  color?: string;
}) {
  const t = useSharedValue(0);
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [duration, reduced, t]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + t.value * width * 2.2 }, { rotateZ: '18deg' }],
  }));

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      <AnimatedGradient
        colors={['transparent', color, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[{ width: width * 0.55, height: '260%', top: '-80%' }, anim]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

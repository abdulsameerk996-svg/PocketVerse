import React, { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../theme/tokens';
import { haptics } from '../hooks/useHaptics';
import { play, type SoundCue } from '../hooks/useSound';
import { useSettingsStore } from '@/core/state/settingsStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** How far it compresses. 0.96 default reads as "solid", 0.9 as "squishy". */
  scaleTo?: number;
  haptic?: keyof typeof haptics | false;
  sound?: SoundCue | false;
  dimOnPress?: boolean;
  children?: React.ReactNode;
};

/**
 * The app's universal press target.
 *
 * Every tappable surface in PocketVerse routes through this so press feel,
 * haptics and audio cues are identical everywhere — one of the cheapest ways to
 * make a large app feel like a single product. Animations run on the UI thread.
 */
export const PressableScale = memo(function PressableScale({
  style,
  scaleTo = 0.96,
  haptic = 'tap',
  sound = 'ui.tap',
  dimOnPress = true,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: dimOnPress ? 1 - pressed.value * 0.12 : 1,
  }));

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      pressed.value = reduced ? 1 : withSpring(1, motion.springPop);
      onPressIn?.(e);
    },
    [onPressIn, pressed, reduced],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      pressed.value = reduced ? 0 : withSpring(0, motion.spring);
      onPressOut?.(e);
    },
    [onPressOut, pressed, reduced],
  );

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (e) => {
      if (haptic) haptics[haptic]?.();
      if (sound) play(sound);
      onPress?.(e);
    },
    [haptic, sound, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      {children}
    </AnimatedPressable>
  );
});

/** Fade-and-rise entrance used for list items and grid tiles. */
export function useEntrance(index = 0, enabled = true) {
  const progress = useSharedValue(enabled ? 0 : 1);
  const reduced = useSettingsStore((s) => s.settings.reducedMotion);

  React.useEffect(() => {
    if (!enabled) return;
    if (reduced) {
      progress.value = 1;
      return;
    }
    // Stagger by index so grids cascade instead of popping in as a block.
    progress.value = withDelay(
      Math.min(index, 12) * 45,
      withTiming(1, { duration: motion.slow }),
    );
  }, [enabled, index, progress, reduced]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
}

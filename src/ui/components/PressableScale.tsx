import React, { memo, useCallback } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '../theme/tokens';
import { haptics } from '../hooks/useHaptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** How far it compresses. 0.96 default reads as "solid", 0.9 as "squishy". */
  scaleTo?: number;
  haptic?: keyof typeof haptics | false;
  dimOnPress?: boolean;
  children?: React.ReactNode;
};

/**
 * The app's universal press target.
 *
 * Every tappable surface routes through this so press feel and haptics are
 * identical everywhere. Animations run on the UI thread via Reanimated.
 */
export const PressableScale = memo(function PressableScale({
  style,
  scaleTo = 0.96,
  haptic = 'tap',
  dimOnPress = true,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    opacity: dimOnPress ? 1 - pressed.value * 0.12 : 1,
  }));

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      pressed.value = withSpring(1, motion.springPop);
      onPressIn?.(e);
    },
    [onPressIn, pressed],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      pressed.value = withSpring(0, motion.spring);
      onPressOut?.(e);
    },
    [onPressOut, pressed],
  );

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (e) => {
      if (haptic) haptics[haptic]?.();
      onPress?.(e);
    },
    [haptic, onPress],
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

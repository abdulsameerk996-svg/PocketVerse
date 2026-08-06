import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, radius, shadow, spacing, type Gradient } from '../theme/tokens';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Optional accent gradient border/background. */
  gradient?: Gradient;
  /** Glass = translucent white overlay on top of the screen gradient. */
  variant?: 'solid' | 'glass' | 'outline' | 'gradient';
  padding?: number;
  radiusSize?: number;
  glow?: string;
  /** Thin coloured top edge — used to tag a card with a game's accent. */
  accent?: string;
};

/**
 * The single surface primitive.
 *
 * Four variants cover every panel in the app. Nothing else should build its own
 * bordered box — consistency of corner radius, hairline colour and shadow is
 * most of what separates "polished" from "assembled".
 */
export const Card = memo(function Card({
  children,
  style,
  gradient,
  variant = 'solid',
  padding = spacing.lg,
  radiusSize = radius.lg,
  glow,
  accent,
}: CardProps) {
  const base: ViewStyle = {
    borderRadius: radiusSize,
    padding,
    overflow: 'hidden',
  };

  const skin: ViewStyle =
    variant === 'glass'
      ? { backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: palette.hairline }
      : variant === 'outline'
        ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.hairlineStrong }
        : variant === 'gradient'
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline };

  return (
    <View
      style={[base, skin, glow ? shadow.glow(glow, 0.35) : shadow.soft, style]}
    >
      {variant === 'gradient' && gradient ? (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {accent ? (
        <View style={[styles.accent, { backgroundColor: accent }]} pointerEvents="none" />
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  accent: { position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, opacity: 0.9 },
});

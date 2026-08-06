import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, palette, radius, shadow, spacing, type Gradient } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { Shimmer } from '../fx/Shimmer';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  gradient?: Gradient;
  icon?: ReactNode | string;
  trailing?: ReactNode | string;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  /** Adds a sweeping sheen — reserve for the single most important CTA. */
  shine?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: 'tap' | 'press' | 'success' | false;
};

const SIZES = {
  sm: { h: 38, px: spacing.md, font: 13, radius: radius.sm },
  md: { h: 50, px: spacing.lg, font: 15, radius: radius.md },
  lg: { h: 60, px: spacing.xl, font: 17, radius: radius.lg },
} as const;

export const Button = memo(function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  gradient,
  icon,
  trailing,
  disabled,
  loading,
  full,
  shine,
  style,
  haptic = 'press',
}: ButtonProps) {
  const S = SIZES[size];
  const grad: Gradient | undefined =
    variant === 'primary'
      ? (gradient ?? gradients.violet)
      : variant === 'danger'
        ? gradients.blood
        : variant === 'success'
          ? gradients.mint
          : undefined;

  const bg =
    variant === 'secondary'
      ? 'rgba(255,255,255,0.08)'
      : variant === 'ghost'
        ? 'transparent'
        : undefined;

  return (
    <PressableScale
      onPress={disabled || loading ? undefined : onPress}
      haptic={disabled ? false : haptic}
      scaleTo={0.955}
      style={[
        styles.base,
        {
          height: S.h,
          paddingHorizontal: S.px,
          borderRadius: S.radius,
          backgroundColor: bg,
          borderWidth: variant === 'ghost' || variant === 'secondary' ? 1 : 0,
          borderColor: palette.hairlineStrong,
          opacity: disabled ? 0.45 : 1,
          alignSelf: full ? 'stretch' : 'auto',
        },
        grad && !disabled ? shadow.glow(grad[0], 0.4) : null,
        style,
      ]}
    >
      {grad ? (
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {shine && !disabled ? <Shimmer width={220} /> : null}

      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={palette.white} size="small" />
        ) : (
          <>
            {typeof icon === 'string' ? (
              <Text size={S.font + 3} style={styles.icon}>
                {icon}
              </Text>
            ) : (
              icon
            )}
            <Text
              variant="subheading"
              size={S.font}
              color={variant === 'ghost' ? palette.textMuted : palette.white}
              numberOfLines={1}
            >
              {label}
            </Text>
            {typeof trailing === 'string' ? (
              <Text size={S.font} style={styles.trailing} color="rgba(255,255,255,0.85)">
                {trailing}
              </Text>
            ) : (
              trailing
            )}
          </>
        )}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  icon: { marginRight: 0 },
  trailing: { marginLeft: spacing.xs },
});

import React, { memo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { font, palette } from '../theme/tokens';
import { useResponsive } from '../theme/responsive';

type Variant = keyof typeof font;

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: string;
  /** Shorthand alignment. */
  center?: boolean;
  /** Applies tabular numerals + tighter tracking for score readouts. */
  numeric?: boolean;
  muted?: boolean;
  faint?: boolean;
  weight?: TextStyle['fontWeight'];
  size?: number;
  opacity?: number;
};

/**
 * Typography primitive. Sizes are responsive by default, so the same component
 * reads correctly on a 5.4" phone and a tablet without per-screen overrides.
 */
export const Text = memo(function Text({
  variant = 'body',
  color,
  center,
  numeric,
  muted,
  faint,
  weight,
  size,
  opacity,
  style,
  ...rest
}: TextProps) {
  const { f } = useResponsive();
  const base = font[variant] as TextStyle;

  return (
    <RNText
      allowFontScaling={false}
      {...rest}
      style={[
        base,
        {
          fontSize: f(size ?? (base.fontSize as number)),
          color: color ?? (faint ? palette.textFaint : muted ? palette.textMuted : palette.text),
        },
        weight ? { fontWeight: weight } : null,
        center ? { textAlign: 'center' } : null,
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        opacity != null ? { opacity } : null,
        style,
      ]}
    />
  );
});

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { palette, radius, spacing } from '../theme/tokens';
import { Text } from './Text';
import { CountUp } from './CountUp';
import { PressableScale } from './PressableScale';

export type StatChipProps = {
  glyph: string;
  value: number;
  color?: string;
  suffix?: string;
  onPress?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Small "+" affordance implying "get more". */
  showPlus?: boolean;
};

/** Currency/resource pill used in every header, store row and results screen. */
export const StatChip = memo(function StatChip({
  glyph,
  value,
  color = palette.coin,
  suffix,
  onPress,
  compact,
  style,
  showPlus,
}: StatChipProps) {
  const Container: any = onPress ? PressableScale : View;

  return (
    <Container
      onPress={onPress}
      style={[styles.chip, { borderColor: `${color}44` }, style]}
      scaleTo={0.92}
    >
      <Text size={13}>{glyph}</Text>
      <CountUp
        value={value}
        variant="label"
        color={palette.text}
        format={compact ? 'compact' : 'comma'}
        suffix={suffix}
      />
      {showPlus ? (
        <View style={[styles.plus, { backgroundColor: color }]}>
          <Text size={10} weight="900" color={palette.void}>
            +
          </Text>
        </View>
      ) : null}
    </Container>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
  },
  plus: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
});

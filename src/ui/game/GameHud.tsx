import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, spacing } from '../theme/tokens';
import { Text } from '../components/Text';
import { PressableScale } from '../components/PressableScale';

/**
 * The in-game heads-up display.
 *
 * Every game gets the same HUD skeleton: left slot (score), centre slot
 * (contextual), right slot (pause). Consistency here is what makes ten very
 * different games feel like ten modes of one product.
 */
export const GameHud = memo(function GameHud({
  score,
  scoreLabel = 'SCORE',
  centre,
  right,
  onPause,
  accent = palette.violet,
}: {
  score?: number | string;
  scoreLabel?: string;
  centre?: ReactNode;
  right?: ReactNode;
  onPause?: () => void;
  accent?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.root, { top: insets.top + spacing.xs }]}>
      {score != null ? (
        <View style={styles.scoreBox}>
          <Text variant="micro" color={accent}>
            {scoreLabel}
          </Text>
          <Text variant="title" numeric>
            {score}
          </Text>
        </View>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.centre} pointerEvents="box-none">
        {centre}
      </View>

      <View style={styles.rightRow} pointerEvents="box-none">
        {right}
        {onPause ? (
          <PressableScale onPress={onPause} style={styles.pause} scaleTo={0.9} haptic="tap">
            <Text size={15}>⏸</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 40,
  },
  scoreBox: { minWidth: 76 },
  spacer: { width: 76 },
  centre: { flex: 1, alignItems: 'center' },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 76, justifyContent: 'flex-end' },
  pause: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,23,0.72)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});

/** Small labelled readout used inside HUD centre/right slots. */
export const HudStat = memo(function HudStat({
  glyph,
  value,
  color = palette.text,
}: {
  glyph: string;
  value: string | number;
  color?: string;
}) {
  return (
    <View style={hudStat.wrap}>
      <Text size={13}>{glyph}</Text>
      <Text variant="label" numeric color={color}>
        {value}
      </Text>
    </View>
  );
});

const hudStat = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,23,0.72)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});

import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion, palette, radius, spacing } from '../theme/tokens';
import { Text } from './Text';
import { PressableScale } from './PressableScale';

/** Settings row with a custom animated switch (RN's Switch can't be themed well). */
export const ToggleRow = memo(function ToggleRow({
  label,
  description,
  glyph,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  glyph?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={disabled ? undefined : () => onChange(!value)}
      scaleTo={0.985}
      haptic="select"
      style={[styles.row, disabled ? { opacity: 0.45 } : null]}
    >
      {glyph ? (
        <View style={styles.glyph}>
          <Text size={16}>{glyph}</Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="subheading">{label}</Text>
        {description ? (
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} />
    </PressableScale>
  );
});

const Switch = memo(function Switch({ value }: { value: boolean }) {
  const t = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    t.value = withSpring(value ? 1 : 0, motion.spring);
  }, [value, t]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: t.value > 0.5 ? palette.mint : 'rgba(255,255,255,0.12)',
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * 20 }],
    backgroundColor: t.value > 0.5 ? palette.void : palette.textMuted,
  }));

  return (
    <Animated.View style={[styles.track, track]}>
      <Animated.View style={[styles.knob, knob]} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  glyph: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  body: { flex: 1 },
  track: { width: 46, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10 },
});

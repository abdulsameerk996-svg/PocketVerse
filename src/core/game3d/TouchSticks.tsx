import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Text, palette, spacing } from '@/ui';
import { P1_COLOR, P2_COLOR } from './DuelHud';
import type { DuelAxes } from './useDuelInput';

/**
 * On-screen sticks for two players sharing one phone.
 *
 * The screen is split into two halves; each half is its own floating stick that
 * appears wherever that thumb lands, which is the only layout that works when
 * two people are holding the same device. Nothing is positioned absolutely in
 * advance because you cannot know where either thumb will go.
 *
 * The sticks write into the *same* axes ref the keyboard writes into, so a game
 * reads one input source and never learns which device produced it. Positions
 * live in shared values, so dragging costs no React renders.
 *
 * `split="vertical"` puts P1 at the bottom and P2 at the top instead — right for
 * games where the two players face each other across a table.
 */

export type TouchSticksProps = {
  axes: { current: DuelAxes };
  /** Hide when a keyboard is the primary input. */
  visible?: boolean;
  split?: 'horizontal' | 'vertical';
  /** 1 gives the whole screen to P1 — the single-player games use this. */
  players?: 1 | 2;
  /** Optional action buttons per player (smash, shoot, jump). */
  onActionP1?: () => void;
  onActionP2?: () => void;
  actionLabel?: string;
};

const MAX_PULL = 54;

export const TouchSticks = memo(function TouchSticks({
  axes,
  visible = true,
  split = 'horizontal',
  players = 2,
  onActionP1,
  onActionP2,
  actionLabel = 'GO',
}: TouchSticksProps) {
  if (!visible) return null;

  if (players === 1) {
    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Half
          axes={axes}
          player="p1"
          color={P1_COLOR}
          onAction={onActionP1}
          actionLabel={actionLabel}
          flipped={false}
          showLabel={false}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={split === 'horizontal' ? styles.rowSplit : styles.colSplit} pointerEvents="box-none">
        <Half
          axes={axes}
          player="p2"
          color={P2_COLOR}
          onAction={onActionP2}
          actionLabel={actionLabel}
          flipped={split === 'vertical'}
        />
        <Half
          axes={axes}
          player="p1"
          color={P1_COLOR}
          onAction={onActionP1}
          actionLabel={actionLabel}
          flipped={false}
        />
      </View>
    </View>
  );
});

const Half = memo(function Half({
  axes,
  player,
  color,
  onAction,
  actionLabel,
  flipped,
  showLabel = true,
}: {
  axes: { current: DuelAxes };
  player: 'p1' | 'p2';
  color: string;
  onAction?: () => void;
  actionLabel: string;
  flipped: boolean;
  showLabel?: boolean;
}) {
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const active = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // The axes ref and the game loop both live on the JS thread; a worklet
        // here would only add a hop.
        .runOnJS(true)
        .onStart((e) => {
          baseX.value = e.x;
          baseY.value = e.y;
          knobX.value = e.x;
          knobY.value = e.y;
          active.value = 1;
        })
        .onUpdate((e) => {
          const dx = e.x - baseX.value;
          const dy = e.y - baseY.value;
          const d = Math.hypot(dx, dy) || 1;
          const clamped = Math.min(d, MAX_PULL);
          knobX.value = baseX.value + (dx / d) * clamped;
          knobY.value = baseY.value + (dy / d) * clamped;

          const strength = Math.min(1, d / MAX_PULL);
          const sign = flipped ? -1 : 1;
          axes.current[player].x = (dx / d) * strength * sign;
          axes.current[player].z = (dy / d) * strength * sign;
        })
        .onFinalize(() => {
          active.value = 0;
          axes.current[player].x = 0;
          axes.current[player].z = 0;
        }),
    [active, axes, baseX, baseY, flipped, knobX, knobY, player],
  );

  const ring = useAnimatedStyle(() => ({
    opacity: active.value ? 0.45 : 0,
    transform: [{ translateX: baseX.value - 56 }, { translateY: baseY.value - 56 }],
  }));
  const knob = useAnimatedStyle(() => ({
    opacity: active.value ? 0.9 : 0,
    transform: [{ translateX: knobX.value - 24 }, { translateY: knobY.value - 24 }],
  }));

  return (
    <View style={styles.half} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, ring]} />
      <Animated.View pointerEvents="none" style={[styles.knob, { backgroundColor: color }, knob]} />

      {showLabel ? (
        <View pointerEvents="none" style={[styles.label, flipped && styles.labelFlipped]}>
          <Text variant="micro" color={color}>
            {player.toUpperCase()}
          </Text>
        </View>
      ) : null}

      {onAction ? (
        <View style={[styles.actionWrap, flipped && styles.actionWrapFlipped]}>
          <ActionButton color={color} label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
});

const ActionButton = memo(function ActionButton({
  color,
  label,
  onPress,
}: {
  color: string;
  label: string;
  onPress: () => void;
}) {
  const gesture = useMemo(
    () => Gesture.Tap().runOnJS(true).onStart(onPress),
    [onPress],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.action, { borderColor: color }]}>
        <Text variant="micro" color={color}>
          {label}
        </Text>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  rowSplit: { flex: 1, flexDirection: 'row-reverse' },
  colSplit: { flex: 1, flexDirection: 'column' },
  half: { flex: 1, overflow: 'hidden' },
  ring: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
  },
  knob: { position: 'absolute', width: 48, height: 48, borderRadius: 24, opacity: 0.9 },
  label: { position: 'absolute', left: spacing.md, bottom: spacing.md, opacity: 0.6 },
  labelFlipped: { bottom: undefined, top: spacing.md },
  actionWrap: { position: 'absolute', right: spacing.md, bottom: spacing.xxl },
  actionWrapFlipped: { bottom: undefined, top: spacing.xxl },
  action: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,23,0.6)',
  },
});

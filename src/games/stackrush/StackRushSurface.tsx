import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { comboMultiplier, quickReward } from '@/core/game/quick';
import { useKeyPress, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { dropBlock, layerPoints, nextSlideBounds, slideSpeed, type StackLayer } from './logic';
import type { StackRushSave } from './types';

/**
 * ============================================================================
 *  STACK RUSH
 * ============================================================================
 *
 * One-button stacking: the block sweeps, you tap, the cut lands. The whole
 * sweep loop runs as a Reanimated worklet (zero React renders per frame); a
 * tap freezes the block, animates the drop on the shared value, and commits
 * the layer as plain React state — drops happen ~1/s, so that is cheap.
 *
 * The game is pure timing, never luck: the sweep always starts aligned with
 * the previous layer (see `nextSlideBounds` in logic.ts), so a well-timed tap
 * is always a perfect stack.
 */

const LAYER_H = 30;

export function StackRushSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width, height, s: sc } = useResponsive();
  const playW = Math.min(width - spacing.lg * 2, 420);
  const playTop = sc(118);
  const playH = height * 0.46;
  // Playfield-relative drop line: the top of the stack lives here and the
  // tower descends as layers land.
  const dropLineY = LAYER_H * 2;

  const startAt = useRef(Date.now());

  const [layers, setLayers] = useState<StackLayer[]>([{ x: 0.28, w: 0.44 }]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(1);
  const [perfects, setPerfects] = useState(0);
  const [over, setOver] = useState(false);
  const [dropping, setDropping] = useState(false);

  const prev = layers[layers.length - 1];

  /* ------------------------------------------------ shared (worklet) state */
  const slide = useSharedValue(prev.x);
  const sweepMin = useSharedValue(nextSlideBounds(prev).min);
  const sweepMax = useSharedValue(nextSlideBounds(prev).max);
  const dir = useSharedValue(1);
  const speed = useSharedValue(slideSpeed(1, modifiers.speed));
  const blockW = useSharedValue(prev.w);
  const blockY = useSharedValue(dropLineY - LAYER_H);
  const droppingSV = useSharedValue(0);
  const alive = useSharedValue(1);
  const pop = useSharedValue(0);

  const finished = useRef(false);

  /* ------------------------------------------------------------ the sweep */
  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1 || droppingSV.value > 0) return;
      slide.value += dir.value * speed.value * dt;
      if (slide.value <= sweepMin.value) {
        slide.value = sweepMin.value;
        dir.value = 1;
      } else if (slide.value >= sweepMax.value) {
        slide.value = sweepMax.value;
        dir.value = -1;
      }
    },
    [alive, dir, droppingSV, slide, speed, sweepMax, sweepMin],
  );
  useGameLoop(loop, !paused && !over);

  /* ---------------------------------------------------------------- drop */
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    alive.value = 0;
    setOver(true);
    const elapsed = (Date.now() - startAt.current) / 1000;
    const finalScore = score;
    play('game.crash');
    haptics.fail();
    setTimeout(() => {
      onFinish({
        score: finalScore,
        outcome: 'lose',
        metrics: { stackrush_score: finalScore, stackrush_perfects: perfects },
        reward: quickReward(finalScore, elapsed),
        breakdown: [
          { label: 'Layers', value: `${level - 1}` },
          { label: 'Perfects', value: `${perfects}` },
          { label: 'Best streak', value: `${streak}` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, perfects: 0, bestStreak: 0 }) as StackRushSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, finalScore),
          perfects: save2.perfects + perfects,
          bestStreak: Math.max(save2.bestStreak, streak),
        };
      });
    }, 650);
  }, [alive, level, onFinish, perfects, score, setSave, streak]);

  const drop = useCallback(() => {
    if (over || dropping) return;
    const moving = slide.value;
    const current = layers[layers.length - 1];
    const tol = 0.055 * (1 + modifiers.luck * 0.8);
    const outcome = dropBlock(moving, current, tol);

    setDropping(true);
    droppingSV.value = 1;
    dir.value = 0;

    const land = (placed: boolean, layer?: StackLayer, perfect?: boolean) => {
      if (placed && layer) {
        const mult = comboMultiplier(streak + (perfect ? 1 : 0));
        const gained = Math.round(layerPoints(level) * mult);
        setLayers((ls) => [...ls, layer]);
        setScore((s) => s + gained);
        setLevel((l) => l + 1);
        if (perfect) {
          setStreak((st) => st + 1);
          setPerfects((p) => p + 1);
          pop.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 220 }));
          haptics.success();
          play('rhythm.perfect');
        } else {
          setStreak(0);
          haptics.collect();
          play('game.collect');
        }
        // The next block starts aligned with the one we just placed.
        slide.value = layer.x;
        const b = nextSlideBounds(layer);
        sweepMin.value = b.min;
        sweepMax.value = b.max;
        blockW.value = layer.w;
        speed.value = slideSpeed(level + 1, modifiers.speed);
      } else {
        setStreak(0);
        haptics.fail();
        play('game.crash');
        finish();
      }
      setDropping(false);
      droppingSV.value = 0;
    };

    // Freeze horizontally, cut, and animate the block down onto the stack.
    blockW.value = withTiming(outcome.kind === 'placed' ? outcome.layer.w : current.w * 0.4, {
      duration: 170,
    });
    blockY.value = withTiming(
      dropLineY,
      { duration: 170, easing: Easing.in(Easing.quad) },
      (done) => {
        if (!done) return;
        if (outcome.kind === 'placed') land(true, outcome.layer, outcome.perfect);
        else land(false);
      },
    );
  }, [blockW, blockY, dir, dropping, droppingSV, dropLineY, finish, layers, level, modifiers.luck, modifiers.speed, over, pop, slide, speed, streak, sweepMax, sweepMin]);

  /* ----------------------------------------------------------- input */
  useKeyPress(!paused && !over, { ' ': drop, ArrowUp: drop, w: drop });

  /* ------------------------------------------------------- rendering */
  const blockStyle = useAnimatedStyle(() => ({
    left: slide.value * playW,
    top: blockY.value,
    width: blockW.value * playW,
  }));

  const popStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 1 + pop.value * 0.25 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * Math.abs(Math.sin(slide.value * 30)),
  }));

  return (
    <View style={styles.root}>
      <GameHud
        onPause={requestPause}
        accent={palette.violet}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.violet}>
              STACK RUSH
            </Text>
            <Text variant="display" numeric>
              {score}
            </Text>
          </View>
        }
        right={
          streak >= 3 ? (
            <Text variant="label" color={palette.gold}>
              PERFECT ×{streak}
            </Text>
          ) : (
            <Text variant="label" muted>
              {level} layers
            </Text>
          )
        }
      />

      <View
        style={[
          styles.playfield,
          { width: playW, height: playH, top: playTop, borderRadius: radius.xl },
        ]}
      >
        <View style={styles.dropLine} pointerEvents="none" />

        {/* The settled stack — plain views, only re-rendered on a drop */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {layers.map((l, i) => {
            const fromTop = layers.length - 1 - i;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  top: dropLineY + fromTop * LAYER_H,
                  left: l.x * playW,
                  width: l.w * playW,
                  height: LAYER_H - 2,
                  borderRadius: radius.sm,
                  backgroundColor: i === layers.length - 1 ? palette.violet : `${palette.violet}88`,
                  borderWidth: 1,
                  borderColor: `${palette.violet}55`,
                }}
              />
            );
          })}
        </View>

        {/* The moving block */}
        <Animated.View style={[styles.block, blockStyle]} pointerEvents="none">
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, backgroundColor: '#C05CFF' }, glowStyle]} />
        </Animated.View>

        {/* Perfect pop ring on the landing line */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.popRing,
            { top: dropLineY - 34, left: -6, width: playW + 12, height: 42 },
            popStyle,
          ]}
        />
      </View>

      <Pressable
        onPress={drop}
        style={[styles.tapZone, { top: playTop + playH + spacing.lg }]}
      >
        <View style={styles.tapHint}>
          <Text variant="display" color={palette.violet}>
            TAP
          </Text>
          <Text variant="caption" muted>
            {HAS_KEYBOARD ? 'or press space' : 'anywhere on the tower'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0714', overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  playfield: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  dropLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 60,
    height: 1,
    backgroundColor: 'rgba(124,92,255,0.35)',
  },
  block: {
    position: 'absolute',
    height: LAYER_H - 2,
    borderRadius: radius.sm,
  },
  popRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: palette.gold,
    borderRadius: radius.md,
  },
  tapZone: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tapHint: { alignItems: 'center' },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { quickReward } from '@/core/game/quick';
import { useKeyAxis, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { DROP_POOL, PLAYER_R, PLAYER_Y, START_LIVES, makeRain, stepRain, type RainState } from './logic';
import type { DodgeRainSave } from './types';

/**
 * ============================================================================
 *  DODGE RAIN
 * ============================================================================
 *
 * The sky is falling. Drag to dodge; a drop touching the runner costs a heart,
 * and the storm thickens every second. The whole sim is a Reanimated worklet
 * over a fixed drop pool — zero React renders while playing.
 */

export function DodgeRainSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const state = useSharedValue<RainState>(makeRain());
  const px = useSharedValue(0.5);
  const steerX = useSharedValue(0.5);
  const flash = useSharedValue(0);
  const alive = useSharedValue(1);

  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ lives: START_LIVES, score: 0 });
  const finished = useRef(false);

  /* --------------------------------------------------- HUD sync (8 Hz) */
  useEffect(() => {
    const id = setInterval(() => {
      setHud({ lives: state.value.lives, score: state.value.score });
    }, 120);
    return () => clearInterval(id);
  }, [state]);

  /* ---------------------------------------------------------- finish */
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    alive.value = 0;
    setOver(true);
    const t = Math.round(state.value.time * 10) / 10;
    const sc = Math.round(state.value.score);
    const dodges = state.value.dodges;
    play('game.over');
    haptics.fail();
    setTimeout(() => {
      onFinish({
        score: sc,
        outcome: 'lose',
        metrics: { dodgerain_time: Math.round(t), dodgerain_dodges: dodges },
        reward: quickReward(sc, t),
        breakdown: [
          { label: 'Survived', value: `${t.toFixed(1)}s` },
          { label: 'Dodged', value: `${dodges}` },
          { label: 'Hits taken', value: `${START_LIVES - state.value.lives}` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, bestTime: 0 }) as DodgeRainSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, sc),
          bestTime: Math.max(save2.bestTime, Math.round(t)),
        };
      });
    }, 750);
  }, [alive, onFinish, setSave, state]);

  /* -------------------------------------------------- event callbacks */
  const onHit = useCallback(() => {
    play('game.crash');
    haptics.heavy();
    flash.value = 1;
  }, [flash]);

  /* ----------------------------------------------------------- the loop */
  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      const s = state.value;
      // player lerps toward the finger (or the keyboard axis)
      const target = steerX.value;
      const d = target - px.value;
      px.value += d * Math.min(1, dt * 9);
      px.value = px.value < PLAYER_R ? PLAYER_R : px.value > 1 - PLAYER_R ? 1 - PLAYER_R : px.value;

      const hits = stepRain(s, Math.random, dt, px.value);
      if (hits > 0) {
        flash.value = 1;
        if (s.over) {
          alive.value = 0;
          runOnJS(finish)();
        }
      }
      flash.value = Math.max(0, flash.value - dt * 3);
    },
    [alive, finish, flash, px, steerX, state],
  );
  useGameLoop(loop, !paused && !over);

  /* ----------------------------------------------------------- input */
  useKeyAxis(
    !paused && !over,
    useCallback(
      (x) => {
        steerX.value = 0.5 + x * 0.42;
      },
      [steerX],
    ),
  );

  const steer = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          'worklet';
          steerX.value = e.x / W;
        })
        .onUpdate((e) => {
          'worklet';
          steerX.value = e.x / W;
        }),
    [W, steerX],
  );

  /* ------------------------------------------------------- rendering */
  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: px.value * W - 18 }, { translateY: PLAYER_Y * H - 18 }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value * 0.22,
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={steer}>
        <View style={styles.arena}>
          {/* danger vignette on hit */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flashOverlay, flashStyle]} />

          {Array.from({ length: DROP_POOL }, (_, i) => (
            <DropSprite key={i} index={i} state={state} W={W} H={H} />
          ))}

          {/* ground line */}
          <View pointerEvents="none" style={[styles.groundLine, { top: PLAYER_Y * H }]} />

          <Animated.View pointerEvents="none" style={[styles.player, playerStyle]}>
            <View style={styles.playerCore} />
          </Animated.View>
        </View>
      </GestureDetector>

      <GameHud
        onPause={requestPause}
        accent={palette.sky}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.sky}>
              DODGE RAIN
            </Text>
            <Text variant="display" numeric>
              {hud.score}
            </Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={hud.lives > 1 ? palette.mint : palette.coral}>
              {'♥'.repeat(Math.max(0, hud.lives))}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, START_LIVES - hud.lives))}
              </Text>
            </Text>
            <Text variant="micro" muted>
              {Math.floor(state.value.time)}s · dodges {state.value.dodges}
            </Text>
          </View>
        }
      />

      <Text variant="caption" faint center style={styles.hint}>
        {HAS_KEYBOARD ? 'Drag or ←/→ to dodge' : 'Drag anywhere to dodge'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const DropSprite = React.memo(function DropSprite({
  index,
  state,
  W,
  H,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<RainState>>;
  W: number;
  H: number;
}) {
  const style = useAnimatedStyle(() => {
    const d = state.value.drops[index];
    if (!d || !d.active) return { opacity: 0 };
    return {
      opacity: 0.9,
      transform: [{ translateX: d.x * W - 8 }, { translateY: d.y * H - 12 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.drop, style]}>
      <View style={styles.dropCore} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0F1E', overflow: 'hidden' },
  arena: { flex: 1, overflow: 'hidden' },
  flashOverlay: { backgroundColor: palette.coral },
  groundLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(78,168,255,0.25)',
  },
  drop: {
    position: 'absolute',
    width: 16,
    height: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dropCore: {
    width: 14,
    height: 22,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 13,
    borderBottomRightRadius: 13,
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: '#9FE0FF',
  },
  player: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cyan,
    borderWidth: 2,
    borderColor: '#BDF4FF',
    shadowColor: palette.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },
  playerCore: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EAFDFF' },
  hudCentre: { alignItems: 'center' },
  hudRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  hint: { paddingBottom: spacing.md },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { quickReward } from '@/core/game/quick';
import { useKeyAxis, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { MAX_BEAMS, PLAYER_R, START_LIVES, makeLasers, stepLasers, type LaserState } from './logic';
import type { LaserSurviveSave } from './types';

/**
 * ============================================================================
 *  LASER SURVIVE
 * ============================================================================
 *
 * A ring of rotating beams around a centre emitter — dodge the gaps as they
 * sweep past. Drag to move; the beams escalate on a fixed schedule and the
 * whole sim runs as a Reanimated worklet.
 */

export function LaserSurviveSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const state = useSharedValue<LaserState>(makeLasers());
  const px = useSharedValue(0.5);
  const py = useSharedValue(0.5);
  const steerX = useSharedValue(0.5);
  const steerY = useSharedValue(0.5);
  const invuln = useSharedValue(0);
  const flash = useSharedValue(0);
  const alive = useSharedValue(1);

  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ hp: START_LIVES, score: 0 });
  const finished = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setHud({ hp: state.value.hp, score: state.value.score });
    }, 120);
    return () => clearInterval(id);
  }, [state]);

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
        metrics: { lasersurvive_time: Math.round(t), lasersurvive_dodges: dodges },
        reward: quickReward(sc, t),
        breakdown: [
          { label: 'Survived', value: `${t.toFixed(1)}s` },
          { label: 'Close calls', value: `${dodges}` },
          { label: 'Beams active', value: `${Math.min(MAX_BEAMS, 2 + Math.floor(state.value.time / 25))}` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, bestTime: 0 }) as LaserSurviveSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, sc),
          bestTime: Math.max(save2.bestTime, Math.round(t)),
        };
      });
    }, 750);
  }, [alive, onFinish, setSave, state]);

  const onHit = useCallback(() => {
    play('game.crash');
    haptics.heavy();
    flash.value = 1;
  }, [flash]);

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      const s = state.value;

      // steer toward the finger / keyboard axis, clamped to the arena
      const k = Math.min(1, dt * 7);
      const mx = 0.5 + (steerX.value - 0.5) * 0.9;
      const my = 0.5 + (steerY.value - 0.5) * 0.9;
      px.value += (mx - px.value) * k;
      py.value += (my - py.value) * k;
      px.value = px.value < PLAYER_R ? PLAYER_R : px.value > 1 - PLAYER_R ? 1 - PLAYER_R : px.value;
      py.value = py.value < PLAYER_R ? PLAYER_R : py.value > 1 - PLAYER_R ? 1 - PLAYER_R : py.value;

      invuln.value = Math.max(0, invuln.value - dt);

      const hits = stepLasers(s, dt, px.value, py.value, invuln.value);
      if (hits > 0) {
        invuln.value = 1;
        flash.value = 1;
        if (s.over) {
          alive.value = 0;
          runOnJS(finish)();
        }
      }
      flash.value = Math.max(0, flash.value - dt * 3);
    },
    [alive, finish, flash, invuln, px, py, steerX, steerY, state],
  );
  useGameLoop(loop, !paused && !over);

  useKeyAxis(
    !paused && !over,
    useCallback(
      (x, y) => {
        steerX.value = 0.5 + x * 0.42;
        steerY.value = 0.5 + y * 0.42;
      },
      [steerX, steerY],
    ),
  );

  const steer = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          'worklet';
          steerX.value = e.x / W;
          steerY.value = e.y / H;
        })
        .onUpdate((e) => {
          'worklet';
          steerX.value = e.x / W;
          steerY.value = e.y / H;
        }),
    [H, W, steerX, steerY],
  );

  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: px.value * W - 13 }, { translateY: py.value * H - 13 }],
    opacity: invuln.value > 0 ? 0.4 + Math.sin(invuln.value * 30) * 0.3 : 1,
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.2 }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={steer}>
        <View style={styles.arena}>
          <LinearGradient colors={['#0B1226', '#0A0814']} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flashOverlay, flashStyle]} />

          {/* central emitter */}
          <View pointerEvents="none" style={[styles.emitter, { left: W / 2 - 8, top: H / 2 - 8 }]} />

          {Array.from({ length: MAX_BEAMS }, (_, i) => (
            <BeamSprite key={i} index={i} state={state} W={W} H={H} />
          ))}

          <Animated.View pointerEvents="none" style={[styles.player, playerStyle]}>
            <View style={styles.playerCore} />
          </Animated.View>
        </View>
      </GestureDetector>

      <GameHud
        onPause={requestPause}
        accent={palette.coral}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.coral}>
              LASER SURVIVE
            </Text>
            <Text variant="display" numeric>
              {hud.score}
            </Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={hud.hp > 1 ? palette.mint : palette.coral}>
              {'♥'.repeat(Math.max(0, hud.hp))}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, START_LIVES - hud.hp))}
              </Text>
            </Text>
            <Text variant="micro" muted>
              {Math.floor(state.value.time)}s · {Math.min(MAX_BEAMS, 2 + Math.floor(state.value.time / 25))} beams
            </Text>
          </View>
        }
      />

      <Text variant="caption" faint center style={styles.hint}>
        {HAS_KEYBOARD ? 'WASD / arrows move' : 'Drag anywhere to move'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const BeamSprite = React.memo(function BeamSprite({
  index,
  state,
  W,
  H,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<LaserState>>;
  W: number;
  H: number;
}) {
  const diag = Math.hypot(W, H) * 1.1;
  const style = useAnimatedStyle(() => {
    const b = state.value.beams[index];
    if (!b || !b.active) return { opacity: 0 };
    return {
      opacity: 0.85,
      width: diag,
      transform: [{ rotate: `${b.angle}rad` }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.beam,
        { left: W / 2, top: H / 2, marginLeft: -diag / 2, marginTop: -2 },
        style,
      ]}
    >
      <View style={styles.beamCore} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080A18', overflow: 'hidden' },
  arena: { flex: 1, overflow: 'hidden' },
  flashOverlay: { backgroundColor: palette.coral },
  emitter: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.coral,
    shadowColor: palette.coral,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  beam: {
    position: 'absolute',
    height: 4,
    backgroundColor: palette.coral,
    borderWidth: 1,
    borderColor: '#FFB0B0',
  },
  beamCore: { flex: 1, opacity: 0.5 },
  player: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.mint,
    borderWidth: 2,
    borderColor: '#BDFFDD',
    shadowColor: palette.mint,
    shadowOpacity: 0.6,
    shadowRadius: 9,
    elevation: 6,
  },
  playerCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#EAFDFF' },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  hint: { paddingBottom: spacing.md },
});

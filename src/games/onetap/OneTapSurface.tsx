import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { quickReward } from '@/core/game/quick';
import { useKeyPress, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { PIPE_POOL, makeFlight, stepFlight, type FlightState } from './logic';
import type { OneTapSave } from './types';

/**
 * ============================================================================
 *  ONE-TAP FLIGHT
 * ============================================================================
 *
 * Tap (or hold) to flap. One button, one bird, a corridor of pipes that
 * tightens every second. The sim is a Reanimated worklet over a fixed pipe
 * pool — the React tree only sees the score, the pause button and the crash.
 */

export function OneTapSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const state = useSharedValue<FlightState>(makeFlight());
  const flapCmd = useSharedValue(0);
  const flapHeld = useSharedValue(0);
  const flapTimer = useSharedValue(0);
  const alive = useSharedValue(1);
  const wobble = useSharedValue(0);

  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ score: 0, time: 0 });
  const finished = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setHud({ score: state.value.score, time: state.value.time });
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
    const passes = state.value.passes;
    play('game.over');
    haptics.fail();
    setTimeout(() => {
      onFinish({
        score: sc,
        outcome: 'lose',
        metrics: { onetap_distance: Math.round(t * 12), onetap_passes: passes },
        reward: quickReward(sc, t),
        breakdown: [
          { label: 'Distance', value: `${Math.round(t * 12)}m` },
          { label: 'Pipes cleared', value: `${passes}` },
          { label: 'Flight time', value: `${t.toFixed(1)}s` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, bestPasses: 0 }) as OneTapSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, sc),
          bestPasses: Math.max(save2.bestPasses, passes),
        };
      });
    }, 800);
  }, [alive, onFinish, setSave, state]);

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      const s = state.value;

      // a fresh tap flaps; holding auto-flaps at a gentle 6/s
      let flap = flapCmd.value > 0;
      if (flapCmd.value > 0) flapCmd.value = 0;
      if (flapHeld.value > 0) {
        flapTimer.value -= dt;
        if (flapTimer.value <= 0) {
          flap = true;
          flapTimer.value = 1 / 6;
        }
      }
      const passed = stepFlight(s, Math.random, dt, flap);
      wobble.value = passed > 0 ? 1 : Math.max(0, wobble.value - dt * 4);
      if (s.over) {
        alive.value = 0;
        runOnJS(finish)();
      }
    },
    [alive, finish, flapCmd, flapHeld, flapTimer, state, wobble],
  );
  useGameLoop(loop, !paused && !over);

  const flap = useCallback(() => {
    flapCmd.value = 1;
  }, [flapCmd]);
  useKeyPress(!paused && !over, { ' ': flap, ArrowUp: flap, w: flap });

  const birdStyle = useAnimatedStyle(() => {
    const s = state.value;
    const tilt = s.vy * 55;
    const bob = Math.sin(wobble.value * 10) * 0.12 + 1;
    return {
      transform: [
        { translateX: 0.06 * W - 16 },
        { translateY: s.y * H - 16 },
        { rotate: `${tilt}deg` },
        { scaleX: bob },
      ],
    };
  });

  return (
    <View style={styles.root}>
      <View style={styles.arena}>
        {Array.from({ length: PIPE_POOL }, (_, i) => (
          <React.Fragment key={i}>
            <PipeTop index={i} state={state} W={W} H={H} />
            <PipeBottom index={i} state={state} W={W} H={H} />
          </React.Fragment>
        ))}

        <Animated.View pointerEvents="none" style={[styles.bird, birdStyle]}>
          <View style={styles.birdCore} />
          <View style={styles.beak} />
          <View style={styles.eye} />
        </Animated.View>
      </View>

      <GameHud
        onPause={requestPause}
        accent={palette.gold}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.gold}>
              ONE-TAP FLIGHT
            </Text>
            <Text variant="display" numeric>
              {hud.score}
            </Text>
          </View>
        }
        right={
          <Text variant="micro" muted>
            {Math.floor(state.value.time)}s · {state.value.passes} pipes
          </Text>
        }
      />

      <Pressable
        style={styles.tapZone}
        onPressIn={() => {
          flapCmd.value = 1;
          flapHeld.value = 1;
          play('game.jump', { volume: 0.35 });
        }}
        onPressOut={() => {
          flapHeld.value = 0;
        }}
      >
        <View pointerEvents="none" style={styles.tapHint}>
          <Text variant="display" color={palette.gold}>
            TAP
          </Text>
          <Text variant="caption" muted>
            {HAS_KEYBOARD ? 'or hold space' : 'hold to auto-flap'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const PipeTop = React.memo(function PipeTop({
  index,
  state,
  W,
  H,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<FlightState>>;
  W: number;
  H: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = state.value.pipes[index];
    if (!p || !p.active) return { opacity: 0, height: 0 };
    return {
      opacity: 1,
      left: p.x * W,
      width: 0.088 * W,
      height: Math.max(0, p.gapY * H - 6),
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.pipeBlock, style]} />;
});

const PipeBottom = React.memo(function PipeBottom({
  index,
  state,
  W,
  H,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<FlightState>>;
  W: number;
  H: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = state.value.pipes[index];
    if (!p || !p.active) return { opacity: 0, height: 0 };
    return {
      opacity: 1,
      left: p.x * W,
      width: 0.088 * W,
      top: (p.gapY + p.gapH) * H + 6,
      height: Math.max(0, (1 - p.gapY - p.gapH) * H - 6),
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.pipeBlock, style]} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1220', overflow: 'hidden' },
  arena: { flex: 1, overflow: 'hidden' },
  pipeBlock: {
    position: 'absolute',
    backgroundColor: palette.mint,
    borderWidth: 2,
    borderColor: '#BDFFDD',
    borderRadius: radius.sm,
  },
  bird: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.gold,
    borderWidth: 2,
    borderColor: '#FFE9A8',
    shadowColor: palette.gold,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  birdCore: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF3C9' },
  beak: {
    position: 'absolute',
    right: -4,
    top: 14,
    width: 8,
    height: 6,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: palette.coral,
  },
  eye: { position: 'absolute', top: 9, right: 8, width: 5, height: 5, borderRadius: 3, backgroundColor: '#1A1420' },
  hudCentre: { alignItems: 'center' },
  tapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: { alignItems: 'center' },
});

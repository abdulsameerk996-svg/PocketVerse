import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop } from '@/core/game/useGameLoop';
import { quickReward } from '@/core/game/quick';
import { useKeyAxis, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { ORB_POOL, START_LIVES, makeOrbit, stepOrbit, type OrbitState } from './logic';
import type { OrbitGuardSave } from './types';

/**
 * ============================================================================
 *  ORBIT GUARD
 * ============================================================================
 *
 * Orbs spiral in from the rim; swing the shield paddle to deflect them before
 * they reach the core. Drag around the centre to rotate the paddle; the whole
 * sim is a Reanimated worklet over a fixed orb pool.
 */

export function OrbitGuardSurface({
  onFinish,
  paused,
  requestPause,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const cx = W / 2;
  const cy = H * 0.46;
  const state = useSharedValue<OrbitState>(makeOrbit());
  const shieldA = useSharedValue(0);
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
    const blocks = state.value.blocks;
    play('game.over');
    haptics.fail();
    setTimeout(() => {
      onFinish({
        score: sc,
        outcome: 'lose',
        metrics: { orbitguard_time: Math.round(t), orbitguard_blocks: blocks },
        reward: quickReward(sc, t),
        breakdown: [
          { label: 'Survived', value: `${t.toFixed(1)}s` },
          { label: 'Orbs deflected', value: `${blocks}` },
          { label: 'Core hits', value: `${START_LIVES - state.value.hp}` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, bestBlocks: 0 }) as OrbitGuardSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, sc),
          bestBlocks: Math.max(save2.bestBlocks, blocks),
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
      const hits = stepOrbit(s, Math.random, dt, shieldA.value);
      if (hits > 0) {
        flash.value = 1;
        if (s.over) {
          alive.value = 0;
          runOnJS(finish)();
        }
      }
      flash.value = Math.max(0, flash.value - dt * 3);
    },
    [alive, finish, flash, shieldA, state],
  );
  useGameLoop(loop, !paused && !over);

  // keyboard: rotate the shield with A/D or arrow keys
  useKeyAxis(
    !paused && !over,
    useCallback(
      (x) => {
        shieldA.value += x * 0.09;
      },
      [shieldA],
    ),
  );

  const steer = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          'worklet';
          shieldA.value = Math.atan2(e.y - cy, e.x - cx);
        })
        .onUpdate((e) => {
          'worklet';
          shieldA.value = Math.atan2(e.y - cy, e.x - cx);
        }),
    [cx, cy, shieldA],
  );

  const padLen = Math.min(W, H) * 0.44;
  const padDist = Math.min(W, H) * 0.2;

  const shieldStyle = useAnimatedStyle(() => {
    const a = shieldA.value;
    return {
      transform: [
        { translateX: Math.cos(a) * padDist - padLen / 2 + cx },
        { translateY: Math.sin(a) * padDist - 6 + cy },
        { rotate: `${a}rad` },
      ],
    };
  });

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.2 }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={steer}>
        <View style={styles.arena}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flashOverlay, flashStyle]} />

          {/* orb path ring */}
          <View
            pointerEvents="none"
            style={[
              styles.rim,
              {
                left: cx - Math.min(W, H) * 0.46,
                top: cy - Math.min(W, H) * 0.46,
                width: Math.min(W, H) * 0.92,
                height: Math.min(W, H) * 0.92,
                borderRadius: Math.min(W, H) * 0.46,
              },
            ]}
          />

          {Array.from({ length: ORB_POOL }, (_, i) => (
            <OrbSprite key={i} index={i} state={state} W={W} cx={cx} cy={cy} />
          ))}

          {/* the core */}
          <View pointerEvents="none" style={[styles.core, { left: cx - 9, top: cy - 9 }]} />

          {/* the shield paddle */}
          <Animated.View pointerEvents="none" style={[styles.paddle, { width: padLen, height: 12 }, shieldStyle]}>
            <View style={styles.paddleCore} />
          </Animated.View>
        </View>
      </GestureDetector>

      <GameHud
        onPause={requestPause}
        accent={palette.violet}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.violet}>
              ORBIT GUARD
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
              {state.value.blocks} deflected
            </Text>
          </View>
        }
      />

      <Text variant="caption" faint center style={styles.hint}>
        {HAS_KEYBOARD ? 'Drag or A/D to swing the paddle' : 'Drag around the core to swing the paddle'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const OrbSprite = React.memo(function OrbSprite({
  index,
  state,
  W,
  cx,
  cy,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<OrbitState>>;
  W: number;
  cx: number;
  cy: number;
}) {
  const style = useAnimatedStyle(() => {
    const o = state.value.orbs[index];
    if (!o || !o.active) return { opacity: 0 };
    return {
      opacity: 0.9,
      transform: [
        { translateX: Math.cos(o.angle) * o.dist * W * 0.92 + cx - 8 },
        { translateY: Math.sin(o.angle) * o.dist * W * 0.92 + cy - 8 },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.orb, style]}>
      <View style={styles.orbCore} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1C', overflow: 'hidden' },
  arena: { flex: 1, overflow: 'hidden' },
  flashOverlay: { backgroundColor: palette.coral },
  rim: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(124,92,255,0.35)',
  },
  orb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.magenta,
    borderWidth: 1,
    borderColor: '#E4B8FF',
  },
  core: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.gold,
    shadowColor: palette.gold,
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 8,
  },
  paddle: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: '#C9B8FF',
  },
  paddleCore: { flex: 1, borderRadius: radius.pill, backgroundColor: palette.violet },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  hint: { paddingBottom: spacing.md },
});

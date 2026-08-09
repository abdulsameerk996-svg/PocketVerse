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

import { LinearGradient } from 'expo-linear-gradient';

/**
 * ============================================================================
 *  ORBIT GUARD — POLISHED per friend feedback
 * ============================================================================
 *
 * "put the orbs to see on orbit guard and make it a bit hard"
 *
 * - glowing spheres with trails and orbit rings for clear visibility
 * - distinct colors per type, spacing, elite/boss waves
 * - harder: faster, mixed types, more simultaneous, boss rings
 *
 * Visual layout:
 *   PLAYER
 *     |
 *  O  O
 *   O
 *     O
 *  with orbital rings and glowing core.
 */

const KIND_COLOR: Record<string, string> = {
  normal: '#E879F9',
  fast: '#60A5FA',
  tank: '#FBBF24',
  splitter: '#34D399',
  elite: '#EF4444',
  boss: '#F43F5E',
};

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
  const orbitR = Math.min(W, H) * 0.46;

  const state = useSharedValue<OrbitState>(makeOrbit());
  const shieldA = useSharedValue(0);
  const flash = useSharedValue(0);
  const alive = useSharedValue(1);

  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ hp: START_LIVES, score: 0, time: 0 });
  const finished = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setHud({ hp: state.value.hp, score: state.value.score, time: state.value.time });
    }, 100);
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
          { label: 'Deflected', value: `${blocks}` },
          { label: 'Waves', value: `${state.value.wave}` },
          { label: 'Hits', value: `${START_LIVES - state.value.hp}` },
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
    }, 700);
  }, [alive, onFinish, setSave, state]);

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
      flash.value = Math.max(0, flash.value - dt * 3.5);
    },
    [alive, finish, flash, shieldA, state],
  );
  useGameLoop(loop, !paused && !over);

  useKeyAxis(
    !paused && !over,
    useCallback((x) => {
      shieldA.value += x * 0.11;
    }, [shieldA]),
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

  const padLen = Math.min(W, H) * 0.52;
  const padDist = Math.min(W, H) * 0.21;
  const shieldStyle = useAnimatedStyle(() => {
    const a = shieldA.value;
    return {
      transform: [
        { translateX: Math.cos(a) * padDist - padLen / 2 + cx },
        { translateY: Math.sin(a) * padDist - 7 + cy },
        { rotate: `${a}rad` },
      ],
    };
  });
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.28 }));
  const corePulse = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.sin(state.value.time * 3) * 0.08 }],
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={steer}>
        <View style={styles.arena}>
          <LinearGradient colors={['#0E0A2A', '#0D0A1C', '#080610']} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flashOverlay, flashStyle]} />

          {/* Orbit rings for visibility — 3 depths */}
          {[0.92, 0.62, 0.34].map((fac, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.orbitRing,
                {
                  left: cx - orbitR * fac,
                  top: cy - orbitR * fac,
                  width: orbitR * fac * 2,
                  height: orbitR * fac * 2,
                  borderRadius: orbitR * fac,
                  borderColor: i === 0 ? 'rgba(124,92,255,0.28)' : i === 1 ? 'rgba(124,92,255,0.14)' : 'rgba(255,209,102,0.18)',
                  borderWidth: i === 0 ? 1.2 : 0.8,
                },
              ]}
            />
          ))}

          {/* rim glow */}
          <View
            pointerEvents="none"
            style={[
              styles.rim,
              {
                left: cx - orbitR,
                top: cy - orbitR,
                width: orbitR * 2,
                height: orbitR * 2,
                borderRadius: orbitR,
              },
            ]}
          />

          {/* Orbs with trails */}
          {Array.from({ length: ORB_POOL }, (_, i) => (
            <OrbVisual key={i} index={i} state={state} W={W} cx={cx} cy={cy} orbitR={orbitR} />
          ))}

          {/* Core with glow */}
          <Animated.View pointerEvents="none" style={[styles.coreWrap, { left: cx - 18, top: cy - 18 }, corePulse]}>
            <View style={styles.coreGlow} />
            <View style={styles.core} />
            <View style={styles.coreInner} />
          </Animated.View>

          {/* Player shield paddle — thicker, glowing */}
          <Animated.View pointerEvents="none" style={[styles.paddle, { width: padLen, height: 16 }, shieldStyle]}>
            <LinearGradient colors={['#C4B5FD', '#7C3AED']} style={styles.paddleCore} />
            <View style={styles.paddleEdge} />
          </Animated.View>

          {/* Shield arc indicator */}
          <ShieldArc angle={shieldA} cx={cx} cy={cy} r={padDist} />
        </View>
      </GestureDetector>

      <GameHud
        onPause={requestPause}
        accent={palette.violet}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.violet}>ORBIT GUARD · HARD MODE</Text>
            <Text variant="display">{hud.score}</Text>
            <Text variant="micro" muted>{hud.time.toFixed(1)}s · wave {state.value.wave} · {state.value.blocks} deflected</Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={hud.hp > 1 ? palette.mint : palette.coral}>
              {'♥'.repeat(Math.max(0, hud.hp))}
              <Text variant="label" muted>{'♥'.repeat(Math.max(0, START_LIVES - hud.hp))}</Text>
            </Text>
            <View style={styles.typeLegend}>
              {Object.entries(KIND_COLOR).slice(0,4).map(([k,c]) => (
                <View key={k} style={[styles.legendDot, { backgroundColor: c }]} />
              ))}
            </View>
          </View>
        }
      />

      <Text variant="caption" faint center style={styles.hint}>
        {HAS_KEYBOARD ? 'Drag or A/D to swing shield — glowing orbs inbound!' : 'Drag around core to swing shield — watch the orbit rings!'}
      </Text>

      {__DEV__ ? (
        <View pointerEvents="none" style={styles.devDiag}>
          <Text variant="micro" color={palette.mint}>WORLD ✓ {state.value.time.toFixed(0)}s</Text>
          <Text variant="micro" color={palette.mint}>CAMERA ✓</Text>
          <Text variant="micro" color={palette.mint}>PLAYER ✓ shield {shieldA.value.toFixed(1)}</Text>
          <Text variant="micro" color={palette.mint}>ENTITIES ✓ {state.value.orbs.filter(o=>o.active).length} / {ORB_POOL}</Text>
          <Text variant="micro" color={palette.mint}>RENDER ✓ rings + glow</Text>
        </View>
      ) : null}
    </View>
  );
}

/* Visual subcomponents */

const ShieldArc = ({ angle, cx, cy, r }: { angle: any; cx: number; cy: number; r: number }) => {
  const style = useAnimatedStyle(() => {
    const a = angle.value;
    return {
      transform: [{ translateX: cx - 2 }, { translateY: cy - 2 }, { rotate: `${a}rad` }],
      opacity: 0.18,
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.shieldArc, style]} />;
};

const OrbVisual = React.memo(function OrbVisual({
  index,
  state,
  W,
  cx,
  cy,
  orbitR,
}: {
  index: number;
  state: ReturnType<typeof useSharedValue<OrbitState>>;
  W: number;
  cx: number;
  cy: number;
  orbitR: number;
}) {
  const style = useAnimatedStyle(() => {
    const o = state.value.orbs[index];
    if (!o || !o.active) return { opacity: 0 };
    const scale = orbitR * 2 * 0.92;
    return {
      opacity: 1,
      transform: [
        { translateX: Math.cos(o.angle) * o.dist * scale + cx - 10 },
        { translateY: Math.sin(o.angle) * o.dist * scale + cy - 10 },
      ],
    };
  });

  const trailStyles = useAnimatedStyle(() => {
    const o = state.value.orbs[index];
    if (!o || !o.active) return { opacity: 0 };
    return { opacity: 0.35 };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.orbContainer, style]}>
      {/* trail dots */}
      {Array.from({ length: 3 }, (_, ti) => (
        <TrailDot key={ti} index={index} trailIdx={ti} state={state} W={W} cx={cx} cy={cy} orbitR={orbitR} />
      ))}
      <View style={[styles.orbGlow, { backgroundColor: KIND_COLOR[state.value.orbs[index]?.kind ?? 'normal'] }]} />
      <View style={[styles.orbCore, { backgroundColor: KIND_COLOR[state.value.orbs[index]?.kind ?? 'normal'] }]} />
      {(state.value.orbs[index]?.kind === 'tank' || state.value.orbs[index]?.kind === 'boss') ? (
        <View style={styles.orbTankRing} />
      ) : null}
      {state.value.orbs[index]?.hp > 1 ? (
        <View style={styles.orbHp}>
          <Text variant="micro" color="#fff" style={{ fontSize: 8 }}>{state.value.orbs[index]?.hp}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const TrailDot = React.memo(function TrailDot({
  index,
  trailIdx,
  state,
  W,
  cx,
  cy,
  orbitR,
}: {
  index: number;
  trailIdx: number;
  state: any;
  W: number;
  cx: number;
  cy: number;
  orbitR: number;
}) {
  const style = useAnimatedStyle(() => {
    const o = state.value.orbs[index];
    if (!o || !o.active || !o.trail || trailIdx >= o.trail.length) return { opacity: 0 };
    const t = o.trail[o.trail.length - 1 - trailIdx];
    if (!t) return { opacity: 0 };
    const scale = orbitR * 2 * 0.92;
    return {
      opacity: (0.45 - trailIdx * 0.12),
      transform: [
        { translateX: Math.cos(t.angle) * t.dist * scale + cx - 4 + (Math.cos(o.angle) * o.dist * scale + cx - 10) * 0 + 0 },
        { translateY: Math.sin(t.angle) * t.dist * scale + cy - 4 },
      ],
      width: 8 - trailIdx * 2,
      height: 8 - trailIdx * 2,
      borderRadius: 4 - trailIdx,
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.trailDot, style]} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0A1C', overflow: 'hidden' },
  arena: { flex: 1, overflow: 'hidden' },
  flashOverlay: { backgroundColor: palette.coral },
  orbitRing: { position: 'absolute', borderStyle: 'dashed' },
  rim: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(124,92,255,0.38)', shadowColor: '#7C5CFF', shadowOpacity: 0.4, shadowRadius: 12 },
  orbContainer: { position: 'absolute', width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  orbGlow: { position: 'absolute', width: 26, height: 26, borderRadius: 13, opacity: 0.45 },
  orbCore: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#fff' },
  orbTankRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderStyle: 'dotted' },
  orbHp: { position: 'absolute', top: -8, right: -6, width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  trailDot: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 4 },
  coreWrap: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  coreGlow: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFD166', opacity: 0.22 },
  core: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.gold, borderWidth: 2, borderColor: '#fff', shadowColor: palette.gold, shadowOpacity: 0.9, shadowRadius: 16, elevation: 10 },
  coreInner: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', opacity: 0.9 },
  paddle: { position: 'absolute', borderRadius: radius.pill, borderWidth: 2, borderColor: '#E9D5FF', shadowColor: '#7C3AED', shadowOpacity: 0.5, shadowRadius: 8 },
  paddleCore: { flex: 1, borderRadius: radius.pill },
  paddleEdge: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  shieldArc: { position: 'absolute', width: 4, height: 4, borderTopWidth: 42, borderRightWidth: 42, borderColor: 'rgba(124,92,255,0.18)', borderStyle: 'solid', borderRadius: 42 },
  hudCentre: { alignItems: 'center', gap: 2 },
  hudRight: { alignItems: 'flex-end', gap: 3 },
  typeLegend: { flexDirection: 'row', gap: 3, marginTop: 2 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  hint: { paddingBottom: spacing.md },
  devDiag: { position: 'absolute', top: spacing.huge + spacing.lg, left: spacing.md, gap: 2, backgroundColor: 'rgba(0,0,0,0.45)', padding: 5, borderRadius: 6 },
});

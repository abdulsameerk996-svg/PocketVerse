import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useEntityPool, useGameLoop } from '@/core/game/useGameLoop';
import { comboMultiplier, quickReward } from '@/core/game/quick';
import { useKeyPress, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, LiveValue, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import {
  GRAVITY,
  attachSwing,
  baseSpeed,
  clamp,
  distanceScore,
  nearestAnchor,
  overlaps,
  releaseVelocity,
  stepPendulum,
  swingPos,
} from './logic';
import type { HookRunSave } from './types';

/**
 * ============================================================================
 *  HOOK RUN
 * ============================================================================
 *
 * Tap to hook the nearest ring ahead, swing on a deterministic pendulum, and
 * release near the top of the arc to fling yourself forward. Tap again to cut
 * the line. Cruise speed drags you along on the ground — swing to outrun it
 * and clear the spikes.
 *
 * One worklet owns the whole world: the player, a pooled ring field, a pooled
 * spike field, and the pendulum state, all in shared values. React only hears
 * about combos and game over.
 */

export function HookRunSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const gy = H * 0.8;
  const pr = 15;

  const anchors = useEntityPool(8);
  const obstacles = useEntityPool(14);
  const frame = useSharedValue(0);

  const px = useSharedValue(0);
  const py = useSharedValue(gy);
  const vx = useSharedValue(0);
  const vy = useSharedValue(0);
  const dist = useSharedValue(0);
  const score = useSharedValue(0);

  const attached = useSharedValue(0);
  const ang = useSharedValue(0);
  const angVel = useSharedValue(0);
  const radius = useSharedValue(0);
  const ax = useSharedValue(0);
  const ay = useSharedValue(0);

  const combo = useSharedValue(0);
  const comboT = useSharedValue(0);
  const grapples = useSharedValue(0);
  const invuln = useSharedValue(0);
  const seeded = useSharedValue(0);
  const alive = useSharedValue(1);

  const [over, setOver] = useState(false);
  const [comboUI, setComboUI] = useState(0);
  const finished = useRef(false);
  const speedMod = modifiers.speed;

  /* ------------------------------------------------------ JS callbacks */
  const onFling = useCallback(
    (perfect: boolean) => {
      if (perfect) {
        haptics.success();
        play('rhythm.perfect');
      } else {
        haptics.press();
        play('game.jump', { volume: 0.7 });
      }
    },
    [],
  );
  const onNearMiss = useCallback(() => {
    play('game.collect', { volume: 0.35 });
    haptics.tick();
  }, []);
  const syncCombo = useCallback((c: number) => setComboUI(Math.round(c)), []);

  /* ---------------------------------------------------------- finish */
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    alive.value = 0;
    setOver(true);
    const d = Math.round(dist.value);
    const sc = Math.round(score.value);
    const g = Math.round(grapples.value);
    haptics.fail();
    play('game.crash');
    setTimeout(() => {
      onFinish({
        score: sc,
        outcome: 'lose',
        metrics: { hookrun_distance: d, hookrun_grapples: g },
        reward: quickReward(sc, d / 60),
        breakdown: [
          { label: 'Distance', value: `${Math.round(d / 10)} m` },
          { label: 'Grapples', value: `${g}` },
          { label: 'Best combo', value: `${Math.round(combo.value)}` },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, grapples: 0 }) as HookRunSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, sc),
          grapples: save2.grapples + g,
        };
      });
    }, 750);
  }, [alive, combo, dist, grapples, onFinish, score, setSave]);

  /* ----------------------------------------------------------- the loop */
  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      frame.value += 1;
      const dtc = Math.min(dt, 0.033);

      // ── seed the world once ──
      if (seeded.value < 1) {
        seeded.value = 1;
        let nx = px.value + 240;
        for (let i = 0; i < anchors.value.length; i++) {
          const a = anchors.value[i];
          a.active = true;
          a.x = nx + Math.random() * 120;
          a.y = gy - 70 - Math.random() * 150;
          a.kind = 0;
          nx += 330 + Math.random() * 200;
        }
        let ox = px.value + 430;
        for (let i = 0; i < obstacles.value.length; i++) {
          const o = obstacles.value[i];
          o.active = true;
          o.x = ox + Math.random() * 160;
          o.y = gy - 34;
          o.w = 26;
          o.h = 34;
          o.data = 0;
          o.data2 = 0;
          ox += 170 + Math.random() * 240;
        }
      }

      // ── recycle entities that fall behind the camera ──
      for (let i = 0; i < anchors.value.length; i++) {
        const a = anchors.value[i];
        if (a.active && a.x < px.value - 120) {
          a.x = px.value + 900 + Math.random() * 500;
          a.y = gy - 70 - Math.random() * 150;
        }
      }
      for (let i = 0; i < obstacles.value.length; i++) {
        const o = obstacles.value[i];
        if (o.active && o.x < px.value - 160) {
          o.x = px.value + 600 + Math.random() * 700;
          o.y = gy - 34;
          o.data2 = 0;
        }
      }

      const cruise = baseSpeed(dist.value) * (1 + speedMod * 0.25);

      if (attached.value > 0) {
        // ── swinging: pure pendulum, world-fixed anchor ──
        const s = stepPendulum(
          { angle: ang.value, angVel: angVel.value, radius: radius.value, ax: ax.value, ay: ay.value },
          dtc,
        );
        ang.value = s.angle;
        angVel.value = s.angVel;
        const pos = swingPos(s);
        px.value = pos.x;
        py.value = pos.y;
        // Auto-release at the top of the arc — that is the whole reward.
        if (pos.y < s.ay - 4 || pos.y >= gy) {
          attached.value = 0;
          const rv = releaseVelocity(s, cruise);
          vx.value = rv.vx;
          vy.value = rv.vy;
          if (rv.perfect) {
            combo.value += 1;
            comboT.value = 3;
            score.value += 60 * comboMultiplier(combo.value);
            runOnJS(onFling)(true);
          } else {
            runOnJS(onFling)(false);
          }
        }
      } else {
        // ── airborne or sliding ──
        const grounded = py.value >= gy - 1;
        if (grounded) {
          py.value = gy;
          vy.value = 0;
          vx.value = Math.max(vx.value, cruise);
        } else {
          vy.value += GRAVITY * dtc;
          vx.value = Math.max(vx.value * 0.999, cruise);
        }
        px.value += Math.max(vx.value, cruise) * dtc;
        py.value += vy.value * dtc;
        if (py.value >= gy) {
          py.value = gy;
          vy.value = 0;
          invuln.value = 0.7;
        }
      }

      // ── scoring / combo decay ──
      if (px.value > dist.value) {
        score.value += distanceScore(px.value - dist.value);
        dist.value = px.value;
      }
      if (comboT.value > 0) {
        comboT.value -= dtc;
        if (comboT.value <= 0) combo.value = 0;
      }
      invuln.value = Math.max(0, invuln.value - dtc);

      // ── spikes: only bite while sliding on the ground ──
      for (let i = 0; i < obstacles.value.length; i++) {
        const o = obstacles.value[i];
        if (!o.active) continue;
        const close = Math.abs(px.value - (o.x + o.w / 2)) < 70;
        if (close && overlaps(px.value, py.value, pr, o)) {
          if (py.value >= gy - 8) {
            alive.value = 0;
            runOnJS(finish)();
          } else if (o.data2 === 0) {
            // Near-miss while airborne — clean flying pays.
            o.data2 = 1;
            score.value += 25 * comboMultiplier(combo.value);
            runOnJS(onNearMiss)();
          }
        }
      }

      // ── score readout sync ──
      if (frame.value % 12 === 0) {
        runOnJS(syncCombo)(combo.value);
      }
    },
    [alive, anchors, ang, angVel, attached, ax, ay, combo, comboT, dist, finish, frame, gy, invuln, obstacles, onFling, onNearMiss, px, py, radius, score, seeded, speedMod, syncCombo, vx, vy],
  );

  useGameLoop(loop, !paused && !over);

  /* ----------------------------------------------------------- input */
  const toggle = useCallback(() => {
    if (over) return;
    if (attached.value > 0) {
      const s = {
        angle: ang.value,
        angVel: angVel.value,
        radius: radius.value,
        ax: ax.value,
        ay: ay.value,
      };
      attached.value = 0;
      const rv = releaseVelocity(s, baseSpeed(dist.value) * (1 + speedMod * 0.25));
      vx.value = rv.vx;
      vy.value = rv.vy;
      if (rv.perfect) {
        combo.value += 1;
        comboT.value = 3;
        score.value += 60 * comboMultiplier(combo.value);
        onFling(true);
      } else {
        onFling(false);
      }
      return;
    }
    // Hook: nearest anchor ahead, within reach.
    const idx = nearestAnchor(px.value, py.value, anchors.value);
    if (idx < 0) {
      haptics.tap();
      return;
    }
    const a = anchors.value[idx];
    const s = attachSwing(px.value, py.value, vx.value, vy.value, a.x, a.y);
    if (!s) return;
    ang.value = s.angle;
    angVel.value = s.angVel;
    radius.value = s.radius;
    ax.value = s.ax;
    ay.value = s.ay;
    attached.value = 1;
    grapples.value += 1;
    haptics.press();
    play('game.jump');
  }, [anchors, ang, angVel, attached, ax, ay, combo, comboT, dist, grapples, onFling, over, px, py, radius, score, speedMod, vx, vy]);

  useKeyPress(!paused && !over, { ' ': toggle, ArrowUp: toggle, w: toggle });

  /* ------------------------------------------------------- rendering */
  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value - (px.value - W * 0.3) - pr },
      { translateY: py.value - pr },
    ],
  }));

  const hookLineStyle = useAnimatedStyle(() => {
    if (attached.value < 1) return { opacity: 0 };
    const sx = ax.value - (px.value - W * 0.3);
    return {
      opacity: 0.85,
      left: sx,
      top: ay.value,
      width: radius.value,
      transform: [{ rotate: `${(ang.value * 180) / Math.PI}deg` }],
    };
  });

  const hookTipStyle = useAnimatedStyle(() => ({
    left: ax.value - (px.value - W * 0.3) - 7,
    top: ay.value - 7,
    opacity: attached.value > 0 ? 1 : 0.35 + Math.sin(frame.value * 0.3) * 0.3,
  }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0A1230', '#0A0814', '#08060F']} style={StyleSheet.absoluteFill} />

      <GameHud
        onPause={requestPause}
        accent={palette.rose}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.rose}>
              HOOK RUN
            </Text>
            <View style={styles.hudRow}>
              <LiveValue value={score} variant="display" />
              <LiveValue value={dist} variant="label" color={palette.gold} format={(v) => `${Math.round(v / 10)} m`} />
            </View>
          </View>
        }
        right={
          <Text variant="label" color={comboUI >= 2 ? palette.gold : palette.textMuted}>
            {comboUI >= 2 ? `COMBO ×${comboUI}` : 'TAP TO HOOK'}
          </Text>
        }
      />

      <Pressable onPress={toggle} style={styles.arena}>
        {/* ground */}
        <View style={[styles.ground, { top: gy }]} />

        {/* rings */}
        {Array.from({ length: 8 }, (_, i) => (
          <RingSprite key={i} index={i} pool={anchors} cam={px} camW={W * 0.3} />
        ))}

        {/* spikes */}
        {Array.from({ length: 14 }, (_, i) => (
          <SpikeSprite key={i} index={i} pool={obstacles} cam={px} camW={W * 0.3} />
        ))}

        {/* hook line */}
        <Animated.View pointerEvents="none" style={[styles.hookLine, hookLineStyle]} />
        <Animated.View pointerEvents="none" style={[styles.ringDot, hookTipStyle]} />

        {/* player */}
        <Animated.View style={[styles.player, { width: pr * 2, height: pr * 2, borderRadius: pr }, playerStyle]}>
          <View style={styles.playerCore} />
        </Animated.View>

        <View pointerEvents="none" style={styles.hint}>
          <Text variant="caption" faint>
            {HAS_KEYBOARD ? 'space / ↑ — hook · release near the top of the arc' : 'tap to hook · tap again to release'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const RingSprite = React.memo(function RingSprite({
  index,
  pool,
  cam,
  camW,
}: {
  index: number;
  pool: ReturnType<typeof useEntityPool>;
  cam: ReturnType<typeof useSharedValue<number>>;
  camW: number;
}) {
  const style = useAnimatedStyle(() => {
    const a = pool.value[index];
    if (!a || !a.active) return { opacity: 0 };
    return {
      opacity: 0.9,
      transform: [{ translateX: a.x - (cam.value - camW) - 14 }, { translateY: a.y - 14 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
});

const SpikeSprite = React.memo(function SpikeSprite({
  index,
  pool,
  cam,
  camW,
}: {
  index: number;
  pool: ReturnType<typeof useEntityPool>;
  cam: ReturnType<typeof useSharedValue<number>>;
  camW: number;
}) {
  const style = useAnimatedStyle(() => {
    const o = pool.value[index];
    if (!o || !o.active) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: o.x - (cam.value - camW) }, { translateY: o.y }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.spike, style]} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  hudRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  arena: { flex: 1 },
  ground: {
    position: 'absolute',
    left: -80,
    right: -80,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  ring: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: palette.rose,
    backgroundColor: 'rgba(255,77,141,0.18)',
  },
  ringDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: palette.rose },
  spike: {
    position: 'absolute',
    width: 26,
    height: 34,
    borderRadius: 4,
    backgroundColor: palette.coral,
    opacity: 0.9,
  },
  hookLine: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.rose,
    transformOrigin: 'left',
  },
  player: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BFF0FF',
    borderWidth: 2,
    borderColor: palette.cyan,
    shadowColor: palette.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 5,
  },
  playerCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#0A3B4D' },
  hint: { position: 'absolute', bottom: spacing.xl, left: 0, right: 0, alignItems: 'center' },
});

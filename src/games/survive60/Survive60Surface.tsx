import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { useEntityPool, useGameLoop } from '@/core/game/useGameLoop';
import { quickReward } from '@/core/game/quick';
import { useKeyAxis, useKeyPress, HAS_KEYBOARD } from '@/ui/hooks/useKeyboard';
import { GameHud, LiveValue, PressableScale, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import {
  DASH_COOLDOWN,
  DASH_SECONDS,
  DASH_SPEED,
  ENEMY_CHASER,
  ENEMY_POOL,
  ENEMY_STRAIGHT,
  ENEMY_ZIGZAG,
  MAX_HP,
  PICKUP_BOOST,
  PICKUP_DOUBLE,
  PICKUP_POOL,
  PICKUP_SHIELD,
  PLAYER_R,
  SURVIVE_SECONDS,
  clamp,
  enemyTier,
  killPoints,
  playerSpeed,
  spawnInterval,
  spawnOne,
  spawnPickup,
  stepEnemy,
} from './logic';
import type { Survive60Save } from './types';

/**
 * ============================================================================
 *  SURVIVE 60
 * ============================================================================
 *
 * Sixty seconds, a screen of chasers, one thumb. The arena is a single
 * Reanimated worklet over two fixed pools (24 enemies + 8 pickups) — zero
 * React renders while playing. Every ten seconds the tier climbs: faster,
 * denser, and new behaviours (straight-liners at tier 2, zigzags at tier 4).
 *
 * Controls: drag anywhere to steer on touch, WASD/arrows on desktop. The DASH
 * button (or space/shift) bursts through enemies — dashing into one pops it
 * for score instead of hurting you.
 */

export function Survive60Surface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width: W, height: H } = useResponsive();
  const pool = useEntityPool(ENEMY_POOL + PICKUP_POOL);
  const frame = useSharedValue(0);
  const px = useSharedValue(W / 2);
  const py = useSharedValue(H * 0.62);
  const steerX = useSharedValue(W / 2);
  const steerY = useSharedValue(H * 0.62);
  const dirX = useSharedValue(0);
  const dirY = useSharedValue(-1);
  const axSV = useSharedValue(0);
  const aySV = useSharedValue(0);
  const hp = useSharedValue(MAX_HP);
  const invuln = useSharedValue(0);
  const shield = useSharedValue(0);
  const boost = useSharedValue(0);
  const doubler = useSharedValue(0);
  const score = useSharedValue(0);
  const kills = useSharedValue(0);
  const time = useSharedValue(0);
  const spawnTimer = useSharedValue(1);
  const pickupTimer = useSharedValue(4);
  const dashT = useSharedValue(0);
  const dashCd = useSharedValue(0);
  const dashCmd = useSharedValue(0);
  const alive = useSharedValue(1);

  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ hp: MAX_HP, shield: false, boost: false, doubler: false, dashReady: true });
  const finished = useRef(false);
  const lastPopSound = useRef(0);
  const speedMod = modifiers.speed;

  /* --------------------------------------------------- HUD sync (8 Hz) */
  useEffect(() => {
    const id = setInterval(() => {
      setHud({
        hp: hp.value,
        shield: shield.value > 0,
        boost: boost.value > 0,
        doubler: doubler.value > 0,
        dashReady: dashCd.value <= 0 && dashT.value <= 0,
      });
    }, 120);
    return () => clearInterval(id);
  }, [boost, dashCd, dashT, doubler, hp, shield]);

  /* ---------------------------------------------------------- finish */
  const finish = useCallback(
    (won: boolean) => {
      if (finished.current) return;
      finished.current = true;
      alive.value = 0;
      setOver(true);
      const t = time.value;
      const k = kills.value;
      const sc = Math.round(score.value);
      play(won ? 'reward.chest' : 'game.over');
      if (won) haptics.success();
      else haptics.fail();
      setTimeout(() => {
        onFinish({
          score: sc,
          outcome: won ? 'win' : 'lose',
          metrics: { survive60_time: Math.round(t), survive60_kills: k },
          reward: quickReward(sc, t, { won }),
          breakdown: [
            { label: 'Survived', value: `${t.toFixed(1)}s` },
            { label: 'Pops', value: `${k}` },
            { label: 'Tier reached', value: `${enemyTier(t)}` },
          ],
        });
        setSave((s: unknown) => {
          const save2 = (s ?? { runs: 0, best: 0, totalKills: 0 }) as Survive60Save;
          return {
            ...save2,
            runs: save2.runs + 1,
            best: Math.max(save2.best, sc),
            totalKills: save2.totalKills + k,
          };
        });
      }, 800);
    },
    [alive, kills, onFinish, score, setSave, time],
  );

  /* -------------------------------------------------- sound callbacks */
  const onPop = useCallback(() => {
    const now = Date.now();
    if (now - lastPopSound.current < 90) return;
    lastPopSound.current = now;
    play('game.hit', { volume: 0.3 });
    haptics.tick();
  }, []);

  const onPickup = useCallback(
    (kind: number) => {
      play(kind === PICKUP_DOUBLE ? 'reward.chest' : 'game.collect', { volume: 0.6 });
      haptics.collect();
    },
    [],
  );

  const onHit = useCallback((left: number) => {
    play('game.hit');
    haptics.heavy();
    void left;
  }, []);

  const onShieldPop = useCallback(() => {
    play('game.hit', { volume: 0.4 });
    haptics.tick();
  }, []);

  /* ----------------------------------------------------------- the loop */
  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      frame.value += 1;
      time.value += dt;

      // ── input: keyboard wins, otherwise steer toward the finger ──
      let mx = axSV.value;
      let my = aySV.value;
      const usingKeys = mx !== 0 || my !== 0;
      if (!usingKeys) {
        const dx = steerX.value - px.value;
        const dy = steerY.value - py.value;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          mx = dx / d;
          my = dy / d;
        } else {
          mx = 0;
          my = 0;
        }
      }
      if (mx !== 0 || my !== 0) {
        dirX.value = mx;
        dirY.value = my;
      }

      const speed = playerSpeed(speedMod) * (boost.value > 0 ? 1.65 : 1);
      const dashing = dashT.value > 0;
      const vx = dashing ? dirX.value * speed * DASH_SPEED : mx * speed;
      const vy = dashing ? dirY.value * speed * DASH_SPEED : my * speed;
      if (dashing) dashT.value -= dt;
      px.value = clamp(px.value + vx * dt, PLAYER_R, W - PLAYER_R);
      py.value = clamp(py.value + vy * dt, PLAYER_R, H - PLAYER_R);

      invuln.value = Math.max(0, invuln.value - dt);
      boost.value = Math.max(0, boost.value - dt);
      doubler.value = Math.max(0, doubler.value - dt);
      dashCd.value = Math.max(0, dashCd.value - dt);

      if (dashCmd.value > 0) {
        dashCmd.value = 0;
        if (dashCd.value <= 0 && !dashing) {
          dashT.value = DASH_SECONDS;
          dashCd.value = DASH_COOLDOWN;
          invuln.value = Math.max(invuln.value, 0.9);
        }
      }

      // Survival trickle — even standing still, a live run scores.
      score.value += dt * (doubler.value > 0 ? 4 : 2);

      // ── spawning ──
      spawnTimer.value -= dt;
      if (spawnTimer.value <= 0) {
        const tier = enemyTier(time.value);
        spawnTimer.value = spawnInterval(tier);
        spawnOne(pool.value, tier, W, H);
      }

      // ── enemies ──
      const pr = PLAYER_R;
      for (let i = 0; i < ENEMY_POOL; i++) {
        const e = pool.value[i];
        if (!e.active) continue;
        stepEnemy(e, px.value, py.value, dt, W, H);
        const r = e.data;
        const dx = e.x - px.value;
        const dy = e.y - py.value;
        const reach = r + pr;
        if (dx * dx + dy * dy < reach * reach) {
          if (dashing) {
            e.active = false;
            kills.value += 1;
            score.value += killPoints(score.value, doubler.value > 0);
            runOnJS(onPop)();
          } else if (invuln.value <= 0) {
            if (shield.value > 0) {
              shield.value = 0;
              invuln.value = 1.2;
              runOnJS(onShieldPop)();
            } else {
              hp.value -= 1;
              invuln.value = 1.35;
              runOnJS(onHit)(hp.value);
              if (hp.value <= 0) {
                alive.value = 0;
                runOnJS(finish)(false);
              }
            }
          }
        }
      }

      // ── pickups ──
      pickupTimer.value -= dt;
      if (pickupTimer.value <= 0) {
        pickupTimer.value = 6.5 + Math.random() * 4;
        spawnPickup(pool.value, W, H, px.value, py.value);
      }
      for (let i = ENEMY_POOL; i < ENEMY_POOL + PICKUP_POOL; i++) {
        const p = pool.value[i];
        if (!p.active) continue;
        p.data2 -= dt;
        if (p.data2 <= 0) {
          p.active = false;
          continue;
        }
        const dx = p.x - px.value;
        const dy = p.y - py.value;
        if (dx * dx + dy * dy < (pr + 14) * (pr + 14)) {
          p.active = false;
          if (p.data === PICKUP_SHIELD) shield.value = 10;
          else if (p.data === PICKUP_BOOST) boost.value = 6;
          else doubler.value = 6;
          runOnJS(onPickup)(p.data);
        }
      }

      // ── win ──
      if (time.value >= SURVIVE_SECONDS) {
        alive.value = 0;
        runOnJS(finish)(true);
      }
    },
    [
      alive, axSV, aySV, boost, dashCd, dashCmd, dashT, dirX, dirY, doubler, finish,
      frame, hp, invuln, kills, onHit, onPickup, onPop, onShieldPop, pickupTimer, pool,
      px, py, score, shield, spawnTimer, speedMod, steerX, steerY, time,
    ],
  );

  useGameLoop(loop, !paused && !over);

  /* ----------------------------------------------------------- input */
  useKeyAxis(
    !paused && !over,
    useCallback(
      (x, y) => {
        axSV.value = x;
        aySV.value = y;
      },
      [axSV, aySV],
    ),
  );
  useKeyPress(!paused && !over, {
    ' ': () => (dashCmd.value = 1),
    Shift: () => (dashCmd.value = 1),
  });

  const steer = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          'worklet';
          steerX.value = e.x;
          steerY.value = e.y;
        })
        .onUpdate((e) => {
          'worklet';
          steerX.value = e.x;
          steerY.value = e.y;
        }),
    [steerX, steerY],
  );

  /* ------------------------------------------------------- rendering */
  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value - PLAYER_R },
      { translateY: py.value - PLAYER_R },
    ],
    opacity:
      invuln.value > 0 && Math.floor(frame.value * 0.35) % 2 === 0
        ? 0.35
        : 1,
  }));

  const shieldStyle = useAnimatedStyle(() => ({
    opacity: shield.value > 0 ? 0.75 + Math.sin(frame.value * 0.2) * 0.25 : 0,
    transform: [{ scale: 1 + Math.sin(frame.value * 0.2) * 0.05 }],
  }));

  const boostStyle = useAnimatedStyle(() => ({
    opacity: boost.value > 0 ? 0.8 : 0,
    transform: [{ translateX: px.value - 26 }, { translateY: py.value }],
  }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#150B2B', '#0A0814', '#060510']} style={StyleSheet.absoluteFill} />

      <GameHud
        onPause={requestPause}
        accent={palette.cyan}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.cyan}>
              SURVIVE 60
            </Text>
            <View style={styles.hudRow}>
              <LiveValue value={time} variant="display" format={(v) => `${Math.floor(v)}s`} />
              <LiveValue value={score} variant="label" color={palette.gold} format={(v) => `${Math.floor(v)}`} />
            </View>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={hud.hp > 1 ? palette.mint : palette.coral}>
              {'♥'.repeat(hud.hp)}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, MAX_HP - hud.hp))}
              </Text>
            </Text>
            <Text variant="micro" muted>
              {hud.shield ? '🛡 ' : ''}
              {hud.boost ? '⚡ ' : ''}
              {hud.doubler ? '✖2 ' : ''}
            </Text>
          </View>
        }
      />

      <GestureDetector gesture={steer}>
        <View style={styles.arena}>
          {Array.from({ length: ENEMY_POOL }, (_, i) => (
            <EnemySprite key={i} index={i} pool={pool} frame={frame} />
          ))}
          {Array.from({ length: PICKUP_POOL }, (_, i) => (
            <PickupSprite key={i} index={ENEMY_POOL + i} pool={pool} frame={frame} />
          ))}

          <Animated.View
            style={[styles.shieldRing, { width: PLAYER_R * 3.4, height: PLAYER_R * 3.4, borderRadius: PLAYER_R * 1.7 }, shieldStyle]}
          />
          <Animated.View style={[styles.boostTrail, boostStyle]} />

          <Animated.View style={[styles.player, playerStyle]}>
            <View style={styles.playerCore} />
            <View style={styles.playerGlint} />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Control bar */}
      <View style={styles.controls}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" faint>
            {HAS_KEYBOARD ? 'WASD move · space dash' : 'Drag to move'}
          </Text>
        </View>
        <PressableScale
          onPress={() => (dashCmd.value = 1)}
          scaleTo={0.9}
          haptic="press"
          style={[
            styles.dashBtn,
            !hud.dashReady && { opacity: 0.45 },
          ]}
        >
          <Text variant="label" color={hud.dashReady ? palette.cyan : palette.textMuted}>
            DASH
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ entities */

const EnemySprite = React.memo(function EnemySprite({
  index,
  pool,
  frame,
}: {
  index: number;
  pool: ReturnType<typeof useEntityPool>;
  frame: ReturnType<typeof useSharedValue<number>>;
}) {
  const style = useAnimatedStyle(() => {
    frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0 };
    const kind = e.kind;
    const color =
      kind === ENEMY_CHASER ? palette.coral : kind === ENEMY_STRAIGHT ? palette.rose : palette.violet;
    return {
      opacity: 1,
      width: e.w,
      height: e.h,
      borderRadius: e.w / 2,
      backgroundColor: color,
      borderColor: `${color}66`,
      transform: [{ translateX: e.x - e.w / 2 }, { translateY: e.y - e.h / 2 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.enemy, style]} />;
});

const PickupSprite = React.memo(function PickupSprite({
  index,
  pool,
  frame,
}: {
  index: number;
  pool: ReturnType<typeof useEntityPool>;
  frame: ReturnType<typeof useSharedValue<number>>;
}) {
  const style = useAnimatedStyle(() => {
    const f = frame.value;
    const p = pool.value[index];
    if (!p || !p.active) return { opacity: 0 };
    const kind = p.data;
    const color =
      kind === PICKUP_SHIELD ? palette.sky : kind === PICKUP_BOOST ? palette.lime : palette.gold;
    const bob = Math.sin(f * 0.12 + index) * 4;
    return {
      opacity: 0.85 + Math.sin(f * 0.25) * 0.15,
      width: p.w,
      height: p.h,
      borderRadius: p.w / 2,
      backgroundColor: `${color}33`,
      borderColor: color,
      borderWidth: 2,
      transform: [{ translateX: p.x - p.w / 2 }, { translateY: p.vy + bob - p.h / 2 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.enemy, style]} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  hudRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  arena: { flex: 1, overflow: 'hidden' },
  enemy: { position: 'absolute', borderWidth: 1 },
  player: {
    position: 'absolute',
    width: PLAYER_R * 2,
    height: PLAYER_R * 2,
    borderRadius: PLAYER_R,
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
  playerCore: { width: PLAYER_R * 1.2, height: PLAYER_R * 1.2, borderRadius: PLAYER_R, backgroundColor: '#EAFDFF' },
  playerGlint: { position: 'absolute', top: 3, left: 5, width: 7, height: 5, borderRadius: 4, backgroundColor: '#FFFFFF' },
  shieldRing: { position: 'absolute', borderWidth: 2, borderColor: palette.sky, backgroundColor: 'rgba(78,168,255,0.12)' },
  boostTrail: {
    position: 'absolute',
    width: 10,
    height: 14,
    borderRadius: 5,
    backgroundColor: palette.lime,
    opacity: 0.7,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dashBtn: {
    width: 84,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.14)',
    borderWidth: 1.5,
    borderColor: palette.cyan,
  },
});

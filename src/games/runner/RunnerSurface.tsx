import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop, useEntityPool, type PooledEntity } from '@/core/game/useGameLoop';
import { usePlayerStore } from '@/core/state/playerStore';
import { getItem } from '@/content/catalog';
import {
  GameHud,
  LiveValue,
  Text,
  haptics,
  motion,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import type { RunnerSave } from './types';
import { RUNNER_SKINS } from './content';

/* ------------------------------------------------------------- tuning -- */

const LANES = 3;
const BASE_SPEED = 470;
const SPEED_GAIN = 13;
const MAX_SPEED = 1500;
const SPAWN_BASE = 0.64;
const JUMP_MS = 620;
const JUMP_H = 98;
const SLIDE_MS = 520;

/**
 * Pool segmentation.
 *
 * Each slot has a *fixed* visual, so an entity's glyph never has to cross the
 * bridge — spawning just picks a free slot in the right band and mutates
 * numbers. Rendering is therefore 100% worklet-driven with zero re-renders.
 */
const BANDS = {
  block: [0, 8],
  high: [8, 14],
  coin: [14, 28],
  gem: [28, 30],
  shield: [30, 31],
  magnet: [31, 32],
  double: [32, 33],
} as const;
const POOL = 33;

type BandName = keyof typeof BANDS;

const BAND_VISUAL: Record<BandName, { glyph: string; size: number }> = {
  block: { glyph: '🧱', size: 34 },
  high: { glyph: '🚧', size: 34 },
  coin: { glyph: '🪙', size: 25 },
  gem: { glyph: '💎', size: 26 },
  shield: { glyph: '🛡️', size: 30 },
  magnet: { glyph: '🧲', size: 30 },
  double: { glyph: '✖️', size: 30 },
};

function bandOfSlot(i: number): BandName {
  for (const [name, [from, to]] of Object.entries(BANDS) as [BandName, readonly [number, number]][]) {
    if (i >= from && i < to) return name;
  }
  return 'coin';
}

function spawnIn(pool: PooledEntity[], from: number, to: number): number {
  'worklet';
  for (let i = from; i < to; i++) if (!pool[i].active) return i;
  return -1;
}

/**
 * ENDLESS RUNNER
 *
 * Reference implementation for PocketVerse action games:
 *   · the whole simulation is one Reanimated worklet on the UI thread
 *   · 33 pre-allocated entities, recycled — no allocation per frame
 *   · React re-renders only on powerup change and game over
 *   · `frame` is the render clock every entity style reads, which is how
 *     in-place pool mutations become visible to `useAnimatedStyle`
 *
 * Equipped cosmetics matter: `speed` changes the run, `luck` shifts drop rolls,
 * and the equipped shirt/trail decide what the character looks like.
 */
export function RunnerSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width, height, s: sc } = useResponsive();
  const runnerSave = save as RunnerSave;

  const avatar = usePlayerStore((st) => st.player.avatar);
  const skin = RUNNER_SKINS.find((s) => s.id === runnerSave.skin) ?? RUNNER_SKINS[0];
  const shirtTint = avatar.equipped.shirt ? getItem(avatar.equipped.shirt).tint : undefined;
  const trailOn = (avatar.equipped.trail ?? 'trail_none') !== 'trail_none';

  const laneW = width / LANES;
  const playerY = height * 0.7;
  const playerSize = sc(46);

  /* ------------------------------------------------------ shared state */
  const pool = useEntityPool(POOL);
  const frame = useSharedValue(0);
  const lane = useSharedValue(1);
  const laneX = useSharedValue(laneW * 1.5);
  const jumpT = useSharedValue(1);
  const slideT = useSharedValue(1);
  const scroll = useSharedValue(0);
  const distance = useSharedValue(0);
  const coins = useSharedValue(0);
  const gems = useSharedValue(0);
  const powerups = useSharedValue(0);
  const shield = useSharedValue(0);
  const magnet = useSharedValue(0);
  const doubler = useSharedValue(0);
  const spawnTimer = useSharedValue(0.9);
  const alive = useSharedValue(1);
  const shake = useSharedValue(0);

  const [over, setOver] = useState(false);
  const [powers, setPowers] = useState({ shield: false, magnet: false, doubler: false });

  const speedMul = 1 + modifiers.speed;
  const luck = modifiers.luck;

  /* ----------------------------------------------------- JS callbacks */

  const syncPowers = useCallback(() => {
    setPowers({
      shield: shield.value > 0,
      magnet: magnet.value > 0,
      doubler: doubler.value > 0,
    });
  }, [shield, magnet, doubler]);

  useEffect(() => {
    const id = setInterval(syncPowers, 250);
    return () => clearInterval(id);
  }, [syncPowers]);

  const onCoin = useCallback(() => {
    haptics.collect();
    play('game.collect');
  }, []);

  const onPower = useCallback(() => {
    haptics.success();
    play('reward.chest');
    syncPowers();
  }, [syncPowers]);

  const onHit = useCallback((survived: boolean) => {
    if (survived) {
      haptics.heavy();
      play('game.hit');
    } else {
      haptics.fail();
      play('game.over');
    }
  }, []);

  const finish = useCallback(() => {
    setOver((already) => {
      if (already) return already;
      const dist = Math.floor(distance.value);
      const c = Math.floor(coins.value);
      const g = Math.floor(gems.value);
      const score = dist + c * 12 + g * 120;

      setSave((prev: RunnerSave) => ({
        ...prev,
        runs: prev.runs + 1,
        bestDistance: Math.max(prev.bestDistance, dist),
        totalDistance: prev.totalDistance + dist,
      }));

      onFinish({
        score,
        outcome: 'lose',
        metrics: {
          run_distance: dist,
          run_best_score: score,
          run_powerups: Math.floor(powerups.value),
        },
        reward: {
          coins: Math.round(c * 3 + dist * 0.22),
          xp: Math.round(20 + dist * 0.09),
          gems: g,
          items:
            dist > 1500
              ? { mat_starfrag: 1, mat_circuit: 1 }
              : dist > 700
                ? { mat_circuit: 1 }
                : { mat_scrap: 1 },
        },
        breakdown: [
          { label: 'Distance', value: `${dist} m` },
          { label: 'Coins', value: `${c}` },
          { label: 'Gems', value: `${g}` },
          { label: 'Powerups', value: `${Math.floor(powerups.value)}` },
        ],
      });
      return true;
    });
  }, [coins, distance, gems, onFinish, powerups, setSave]);

  /* -------------------------------------------------------- game loop */

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      frame.value += 1;

      const speed =
        Math.min(MAX_SPEED, BASE_SPEED + (distance.value / 100) * SPEED_GAIN) * speedMul;

      distance.value += (speed * dt) / 26;
      scroll.value = (scroll.value + speed * dt) % 120;

      if (shield.value > 0) shield.value = Math.max(0, shield.value - dt);
      if (magnet.value > 0) magnet.value = Math.max(0, magnet.value - dt);
      if (doubler.value > 0) doubler.value = Math.max(0, doubler.value - dt);

      // ------------------------------------------------------ spawning
      spawnTimer.value -= dt;
      if (spawnTimer.value <= 0) {
        const difficulty = Math.min(1, distance.value / 2600);
        spawnTimer.value = Math.max(0.27, SPAWN_BASE - difficulty * 0.31);

        const obstacleLane = Math.floor(Math.random() * LANES);
        const wantsSecond = Math.random() < difficulty * 0.55;
        const secondLane =
          (obstacleLane + 1 + Math.floor(Math.random() * (LANES - 1))) % LANES;

        const put = (band: readonly [number, number], l: number, size: number, yOff: number) => {
          'worklet';
          const idx = spawnIn(pool.value, band[0], band[1]);
          if (idx < 0) return;
          const e = pool.value[idx];
          e.active = true;
          e.x = laneW * (l + 0.5);
          e.y = -80 - yOff;
          e.w = size;
          e.h = size;
          e.data = l;
        };

        put(Math.random() < 0.28 ? BANDS.high : BANDS.block, obstacleLane, 40, 0);
        if (wantsSecond) {
          put(Math.random() < 0.3 ? BANDS.high : BANDS.block, secondLane, 40, 0);
        }

        let freeLane = 0;
        for (let l = 0; l < LANES; l++) {
          if (l !== obstacleLane && (!wantsSecond || l !== secondLane)) {
            freeLane = l;
            break;
          }
        }

        const roll = Math.random();
        if (roll < 0.035) put(BANDS.shield, freeLane, 32, 0);
        else if (roll < 0.07) put(BANDS.magnet, freeLane, 32, 0);
        else if (roll < 0.095) put(BANDS.double, freeLane, 32, 0);
        else if (roll < 0.135 + luck * 0.12) put(BANDS.gem, freeLane, 30, 0);
        else for (let n = 0; n < 3; n++) put(BANDS.coin, freeLane, 25, n * 46);
      }

      // ------------------------------------------------------- movement
      const px = laneX.value;
      const jumpH = Math.sin(Math.PI * jumpT.value) * JUMP_H;
      const sliding = slideT.value > 0.05 && slideT.value < 0.95;
      const pTop = playerY - jumpH + (sliding ? playerSize * 0.45 : 0);
      const pH = sliding ? playerSize * 0.55 : playerSize;

      for (let i = 0; i < POOL; i++) {
        const e = pool.value[i];
        if (!e.active) continue;

        e.y += speed * dt;

        const collectible = i >= BANDS.coin[0];
        if (magnet.value > 0 && collectible) {
          const dx = px - e.x;
          const dy = pTop - e.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < 250) {
            e.x += (dx / d) * 540 * dt;
            e.y += (dy / d) * 280 * dt;
          }
        }

        if (e.y > height + 90) {
          e.active = false;
          continue;
        }

        const dx = Math.abs(e.x - px);
        const hitY = e.y + e.h > pTop && e.y < pTop + pH;
        if (!hitY || dx > (e.w + playerSize) * 0.42) continue;

        if (i >= BANDS.coin[0] && i < BANDS.coin[1]) {
          e.active = false;
          coins.value += doubler.value > 0 ? 2 : 1;
          runOnJS(onCoin)();
        } else if (i >= BANDS.gem[0] && i < BANDS.gem[1]) {
          e.active = false;
          gems.value += 1;
          runOnJS(onCoin)();
        } else if (i >= BANDS.shield[0]) {
          e.active = false;
          powerups.value += 1;
          if (i < BANDS.shield[1]) shield.value = 7;
          else if (i < BANDS.magnet[1]) magnet.value = 8;
          else doubler.value = 10;
          runOnJS(onPower)();
        } else {
          const isHigh = i >= BANDS.high[0] && i < BANDS.high[1];
          const cleared = isHigh ? sliding : jumpH > 34;
          if (cleared) continue;
          e.active = false;
          if (shield.value > 0) {
            shield.value = 0;
            shake.value = withSequence(
              withTiming(1, { duration: 60 }),
              withTiming(0, { duration: 240 }),
            );
            runOnJS(onHit)(true);
            runOnJS(syncPowers)();
          } else {
            alive.value = 0;
            runOnJS(onHit)(false);
            runOnJS(finish)();
          }
        }
      }
    },
    [
      alive, coins, distance, doubler, finish, frame, gems, height, jumpT, laneW, laneX,
      luck, magnet, onCoin, onHit, onPower, playerSize, playerY, pool, powerups, scroll,
      shake, shield, slideT, spawnTimer, speedMul, syncPowers,
    ],
  );

  useGameLoop(loop, !paused && !over);

  /* ---------------------------------------------------------- controls */

  const moveLane = useCallback(
    (dir: number) => {
      'worklet';
      const next = Math.max(0, Math.min(LANES - 1, lane.value + dir));
      if (next === lane.value) return;
      lane.value = next;
      laneX.value = withSpring(laneW * (next + 0.5), motion.spring);
      runOnJS(haptics.tap)();
    },
    [lane, laneW, laneX],
  );

  const doJump = useCallback(() => {
    'worklet';
    if (jumpT.value < 0.98) return;
    if (slideT.value < 0.98) return;
    jumpT.value = 0;
    jumpT.value = withTiming(1, { duration: JUMP_MS, easing: Easing.linear });
    runOnJS(haptics.press)();
  }, [jumpT, slideT]);

  const doSlide = useCallback(() => {
    'worklet';
    if (slideT.value < 0.98) return;
    slideT.value = 0;
    slideT.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
    runOnJS(haptics.tick)();
  }, [slideT]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(16)
      .onEnd((e) => {
        'worklet';
        if (Math.abs(e.translationX) > Math.abs(e.translationY)) {
          moveLane(e.translationX > 0 ? 1 : -1);
        } else if (e.translationY > 0) doSlide();
        else doJump();
      });
    const tap = Gesture.Tap()
      .maxDuration(240)
      .onEnd(() => {
        'worklet';
        doJump();
      });
    return Gesture.Exclusive(pan, tap);
  }, [doJump, doSlide, moveLane]);

  /* --------------------------------------------------------- rendering */

  const worldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shake.value * ((frame.value % 3) - 1) * 6 },
      { translateY: shake.value * ((frame.value % 5) - 2) * 3 },
    ],
  }));

  const playerStyle = useAnimatedStyle(() => {
    const jumpH = Math.sin(Math.PI * jumpT.value) * JUMP_H;
    const sliding = slideT.value > 0.05 && slideT.value < 0.95;
    return {
      transform: [
        { translateX: laneX.value - playerSize / 2 },
        { translateY: playerY - jumpH + (sliding ? playerSize * 0.4 : 0) },
        { scaleY: sliding ? 0.55 : 1 },
        { rotate: `${(laneX.value - laneW * (lane.value + 0.5)) * 0.1}deg` },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const jumpH = Math.sin(Math.PI * jumpT.value) * JUMP_H;
    return {
      opacity: 0.34 - (jumpH / JUMP_H) * 0.26,
      transform: [
        { translateX: laneX.value - playerSize / 2 },
        { translateY: playerY + playerSize * 0.9 },
        { scale: 1 - (jumpH / JUMP_H) * 0.35 },
      ],
    };
  });

  const roadStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scroll.value }],
  }));

  const shieldStyle = useAnimatedStyle(() => ({
    opacity: shield.value > 0 ? 0.5 + Math.sin(frame.value * 0.25) * 0.25 : 0,
  }));

  useEffect(() => {
    play('game.start');
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root}>
        <LinearGradient colors={['#160B2E', '#0A0A16', '#05050C']} style={StyleSheet.absoluteFill} />

        <Animated.View style={[StyleSheet.absoluteFill, worldStyle]}>
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={['rgba(124,92,255,0.12)', 'rgba(124,92,255,0.02)']}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[StyleSheet.absoluteFill, roadStyle]}>
              {Array.from({ length: Math.ceil(height / 120) + 2 }, (_, i) => (
                <View key={i} style={[styles.stripeRow, { top: i * 120 - 120 }]}>
                  {Array.from({ length: LANES - 1 }, (_, l) => (
                    <View key={l} style={[styles.stripe, { left: laneW * (l + 1) - 1.5 }]} />
                  ))}
                </View>
              ))}
            </Animated.View>
          </View>

          {Array.from({ length: POOL }, (_, i) => (
            <EntitySprite key={i} index={i} pool={pool} frame={frame} />
          ))}

          <Animated.View
            style={[
              styles.shadow,
              { width: playerSize, height: playerSize * 0.26, borderRadius: playerSize },
              shadowStyle,
            ]}
          />

          <Animated.View style={[styles.player, { width: playerSize, height: playerSize }, playerStyle]}>
            <Animated.View
              style={[
                styles.shieldRing,
                { width: playerSize * 1.5, height: playerSize * 1.5, borderRadius: playerSize },
                shieldStyle,
              ]}
            />
            {trailOn ? <View style={[styles.trail, { backgroundColor: skin.color }]} /> : null}
            <View
              style={[
                styles.avatarBody,
                {
                  width: playerSize,
                  height: playerSize,
                  borderRadius: playerSize * 0.32,
                  backgroundColor: shirtTint ?? skin.color,
                },
              ]}
            >
              <Text size={playerSize * 0.5}>{skin.glyph}</Text>
            </View>
          </Animated.View>
        </Animated.View>

        <GameHud
          onPause={requestPause}
          accent={palette.mint}
          centre={
            <View style={styles.hudCentre}>
              <LiveValue value={distance} variant="title" format={(v) => `${Math.floor(v)} m`} />
              <View style={styles.coinRow}>
                <Text size={12}>🪙</Text>
                <LiveValue value={coins} variant="label" color={palette.coin} />
                <Text size={12} style={{ marginLeft: spacing.sm }}>
                  💎
                </Text>
                <LiveValue value={gems} variant="label" color={palette.gem} />
              </View>
            </View>
          }
          right={
            <View style={styles.powerRow}>
              {powers.shield ? <Text size={15}>🛡️</Text> : null}
              {powers.magnet ? <Text size={15}>🧲</Text> : null}
              {powers.doubler ? <Text size={15}>✖️</Text> : null}
            </View>
          }
        />

        <View style={styles.hint} pointerEvents="none">
          <Text variant="caption" faint center>
            swipe to switch lane · tap to jump · swipe down to slide
          </Text>
        </View>
      </View>
    </GestureDetector>
  );
}

/* ---------------------------------------------------------- sub-views -- */

const EntitySprite = React.memo(function EntitySprite({
  index,
  pool,
  frame,
}: {
  index: number;
  pool: SharedValue<PooledEntity[]>;
  frame: SharedValue<number>;
}) {
  const band = bandOfSlot(index);
  const visual = BAND_VISUAL[band];
  const spins = band === 'coin' || band === 'gem';

  const style = useAnimatedStyle(() => {
    // Reading `frame.value` re-evaluates this style every simulated frame,
    // which is how in-place mutations of the pool become observable.
    const f = frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0, transform: [{ translateY: -999 }] };
    return {
      opacity: 1,
      width: e.w,
      height: e.h,
      transform: [
        { translateX: e.x - e.w / 2 },
        { translateY: e.y },
        { rotate: spins ? `${(f * 4) % 360}deg` : '0deg' },
      ],
    };
  });

  return (
    <Animated.View style={[styles.entity, style]} pointerEvents="none">
      <Text size={visual.size}>{visual.glyph}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  stripeRow: { position: 'absolute', left: 0, right: 0, height: 120 },
  stripe: {
    position: 'absolute',
    width: 3,
    height: 62,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  entity: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  player: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  avatarBody: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  shieldRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: palette.cyan,
    backgroundColor: 'rgba(34,211,238,0.10)',
  },
  trail: { position: 'absolute', bottom: -18, width: 8, height: 26, borderRadius: 4, opacity: 0.5 },
  shadow: { position: 'absolute', backgroundColor: '#000' },
  hudCentre: { alignItems: 'center' },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  powerRow: { flexDirection: 'row', gap: 4, marginTop: spacing.xs },
  hint: { position: 'absolute', bottom: spacing.xxl, left: 0, right: 0 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop, useEntityPool, circleHit, type PooledEntity } from '@/core/game/useGameLoop';
import { useInventoryStore } from '@/core/state/inventoryStore';
import { usePlayerStore } from '@/core/state/playerStore';
import {
  Button,
  Card,
  GameHud,
  LiveValue,
  ProgressBar,
  PressableScale,
  Sheet,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { useKeyAxis } from '@/ui/hooks/useKeyboard';
import {
  Atmosphere,
  BurstLayer,
  SignalBeacon,
  hudCardStyle,
  useValueIncrease,
  type BurstHandle,
} from './effects';
import type { ZombieSave } from './types';
import { UPGRADES, WEAPONS, normalizeZombieSave, upgradeCost } from './content';

const ZOMBIES = 26;
const BULLETS = 26;
const PICKUPS = 6;
const POOL = ZOMBIES + BULLETS + PICKUPS;
const Z0 = 0;
const B0 = ZOMBIES;
const P0 = ZOMBIES + BULLETS;

const ZOMBIE_GLYPHS = ['🧟', '🧟‍♂️', '🧟‍♀️'];

/**
 * ZOMBIE SURVIVAL
 *
 * Top-down, wave-based, auto-targeting (thumb-friendly: one stick, no fire
 * button). Simulation is a single worklet; three pooled entity bands share one
 * array so the loop is a single pass.
 *
 * Persistent upgrades are bought with coins *and* scrap — scrap that other
 * games drop. That coupling is the point: the runner funds the shotgun.
 */
export function ZombieSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width, height, s: sc } = useResponsive();
  const zSave = useMemo(() => normalizeZombieSave(save), [save]);

  const weapon = WEAPONS.find((w) => w.id === zSave.weapon) ?? WEAPONS[0];
  const up = zSave.upgrades;

  const maxHp = 100 + up.health * 20 + modifiers.armor * 25;
  const damage = weapon.damage * (1 + up.damage * 0.15);
  const fireRate = weapon.fireRate * (1 + up.fireRate * 0.08);
  const pierce = 1 + up.pierce;

  const arenaTop = sc(90);
  const arenaBottom = height - sc(150);
  const playerR = sc(18);
  // Sized down from the first pass: at sc(132) the beacon's halo covered a
  // sizeable share of the upper playfield and zombies read as "behind glass"
  // while crossing it. Smaller keeps the set-piece without competing with the
  // entities the player is actually tracking.
  const signalSize = sc(104);

  /**
   * Every scaled length the simulation needs is resolved *here*, on the JS
   * thread, and captured as a plain number.
   *
   * `sc` comes from `useResponsive` and is an ordinary JS closure. A worklet
   * that captures a non-worklet function receives it as a RemoteFunction, and
   * calling one synchronously on the UI thread throws
   * "[Worklets] Tried to synchronously call a non-worklet function" — which
   * kills the frame callback and takes the screen down with it. Every other
   * game in PocketVerse precomputes for exactly this reason.
   */
  const zombieSize = sc(26);
  const zombieSpeed = sc(48);
  const zombieSpeedJitter = sc(26);
  const zombieWaveSpeed = sc(2.4);
  const bulletSize = sc(8);
  const pickupSize = sc(20);
  const magnetRadius = sc(90);
  const magnetPull = sc(220);

  /* ------------------------------------------------------ shared state */
  const pool = useEntityPool(POOL);
  const frame = useSharedValue(0);
  const px = useSharedValue(width / 2);
  const py = useSharedValue((arenaTop + arenaBottom) / 2);
  const dirX = useSharedValue(0);
  const dirY = useSharedValue(0);
  const hp = useSharedValue(maxHp);
  const kills = useSharedValue(0);
  const wave = useSharedValue(1);
  const waveRemaining = useSharedValue(0);
  const fireTimer = useSharedValue(0);
  const spawnTimer = useSharedValue(1);
  const alive = useSharedValue(1);
  const hurtFlash = useSharedValue(0);
  const scrapCollected = useSharedValue(0);

  const [over, setOver] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [waveDisplay, setWaveDisplay] = useState(1);

  const speed = sc(215) * (1 + modifiers.speed * 0.5);

  /* -------------------------------------------------------- callbacks */

  const onShoot = useCallback(() => play('game.hit'), []);
  const onKill = useCallback(() => {
    haptics.tick();
    play('game.collect');
  }, []);
  const onHurt = useCallback(() => {
    haptics.heavy();
    play('game.hit');
  }, []);

  /**
   * Presentation-only signal state. The beacon polls this and clears it; the
   * simulation never reads it, and bumping it here rather than in the worklet
   * means the game loop is untouched by the visual layer.
   */
  const waveBurst = useSharedValue(0);
  const bursts = useRef<BurstHandle | null>(null);

  const startWave = useCallback(
    (n: number) => {
      setWaveDisplay(n);
      waveBurst.value = 1;
      haptics.press();
    },
    [waveBurst],
  );

  const finish = useCallback(() => {
    setOver((already) => {
      if (already) return already;
      const k = Math.floor(kills.value);
      const w = Math.floor(wave.value);
      const score = k * 10 + w * 120;

      setSave((raw: unknown) => {
        const prev = normalizeZombieSave(raw);
        return {
          ...prev,
          bestWave: Math.max(prev.bestWave, w),
          totalKills: prev.totalKills + k,
          runs: prev.runs + 1,
        };
      });

      onFinish({
        score,
        outcome: 'lose',
        metrics: { zombies_killed: k, waves_cleared: Math.max(0, w - 1) },
        reward: {
          coins: Math.round(k * 7 + w * 55),
          xp: Math.round(30 + k * 2.2 + w * 12),
          items: {
            mat_scrap: Math.max(1, Math.floor(scrapCollected.value)),
            ...(w >= 8 ? { mat_core: 1 } : w >= 4 ? { mat_circuit: 1 } : {}),
          },
        },
        breakdown: [
          { label: 'Waves cleared', value: `${Math.max(0, w - 1)}` },
          { label: 'Kills', value: `${k}` },
          { label: 'Weapon', value: weapon.name },
        ],
      });
      return true;
    });
  }, [kills, onFinish, scrapCollected, setSave, wave, weapon.name]);

  /* -------------------------------------------------------- game loop */

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      frame.value += 1;

      // ------------------------------------------------------ movement
      const len = Math.sqrt(dirX.value * dirX.value + dirY.value * dirY.value);
      if (len > 0.08) {
        px.value = Math.max(
          playerR,
          Math.min(width - playerR, px.value + (dirX.value / len) * speed * dt),
        );
        py.value = Math.max(
          arenaTop + playerR,
          Math.min(arenaBottom - playerR, py.value + (dirY.value / len) * speed * dt),
        );
      }

      // ------------------------------------------------------- spawning
      if (waveRemaining.value > 0) {
        spawnTimer.value -= dt;
        if (spawnTimer.value <= 0) {
          spawnTimer.value = Math.max(0.16, 0.85 - wave.value * 0.05);
          for (let i = Z0; i < Z0 + ZOMBIES; i++) {
            const e = pool.value[i];
            if (e.active) continue;
            const side = Math.floor(Math.random() * 4);
            e.active = true;
            e.x = side === 0 ? -30 : side === 1 ? width + 30 : Math.random() * width;
            e.y =
              side === 2
                ? arenaTop - 30
                : side === 3
                  ? arenaBottom + 30
                  : arenaTop + Math.random() * (arenaBottom - arenaTop);
            e.w = zombieSize;
            e.h = zombieSize;
            // hp scales with wave; data holds current hp, data2 the max
            e.data = 22 + wave.value * 9;
            e.data2 = e.data;
            e.vx =
              zombieSpeed + Math.random() * zombieSpeedJitter + wave.value * zombieWaveSpeed;
            waveRemaining.value -= 1;
            break;
          }
        }
      }

      // -------------------------------------------------------- firing
      fireTimer.value -= dt;
      if (fireTimer.value <= 0) {
        // acquire nearest target
        let best = -1;
        let bestD = 1e9;
        for (let i = Z0; i < Z0 + ZOMBIES; i++) {
          const z = pool.value[i];
          if (!z.active) continue;
          const dx = z.x - px.value;
          const dy = z.y - py.value;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0) {
          fireTimer.value = 1 / fireRate;
          const t = pool.value[best];
          const base = Math.atan2(t.y - py.value, t.x - px.value);
          for (let p = 0; p < weapon.pellets; p++) {
            for (let i = B0; i < B0 + BULLETS; i++) {
              const b = pool.value[i];
              if (b.active) continue;
              const off =
                weapon.pellets > 1
                  ? (p / (weapon.pellets - 1) - 0.5) * weapon.spread
                  : (Math.random() - 0.5) * weapon.spread;
              const a = base + off;
              b.active = true;
              b.x = px.value;
              b.y = py.value;
              b.vx = Math.cos(a) * weapon.speed;
              b.vy = Math.sin(a) * weapon.speed;
              b.w = bulletSize;
              b.h = bulletSize;
              b.data = pierce;
              break;
            }
          }
          runOnJS(onShoot)();
        }
      }

      // ------------------------------------------------------- bullets
      for (let i = B0; i < B0 + BULLETS; i++) {
        const b = pool.value[i];
        if (!b.active) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -40 || b.x > width + 40 || b.y < arenaTop - 40 || b.y > arenaBottom + 40) {
          b.active = false;
          continue;
        }
        for (let j = Z0; j < Z0 + ZOMBIES; j++) {
          const z = pool.value[j];
          if (!z.active) continue;
          if (!circleHit(b.x, b.y, b.w / 2, z.x, z.y, z.w / 2)) continue;
          z.data -= damage;
          b.data -= 1;
          if (z.data <= 0) {
            z.active = false;
            kills.value += 1;
            runOnJS(onKill)();
            // scrap drop
            if (Math.random() < 0.22 + modifiers.luck * 0.2) {
              for (let k = P0; k < P0 + PICKUPS; k++) {
                const p = pool.value[k];
                if (p.active) continue;
                p.active = true;
                p.x = z.x;
                p.y = z.y;
                p.w = pickupSize;
                p.h = pickupSize;
                p.data = 8; // seconds before it disappears
                break;
              }
            }
          }
          if (b.data <= 0) {
            b.active = false;
            break;
          }
        }
      }

      // ------------------------------------------------------- zombies
      let liveZombies = 0;
      for (let i = Z0; i < Z0 + ZOMBIES; i++) {
        const z = pool.value[i];
        if (!z.active) continue;
        liveZombies += 1;
        const dx = px.value - z.x;
        const dy = py.value - z.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        z.x += (dx / d) * z.vx * dt;
        z.y += (dy / d) * z.vx * dt;

        if (d < playerR + z.w / 2) {
          z.active = false;
          hp.value -= 9 + wave.value * 1.5;
          hurtFlash.value = withSequence(
            withTiming(1, { duration: 60 }),
            withTiming(0, { duration: 320 }),
          );
          runOnJS(onHurt)();
          if (hp.value <= 0) {
            alive.value = 0;
            runOnJS(finish)();
            return;
          }
        }
      }

      // ------------------------------------------------------- pickups
      for (let i = P0; i < P0 + PICKUPS; i++) {
        const p = pool.value[i];
        if (!p.active) continue;
        p.data -= dt;
        if (p.data <= 0) {
          p.active = false;
          continue;
        }
        const dx = px.value - p.x;
        const dy = py.value - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < magnetRadius) {
          p.x += (dx / d) * magnetPull * dt;
          p.y += (dy / d) * magnetPull * dt;
        }
        if (d < playerR + p.w / 2) {
          p.active = false;
          scrapCollected.value += 1;
          hp.value = Math.min(maxHp, hp.value + 4);
        }
      }

      // ---------------------------------------------------- wave logic
      if (waveRemaining.value <= 0 && liveZombies === 0) {
        wave.value += 1;
        waveRemaining.value = 6 + Math.floor(wave.value * 1.8);
        hp.value = Math.min(maxHp, hp.value + maxHp * 0.15);
        runOnJS(startWave)(wave.value);
      }
    },
    [
      alive, arenaBottom, arenaTop, bulletSize, damage, dirX, dirY, finish, fireRate,
      fireTimer, frame, hp, hurtFlash, kills, magnetPull, magnetRadius, maxHp,
      modifiers.luck, onHurt, onKill, onShoot, pickupSize, pierce, playerR, pool, px, py,
      scrapCollected, spawnTimer, speed, startWave, wave, waveRemaining, weapon.pellets,
      weapon.speed, weapon.spread, width, zombieSize, zombieSpeed, zombieSpeedJitter,
      zombieWaveSpeed,
    ],
  );

  useGameLoop(loop, !paused && !over && !showShop);

  // kick off wave 1
  useEffect(() => {
    waveRemaining.value = 8;
    play('game.start');
  }, [waveRemaining]);

  /* --------------------------------------------------------- controls */

  /**
   * Desktop movement. The virtual stick below still works with a mouse, but
   * holding a button down to steer a twin-stick shooter is miserable, so WASD
   * and the arrow keys write the same direction the stick does.
   *
   * This runs on the JS thread and only assigns to shared values — it never
   * enters the simulation worklet, which is the one thing this file must not
   * get wrong (see the `sc()` note above the scaled constants).
   */
  const onKeyAxis = useCallback(
    (x: number, y: number) => {
      dirX.value = x;
      dirY.value = y;
    },
    [dirX, dirY],
  );
  useKeyAxis(!paused && !over && !showShop, onKeyAxis);

  /**
   * A collection burst at the player, driven by watching the existing scrap
   * counter rise. Deliberately observational: the pickup logic, its collection
   * calculation and the reward path are verified working and are not touched,
   * called or wrapped by any of this.
   */
  useValueIncrease(
    scrapCollected,
    useCallback(() => {
      bursts.current?.fire(px.value, py.value, palette.gold);
      bursts.current?.fire(px.value, py.value, palette.mint);
    }, [px, py]),
    !over,
  );

  const stickBase = useSharedValue({ x: 0, y: 0 });
  const stickPos = useSharedValue({ x: 0, y: 0 });
  const stickActive = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          'worklet';
          stickBase.value = { x: e.x, y: e.y };
          stickPos.value = { x: e.x, y: e.y };
          stickActive.value = 1;
        })
        .onUpdate((e) => {
          'worklet';
          const dx = e.x - stickBase.value.x;
          const dy = e.y - stickBase.value.y;
          const max = 58;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const cl = Math.min(1, d / max);
          dirX.value = (dx / d) * cl;
          dirY.value = (dy / d) * cl;
          stickPos.value = {
            x: stickBase.value.x + (dx / d) * Math.min(d, max),
            y: stickBase.value.y + (dy / d) * Math.min(d, max),
          };
        })
        .onEnd(() => {
          'worklet';
          dirX.value = 0;
          dirY.value = 0;
          stickActive.value = 0;
        }),
    [dirX, dirY, stickActive, stickBase, stickPos],
  );

  /* -------------------------------------------------------- rendering */

  const playerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: px.value - playerR }, { translateY: py.value - playerR }],
  }));

  const hurtStyle = useAnimatedStyle(() => ({ opacity: hurtFlash.value * 0.4 }));

  const stickOuter = useAnimatedStyle(() => ({
    opacity: stickActive.value ? 0.5 : 0,
    transform: [{ translateX: stickBase.value.x - 58 }, { translateY: stickBase.value.y - 58 }],
  }));
  const stickInner = useAnimatedStyle(() => ({
    opacity: stickActive.value ? 0.85 : 0,
    transform: [{ translateX: stickPos.value.x - 26 }, { translateY: stickPos.value.y - 26 }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root}>
        <LinearGradient colors={['#160C18', '#0B0912', '#040407']} style={StyleSheet.absoluteFill} />
        <View style={[styles.arena, { top: arenaTop, height: arenaBottom - arenaTop }]} />

        {/* depth behind the play space — grid, drifting fog, vignette */}
        <Atmosphere
          width={width}
          top={arenaTop}
          height={arenaBottom - arenaTop}
          accent={palette.cyan}
        />

        {/* the namesake, purely decorative — no hitbox, no interaction */}
        <SignalBeacon
          x={width / 2}
          y={arenaTop + (arenaBottom - arenaTop) * 0.26}
          size={signalSize}
          px={px}
          py={py}
          hp={hp}
          maxHp={maxHp}
          alive={alive}
          burst={waveBurst}
        />

        {Array.from({ length: POOL }, (_, i) => (
          <ZEntity key={i} index={i} pool={pool} frame={frame} />
        ))}

        <Animated.View
          style={[styles.player, { width: playerR * 2, height: playerR * 2, borderRadius: playerR }, playerStyle]}
        >
          {/* a lit base so the player never loses contrast against the fog */}
          <View
            style={[
              styles.playerGlow,
              { width: playerR * 3.1, height: playerR * 3.1, borderRadius: playerR * 2 },
            ]}
          />
          <View
            style={[
              styles.playerRing,
              { width: playerR * 2.1, height: playerR * 2.1, borderRadius: playerR * 1.4 },
            ]}
          />
          <Text size={playerR * 1.4}>🧑‍🚀</Text>
        </Animated.View>

        <BurstLayer handle={bursts} />

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.hurt, hurtStyle]} />
        <Animated.View pointerEvents="none" style={[styles.stickOuter, stickOuter]} />
        <Animated.View pointerEvents="none" style={[styles.stickInner, stickInner]} />

        <GameHud
          onPause={requestPause}
          accent={palette.coral}
          centre={
            <View style={styles.hudCentre}>
              <View style={hudCardStyle}>
                <Text variant="micro" color={palette.coral}>
                  WAVE {waveDisplay}
                </Text>
              </View>
              <LiveValue value={kills} variant="title" format={(v) => `${Math.floor(v)} kills`} />
              <View style={styles.scrapRow}>
                <Text size={11}>🔩</Text>
                <LiveValue
                  value={scrapCollected}
                  variant="micro"
                  color={palette.gold}
                  format={(v) => `${Math.floor(v)}`}
                />
              </View>
            </View>
          }
          right={<Text size={16}>{weapon.glyph}</Text>}
        />

        <View style={styles.hpBar}>
          <HealthBar hp={hp} max={maxHp} />
        </View>

        <View style={styles.shopBtn}>
          <Button
            label="Workshop"
            icon="🔧"
            size="sm"
            variant="secondary"
            onPress={() => setShowShop(true)}
          />
        </View>

        <UpgradeSheet
          visible={showShop}
          onClose={() => setShowShop(false)}
          save={zSave}
          setSave={setSave}
        />
      </View>
    </GestureDetector>
  );
}

/* ---------------------------------------------------------- sub-views -- */

const ZEntity = React.memo(function ZEntity({
  index,
  pool,
  frame,
}: {
  index: number;
  pool: SharedValue<PooledEntity[]>;
  frame: SharedValue<number>;
}) {
  const isZombie = index < B0;
  const isBullet = index >= B0 && index < P0;
  const glyph = isZombie ? ZOMBIE_GLYPHS[index % 3] : isBullet ? '' : '🔩';

  const style = useAnimatedStyle(() => {
    frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0, transform: [{ translateY: -999 }] };
    return {
      opacity: 1,
      width: e.w,
      height: e.h,
      transform: [{ translateX: e.x - e.w / 2 }, { translateY: e.y - e.h / 2 }],
    };
  });

  if (isBullet) {
    return <Animated.View pointerEvents="none" style={[styles.bullet, style]} />;
  }

  // Scrap gets a lit halo and a slow bob so it reads as valuable against the
  // fog. Purely visual — position and collection still come from the pool.
  if (!isZombie) {
    return (
      <Animated.View pointerEvents="none" style={[styles.entity, style]}>
        <View style={styles.scrapGlow} />
        <View style={styles.scrapRing} />
        <Text size={15}>{glyph}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.entity, style]}>
      <View style={styles.zombieShadow} />
      <Text size={22}>{glyph}</Text>
    </Animated.View>
  );
});

const HealthBar = React.memo(function HealthBar({
  hp,
  max,
}: {
  hp: SharedValue<number>;
  max: number;
}) {
  const [v, setV] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setV(Math.max(0, hp.value / max)), 120);
    return () => clearInterval(id);
  }, [hp, max]);
  return (
    <View>
      <ProgressBar value={v} height={10} gradient={[palette.coral, '#8B1E3F']} />
      <Text variant="micro" muted center style={{ marginTop: 4 }}>
        {Math.round(v * max)} / {max} HP
      </Text>
    </View>
  );
});

const UpgradeSheet = React.memo(function UpgradeSheet({
  visible,
  onClose,
  save,
  setSave,
}: {
  visible: boolean;
  onClose: () => void;
  save: ZombieSave;
  setSave: GameSurfaceProps['setSave'];
}) {
  const coins = usePlayerStore((s) => s.player.coins);
  const scrap = useInventoryStore((s) => s.entries['mat_scrap']?.qty ?? 0);

  const buy = useCallback(
    (key: keyof ZombieSave['upgrades'], baseCost: number, scrapCost: number, max: number) => {
      const level = save.upgrades[key];
      if (level >= max) return;
      const cost = upgradeCost(baseCost, level);
      const player = usePlayerStore.getState();
      const inv = useInventoryStore.getState();
      if (player.player.coins < cost || (inv.entries['mat_scrap']?.qty ?? 0) < scrapCost) {
        haptics.warn();
        return;
      }
      player.spendCoins(cost);
      inv.remove('mat_scrap', scrapCost);
      setSave((raw: unknown) => {
        const prev = normalizeZombieSave(raw);
        return { ...prev, upgrades: { ...prev.upgrades, [key]: prev.upgrades[key] + 1 } };
      });
      haptics.success();
      play('reward.chest');
    },
    [save.upgrades, setSave],
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Workshop" subtitle="Permanent upgrades — they persist between runs">
      <View style={styles.balances}>
        <Text variant="label" color={palette.coin}>
          🪙 {coins}
        </Text>
        <Text variant="label" color={palette.textMuted}>
          🔩 {scrap} scrap
        </Text>
      </View>

      {UPGRADES.map((u) => {
        const level = save.upgrades[u.key];
        const maxed = level >= u.max;
        const cost = upgradeCost(u.baseCost, level);
        return (
          <PressableScale
            key={u.key}
            onPress={() => buy(u.key, u.baseCost, u.scrap, u.max)}
            disabled={maxed}
            style={[styles.upgradeRow, maxed && { opacity: 0.5 }]}
            scaleTo={0.98}
          >
            <Text size={22}>{u.glyph}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">
                {u.name} · Lv {level}
              </Text>
              <Text variant="caption" muted>
                {u.desc}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="label" color={palette.coin}>
                {maxed ? 'MAX' : `${cost} 🪙`}
              </Text>
              {!maxed ? (
                <Text variant="caption" muted>
                  {u.scrap} 🔩
                </Text>
              ) : null}
            </View>
          </PressableScale>
        );
      })}

      <Card variant="glass" style={{ marginTop: spacing.lg }} padding={spacing.md}>
        <Text variant="caption" muted>
          Scrap drops here, but also from driving, fishing and the arcade. Everything
          you collect anywhere funds everything you build anywhere.
        </Text>
      </Card>

      <Button label="Back to the fight" onPress={onClose} full style={{ marginTop: spacing.lg }} />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  arena: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,77,77,0.25)',
  },
  entity: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bullet: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: palette.gold,
    // A tracer read, so a stream of shots is legible as a line of fire.
    shadowColor: palette.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  player: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  playerGlow: { position: 'absolute', backgroundColor: palette.cyan, opacity: 0.12 },
  playerRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: palette.cyan,
    opacity: 0.55,
  },
  zombieShadow: {
    position: 'absolute',
    bottom: -2,
    width: 18,
    height: 5,
    borderRadius: 9,
    backgroundColor: '#000',
    opacity: 0.45,
  },
  scrapGlow: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.gold,
    opacity: 0.22,
  },
  scrapRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.gold,
    opacity: 0.7,
  },
  hurt: { backgroundColor: palette.coral },
  hudCentre: { alignItems: 'center', gap: 2 },
  scrapRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hpBar: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.huge },
  shopBtn: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  stickOuter: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  stickInner: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  balances: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
    marginBottom: spacing.sm,
  },
});

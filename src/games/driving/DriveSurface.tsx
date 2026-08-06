import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop, useEntityPool, type PooledEntity } from '@/core/game/useGameLoop';
import { GameHud, LiveValue, ProgressBar, Text, haptics, palette, spacing, useResponsive, play } from '@/ui';
import type { DrivingSave } from './types';
import { CARS, MISSIONS } from './content';

/* --------------------------------------------------------- procedural -- */

/**
 * The road is generated, not authored: a sum of three sines over the travelled
 * distance, seeded per run. Because it is a pure function of `z`, every visual
 * slice and every entity can independently ask "where is the road at this
 * depth?" without storing a track — no allocation, no level data, infinite road.
 */
function roadCenter(z: number, seed: number, amp: number): number {
  'worklet';
  return (
    Math.sin(z * 0.0013 + seed) * amp +
    Math.sin(z * 0.00042 + seed * 2.3) * amp * 0.75 +
    Math.sin(z * 0.0031 + seed * 0.7) * amp * 0.22
  );
}

function roadHalfWidth(z: number, seed: number, base: number): number {
  'worklet';
  return base * (0.86 + Math.sin(z * 0.0008 + seed * 1.7) * 0.14);
}

const SLICES = 26;
const TRAFFIC = [0, 8] as const;
const PICKUP = [8, 20] as const;
const HAZARD = [20, 24] as const;
const POOL = 24;

const BASE_SPEED = 520;
const MAX_SPEED = 1900;

/**
 * ENDLESS DRIVING
 *
 * Same worklet-simulation architecture as the runner, but continuous steering
 * instead of lanes, and a procedurally curving road. Cars are shared-inventory
 * items: buying `car_sport` in the store changes the physics here.
 */
export function DriveSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
  grant,
}: GameSurfaceProps) {
  const { width, height, s: sc } = useResponsive();
  const driveSave = save as DrivingSave;

  const car = CARS.find((c) => c.id === driveSave.car) ?? CARS[0];
  const mission = MISSIONS[Math.min(driveSave.missionIndex, MISSIONS.length - 1)];

  const seed = useMemo(() => Math.random() * 100, []);
  const ampPx = width * 0.26;
  const halfBase = width * 0.34;
  const carSize = sc(52);
  const carY = height * 0.74;

  /* ------------------------------------------------------ shared state */
  const pool = useEntityPool(POOL);
  const frame = useSharedValue(0);
  const z = useSharedValue(0); // travelled depth in px
  const distance = useSharedValue(0); // metres
  const carX = useSharedValue(width / 2);
  const targetX = useSharedValue(width / 2);
  const speed = useSharedValue(BASE_SPEED);
  const coins = useSharedValue(0);
  const nearMiss = useSharedValue(0);
  const hits = useSharedValue(0);
  const offroad = useSharedValue(0);
  const spawnTimer = useSharedValue(0.6);
  const alive = useSharedValue(1);
  const shake = useSharedValue(0);
  const missionValue = useSharedValue(0);

  const [over, setOver] = useState(false);
  const [missionDone, setMissionDone] = useState(false);

  const speedMul = car.stats.speed * (1 + modifiers.speed);
  const handling = car.stats.handling;
  const grip = car.stats.grip;

  /* ---------------------------------------------------- JS callbacks -- */

  const onCoin = useCallback(() => {
    haptics.collect();
    play('game.collect');
  }, []);

  const onNear = useCallback(() => haptics.tick(), []);

  const onCrash = useCallback(() => {
    haptics.fail();
    play('game.crash');
  }, []);

  const completeMission = useCallback(() => {
    if (missionDone) return;
    setMissionDone(true);
    haptics.success();
    grant(
      {
        coins: mission.reward.coins,
        xp: mission.reward.xp,
        gems: mission.reward.gems,
        unlocks: mission.reward.unlock ? [mission.reward.unlock] : undefined,
      },
      `Mission: ${mission.title}`,
    );
    setSave((prev: DrivingSave) => ({
      ...prev,
      missionIndex: Math.min(prev.missionIndex + 1, MISSIONS.length - 1),
      missionsCompleted: prev.missionsCompleted + 1,
      unlockedCars: mission.reward.unlock
        ? [...new Set([...prev.unlockedCars, mission.reward.unlock])]
        : prev.unlockedCars,
    }));
  }, [grant, mission, missionDone, setSave]);

  const finish = useCallback(() => {
    setOver((already) => {
      if (already) return already;
      const dist = Math.floor(distance.value);
      const c = Math.floor(coins.value);
      const nm = Math.floor(nearMiss.value);
      const score = dist + c * 10 + nm * 25;

      setSave((prev: DrivingSave) => ({
        ...prev,
        runs: prev.runs + 1,
        bestDistance: Math.max(prev.bestDistance, dist),
        totalDistance: prev.totalDistance + dist,
      }));

      onFinish({
        score,
        outcome: 'lose',
        metrics: {
          drive_distance: dist,
          drive_near_miss: nm,
          drive_missions: missionDone ? 1 : 0,
        },
        reward: {
          coins: Math.round(c * 4 + dist * 0.2 + nm * 6),
          xp: Math.round(24 + dist * 0.08 + nm * 2),
          items: dist > 2000 ? { mat_core: 1 } : dist > 800 ? { mat_circuit: 1 } : { mat_scrap: 2 },
        },
        breakdown: [
          { label: 'Distance', value: `${dist} m` },
          { label: 'Coins', value: `${c}` },
          { label: 'Near misses', value: `${nm}` },
          { label: 'Mission', value: missionDone ? 'complete' : 'in progress' },
        ],
      });
      return true;
    });
  }, [coins, distance, missionDone, nearMiss, onFinish, setSave]);

  /* -------------------------------------------------------- game loop */

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1) return;
      frame.value += 1;

      const off = offroad.value > 0.5 ? 0.45 : 1;
      const target = Math.min(MAX_SPEED, BASE_SPEED + distance.value * 0.16) * speedMul * off;
      speed.value += (target - speed.value) * Math.min(1, dt * 2.4);

      z.value += speed.value * dt;
      distance.value += (speed.value * dt) / 24;

      // steering — exponential approach gives weight without lag
      carX.value += (targetX.value - carX.value) * Math.min(1, dt * 9 * handling);

      // off-road check against the generated road
      const centre = width / 2 + roadCenter(z.value, seed, ampPx);
      const half = roadHalfWidth(z.value, seed, halfBase);
      const outBy = Math.abs(carX.value - centre) - half + carSize * 0.35;
      offroad.value = outBy > 0 ? 1 : 0;
      if (outBy > half * 0.9 * grip) {
        alive.value = 0;
        runOnJS(onCrash)();
        runOnJS(finish)();
        return;
      }

      // ------------------------------------------------------ spawning
      spawnTimer.value -= dt;
      if (spawnTimer.value <= 0) {
        const difficulty = Math.min(1, distance.value / 3000);
        spawnTimer.value = Math.max(0.3, 0.72 - difficulty * 0.36);

        const put = (band: readonly [number, number], nx: number, size: number, vy: number) => {
          'worklet';
          for (let i = band[0]; i < band[1]; i++) {
            if (pool.value[i].active) continue;
            const e = pool.value[i];
            e.active = true;
            e.x = nx; // normalised road-space position, -1..1
            e.y = -100;
            e.w = size;
            e.h = size;
            e.vy = vy;
            e.data = 0;
            e.data2 = 0;
            return;
          }
        };

        put(TRAFFIC, (Math.random() * 1.5 - 0.75), 46, -80 - Math.random() * 120);
        if (Math.random() < difficulty * 0.6) {
          put(TRAFFIC, (Math.random() * 1.5 - 0.75), 46, -60 - Math.random() * 140);
        }
        if (Math.random() < 0.55 + modifiers.luck * 0.15) {
          put(PICKUP, Math.random() * 1.4 - 0.7, 26, 0);
        }
        if (Math.random() < difficulty * 0.35) {
          put(HAZARD, Math.random() * 1.4 - 0.7, 34, 0);
        }
      }

      // ------------------------------------------------------- entities
      for (let i = 0; i < POOL; i++) {
        const e = pool.value[i];
        if (!e.active) continue;

        // traffic moves with the world plus its own (slower) velocity
        e.y += (speed.value + e.vy) * dt;

        if (e.y > height + 120) {
          e.active = false;
          continue;
        }

        // screen position derives from the road at this entity's depth
        const depth = z.value - (e.y - carY);
        const ex = width / 2 + roadCenter(depth, seed, ampPx) + e.x * roadHalfWidth(depth, seed, halfBase);

        const dx = Math.abs(ex - carX.value);
        const dy = Math.abs(e.y - carY);
        const hit = dx < (e.w + carSize) * 0.4 && dy < (e.h + carSize) * 0.42;

        if (i < TRAFFIC[1]) {
          if (hit) {
            e.active = false;
            hits.value += 1;
            alive.value = 0;
            runOnJS(onCrash)();
            runOnJS(finish)();
            return;
          }
          // near miss: passed the car closely without touching
          if (e.data2 < 1 && dy < carSize * 0.9 && dx < carSize * 1.35) {
            e.data2 = 1;
            nearMiss.value += 1;
            if (mission.kind === 'nearMiss') missionValue.value = nearMiss.value;
            runOnJS(onNear)();
          }
        } else if (i < PICKUP[1]) {
          if (hit) {
            e.active = false;
            coins.value += 1;
            if (mission.kind === 'coins') missionValue.value = coins.value;
            runOnJS(onCoin)();
          }
        } else if (hit) {
          e.active = false;
          speed.value *= 0.45;
          shake.value = withSequence(
            withTiming(1, { duration: 70 }),
            withTiming(0, { duration: 260 }),
          );
          runOnJS(haptics.heavy)();
        }
      }

      // ------------------------------------------------------- mission
      if (mission.kind === 'distance' || mission.kind === 'noHit') {
        missionValue.value = hits.value > 0 && mission.kind === 'noHit' ? 0 : distance.value;
      }
      if (missionValue.value >= mission.target) {
        runOnJS(completeMission)();
      }
    },
    [
      alive, ampPx, carSize, carX, carY, coins, completeMission, distance, finish, frame,
      grip, halfBase, handling, height, hits, mission, missionValue, modifiers.luck,
      nearMiss, offroad, onCoin, onCrash, onNear, pool, seed, shake, spawnTimer, speed,
      speedMul, targetX, width, z,
    ],
  );

  useGameLoop(loop, !paused && !over);

  /* ---------------------------------------------------------- controls */

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onChange((e) => {
          'worklet';
          targetX.value = Math.max(
            carSize * 0.4,
            Math.min(width - carSize * 0.4, targetX.value + e.changeX * 1.5),
          );
        })
        .onStart(() => {
          'worklet';
          targetX.value = carX.value;
        }),
    [carSize, carX, targetX, width],
  );

  /* --------------------------------------------------------- rendering */

  const worldStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value * ((frame.value % 3) - 1) * 7 }],
  }));

  const carStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: carX.value - carSize / 2 },
      { translateY: carY },
      { rotate: `${Math.max(-16, Math.min(16, (targetX.value - carX.value) * 0.25))}deg` },
    ],
  }));

  const offroadStyle = useAnimatedStyle(() => ({ opacity: offroad.value * 0.35 }));

  useEffect(() => {
    play('game.start');
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root}>
        <LinearGradient colors={['#0B1230', '#0A0A16', '#050509']} style={StyleSheet.absoluteFill} />

        <Animated.View style={[StyleSheet.absoluteFill, worldStyle]}>
          {/* procedural road slices */}
          {Array.from({ length: SLICES }, (_, i) => (
            <RoadSlice
              key={i}
              index={i}
              slices={SLICES}
              z={z}
              frame={frame}
              seed={seed}
              amp={ampPx}
              halfBase={halfBase}
              width={width}
              height={height}
              carY={carY}
            />
          ))}

          {Array.from({ length: POOL }, (_, i) => (
            <DriveEntity
              key={i}
              index={i}
              pool={pool}
              frame={frame}
              z={z}
              seed={seed}
              amp={ampPx}
              halfBase={halfBase}
              width={width}
              carY={carY}
            />
          ))}

          <Animated.View style={[styles.car, { width: carSize, height: carSize }, carStyle]}>
            <Text size={carSize * 0.8}>{car.glyph}</Text>
          </Animated.View>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.offroad, offroadStyle]}
        />

        <GameHud
          onPause={requestPause}
          accent={palette.sky}
          centre={
            <View style={styles.hudCentre}>
              <LiveValue value={distance} variant="title" format={(v) => `${Math.floor(v)} m`} />
              <View style={styles.row}>
                <Text size={12}>🪙</Text>
                <LiveValue value={coins} variant="label" color={palette.coin} />
                <Text size={12} style={{ marginLeft: spacing.sm }}>
                  ⚡
                </Text>
                <LiveValue
                  value={speed}
                  variant="label"
                  color={palette.mint}
                  format={(v) => `${Math.round(v / 6)} kph`}
                />
              </View>
            </View>
          }
        />

        {/* mission banner */}
        <View style={[styles.mission, { bottom: spacing.xxl }]} pointerEvents="none">
          <Text variant="micro" color={palette.amber}>
            MISSION {missionDone ? '· COMPLETE' : ''}
          </Text>
          <Text variant="label">{mission.title}</Text>
          <Text variant="caption" muted>
            {mission.description}
          </Text>
          <MissionBar value={missionValue} target={mission.target} />
        </View>
      </View>
    </GestureDetector>
  );
}

/* ---------------------------------------------------------- sub-views -- */

const RoadSlice = React.memo(function RoadSlice({
  index,
  slices,
  z,
  frame,
  seed,
  amp,
  halfBase,
  width,
  height,
  carY,
}: {
  index: number;
  slices: number;
  z: SharedValue<number>;
  frame: SharedValue<number>;
  seed: number;
  amp: number;
  halfBase: number;
  width: number;
  height: number;
  carY: number;
}) {
  const sliceH = height / slices + 2;
  const y = index * (height / slices);

  const style = useAnimatedStyle(() => {
    frame.value;
    const depth = z.value - (y - carY);
    const centre = width / 2 + roadCenter(depth, seed, amp);
    const half = roadHalfWidth(depth, seed, halfBase);
    return {
      transform: [{ translateX: centre - half }],
      width: half * 2,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.slice, { top: y, height: sliceH }, style]}
    >
      <View style={styles.sliceFill} />
      <View style={styles.sliceEdgeL} />
      <View style={styles.sliceEdgeR} />
      {index % 3 === 0 ? <View style={styles.sliceDash} /> : null}
    </Animated.View>
  );
});

const DriveEntity = React.memo(function DriveEntity({
  index,
  pool,
  frame,
  z,
  seed,
  amp,
  halfBase,
  width,
  carY,
}: {
  index: number;
  pool: SharedValue<PooledEntity[]>;
  frame: SharedValue<number>;
  z: SharedValue<number>;
  seed: number;
  amp: number;
  halfBase: number;
  width: number;
  carY: number;
}) {
  const glyph =
    index < TRAFFIC[1] ? ['🚙', '🚕', '🚌', '🛻'][index % 4] : index < PICKUP[1] ? '🪙' : '🛢️';
  const size = index < TRAFFIC[1] ? 44 : index < PICKUP[1] ? 24 : 30;

  const style = useAnimatedStyle(() => {
    frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0, transform: [{ translateY: -999 }] };
    const depth = z.value - (e.y - carY);
    const ex = width / 2 + roadCenter(depth, seed, amp) + e.x * roadHalfWidth(depth, seed, halfBase);
    return {
      opacity: 1,
      transform: [{ translateX: ex - e.w / 2 }, { translateY: e.y }],
      width: e.w,
      height: e.h,
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.entity, style]}>
      <Text size={size}>{glyph}</Text>
    </Animated.View>
  );
});

const MissionBar = React.memo(function MissionBar({
  value,
  target,
}: {
  value: SharedValue<number>;
  target: number;
}) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPct(Math.min(1, value.value / target)), 200);
    return () => clearInterval(id);
  }, [target, value]);
  return <ProgressBar value={pct} height={5} gradient={[palette.amber, palette.gold]} style={{ marginTop: 6 }} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  slice: { position: 'absolute', left: 0 },
  sliceFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.045)' },
  sliceEdgeL: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(124,92,255,0.55)' },
  sliceEdgeR: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(124,92,255,0.55)' },
  sliceDash: {
    position: 'absolute',
    alignSelf: 'center',
    width: 4,
    top: 4,
    bottom: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  entity: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  car: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  offroad: { backgroundColor: palette.coral },
  hudCentre: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mission: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: 'rgba(10,10,20,0.72)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
});

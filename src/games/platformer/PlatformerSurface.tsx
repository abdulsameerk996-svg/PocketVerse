import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop, useEntityPool, type PooledEntity } from '@/core/game/useGameLoop';
import { usePlayerStore } from '@/core/state/playerStore';
import { getItem } from '@/content/catalog';
import {
  Button,
  Card,
  GameHud,
  LiveValue,
  PressableScale,
  ProgressBar,
  Text,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { LEVELS, type LevelDef } from './levels';
import type { PlatformerSave } from './types';

const MAX_PICKUPS = 24;
const GRAVITY = 2100;
const JUMP_V = 780;
const RUN_SPEED = 300;
const PLAYER_W = 34;
const PLAYER_H = 40;

/**
 * PLATFORM ADVENTURE
 *
 * Auto-run + tap-to-jump (double jump) — the control scheme that actually works
 * on a touchscreen. Physics is a worklet: swept vertical collision against the
 * level's static rectangles, which are captured by value into the worklet.
 *
 * Levels are pure data in `levels.ts`; hidden collectibles are just pickups
 * placed off the natural path and flagged, so 100%-ing a level is a real goal.
 */
export function PlatformerSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const pSave = save as PlatformerSave;
  const insets = useSafeAreaInsets();
  const { width, height, s: sc } = useResponsive();
  const accountLevel = usePlayerStore((s) => s.player.level);

  const [levelId, setLevelId] = useState<string | null>(null);
  const level = LEVELS.find((l) => l.id === levelId) ?? null;

  if (!level) {
    return (
      <LevelSelect
        save={pSave}
        accountLevel={accountLevel}
        onPick={setLevelId}
        insetTop={insets.top + sc(56)}
        insetBottom={insets.bottom + spacing.xxxl}
      />
    );
  }

  return (
    <PlatformerRun
      key={level.id}
      level={level}
      onExitToSelect={() => setLevelId(null)}
      onFinish={onFinish}
      paused={paused}
      requestPause={requestPause}
      modifiers={modifiers}
      save={pSave}
      setSave={setSave}
      width={width}
      height={height}
      sc={sc}
    />
  );
}

/* ------------------------------------------------------- level select -- */

function LevelSelect({
  save,
  accountLevel,
  onPick,
  insetTop,
  insetBottom,
}: {
  save: PlatformerSave;
  accountLevel: number;
  onPick: (id: string) => void;
  insetTop: number;
  insetBottom: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.select, { paddingTop: insetTop, paddingBottom: insetBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text variant="display">Levels</Text>
      <Text variant="body" muted style={{ marginBottom: spacing.lg }}>
        Every level hides at least one gem off the main path.
      </Text>

      {LEVELS.map((l, i) => {
        const progress = save.levels[l.id];
        const locked = accountLevel < l.minLevel;
        const prevCleared = i === 0 || !!save.levels[LEVELS[i - 1].id]?.cleared;
        const available = !locked && prevCleared;
        const totalPickups = l.pickups.length;
        const hiddenTotal = l.pickups.filter((p) => p.hidden).length;

        return (
          <PressableScale
            key={l.id}
            onPress={() => (available ? onPick(l.id) : haptics.warn())}
            style={[styles.levelRow, !available && { opacity: 0.45 }]}
            scaleTo={0.975}
          >
            <LinearGradient colors={l.sky} style={styles.levelThumb}>
              <Text size={22}>{available ? '🏃' : '🔒'}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{l.name}</Text>
              <Text variant="caption" muted>
                {locked
                  ? `Unlocks at account level ${l.minLevel}`
                  : !prevCleared
                    ? 'Clear the previous level first'
                    : `${progress?.collected ?? 0}/${totalPickups} collected · ${hiddenTotal} hidden`}
              </Text>
              <ProgressBar
                value={(progress?.collected ?? 0) / totalPickups}
                height={5}
                gradient={[palette.amber, palette.gold]}
                style={{ marginTop: 6 }}
                glow={false}
              />
            </View>
            {progress?.cleared ? (
              <Text size={18}>{progress.collected >= totalPickups ? '🏆' : '✅'}</Text>
            ) : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------- the run -- */

function PlatformerRun({
  level,
  onExitToSelect,
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
  width,
  height,
  sc,
}: {
  level: LevelDef;
  onExitToSelect: () => void;
  width: number;
  height: number;
  sc: (n: number) => number;
} & Pick<GameSurfaceProps, 'onFinish' | 'paused' | 'requestPause' | 'modifiers' | 'setSave'> & {
    save: PlatformerSave;
  }) {
  const floorY = height * 0.78;

  const platforms = useMemo(
    () => level.platforms.map((p) => ({ ...p, top: floorY - p.y - p.h })),
    [level.platforms, floorY],
  );
  const hazards = useMemo(
    () => level.hazards.map((h) => ({ ...h, top: floorY - h.y - h.h })),
    [level.hazards, floorY],
  );

  const pool = useEntityPool(MAX_PICKUPS);
  const frame = useSharedValue(0);
  const camera = useSharedValue(0);
  const px = useSharedValue(60);
  const py = useSharedValue(floorY - PLAYER_H - 40);
  const vy = useSharedValue(0);
  const grounded = useSharedValue(0);
  const jumps = useSharedValue(0);
  const collected = useSharedValue(0);
  const hiddenFound = useSharedValue(0);
  const deaths = useSharedValue(0);
  const alive = useSharedValue(1);
  const finished = useSharedValue(0);

  const [hud, setHud] = useState({ collected: 0, deaths: 0 });
  const totalPickups = level.pickups.length;
  const runSpeed = RUN_SPEED * (1 + modifiers.speed * 0.5);

  /**
   * Seed pickups from level data.
   *
   * Note the whole-array assignment: mutating `pool.value[i]` from the JS thread
   * would only change the JS-side copy. Reassigning `.value` is what pushes the
   * new state across to the UI thread, after which the worklet mutates in place.
   */
  useEffect(() => {
    pool.value = Array.from({ length: MAX_PICKUPS }, (_, i) => {
      const p = level.pickups[i];
      if (!p) return { active: false, x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, kind: 0, data: 0, data2: 0 };
      return {
        active: true,
        x: p.x,
        y: floorY - p.y - 24,
        vx: 0,
        vy: 0,
        w: 24,
        h: 24,
        kind: 0,
        data: p.hidden ? 1 : 0,
        data2: p.gem ? 1 : 0,
      };
    });
    play('game.start');
  }, [floorY, level.pickups, pool]);

  useEffect(() => {
    const id = setInterval(
      () => setHud({ collected: Math.floor(collected.value), deaths: Math.floor(deaths.value) }),
      200,
    );
    return () => clearInterval(id);
  }, [collected, deaths]);

  /* -------------------------------------------------------- callbacks */

  const onPickup = useCallback((hidden: boolean) => {
    haptics.collect();
    play(hidden ? 'reward.chest' : 'game.collect');
  }, []);

  const onDeath = useCallback(() => {
    haptics.fail();
    play('game.over');
  }, []);

  const complete = useCallback(
    (cleared: boolean) => {
      const got = Math.floor(collected.value);
      const hid = Math.floor(hiddenFound.value);
      const d = Math.floor(deaths.value);
      const perfect = got >= totalPickups;
      const score = got * 60 + (cleared ? 900 : 0) + hid * 250 - d * 80;

      setSave((prev: PlatformerSave) => {
        const prevLevel = prev.levels[level.id];
        return {
          ...prev,
          levels: {
            ...prev.levels,
            [level.id]: {
              cleared: cleared || !!prevLevel?.cleared,
              collected: Math.max(prevLevel?.collected ?? 0, got),
              bestDeaths: Math.min(prevLevel?.bestDeaths ?? 99, d),
            },
          },
          totalCollected: prev.totalCollected + got,
        };
      });

      onFinish({
        score: Math.max(0, score),
        outcome: cleared ? 'win' : 'lose',
        metrics: {
          levels_completed: cleared ? 1 : 0,
          collectibles_found: got,
          platform_deaths: d,
        },
        reward: {
          coins: Math.round(got * 22 + (cleared ? 420 : 60) + hid * 180),
          xp: Math.round(got * 8 + (cleared ? 160 : 25)),
          gems: hid,
          items: perfect ? { mat_starfrag: 1 } : cleared ? { mat_circuit: 1 } : { mat_scrap: 1 },
          unlocks: perfect && level.id === 'lv5' ? ['aura_solar'] : undefined,
        },
        breakdown: [
          { label: 'Level', value: level.name },
          { label: 'Collected', value: `${got}/${totalPickups}` },
          { label: 'Hidden gems', value: `${hid}` },
          { label: 'Deaths', value: `${d}` },
        ],
      });
    },
    [collected, deaths, hiddenFound, level.id, level.name, onFinish, setSave, totalPickups],
  );

  const doComplete = useCallback(() => complete(true), [complete]);

  /* --------------------------------------------------------- game loop */

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (alive.value < 1 || finished.value > 0) return;
      frame.value += 1;

      px.value += runSpeed * dt;
      vy.value += GRAVITY * dt;
      const nextY = py.value + vy.value * dt;

      // vertical collision — only when falling, classic platformer feel
      let landed = false;
      if (vy.value > 0) {
        for (let i = 0; i < platforms.length; i++) {
          const p = platforms[i];
          if (px.value + PLAYER_W < p.x || px.value > p.x + p.w) continue;
          const top = p.top;
          if (py.value + PLAYER_H <= top + 2 && nextY + PLAYER_H >= top) {
            py.value = top - PLAYER_H;
            vy.value = 0;
            landed = true;
            break;
          }
        }
      }
      if (!landed) py.value = nextY;
      grounded.value = landed ? 1 : 0;
      if (landed) jumps.value = 0;

      // hazards + pit
      let dead = py.value > height + 80;
      if (!dead) {
        for (let i = 0; i < hazards.length; i++) {
          const h = hazards[i];
          if (
            px.value + PLAYER_W > h.x &&
            px.value < h.x + h.w &&
            py.value + PLAYER_H > h.top &&
            py.value < h.top + h.h
          ) {
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        deaths.value += 1;
        px.value = Math.max(40, px.value - 380);
        py.value = 0;
        vy.value = 0;
        runOnJS(onDeath)();
      }

      // pickups
      for (let i = 0; i < MAX_PICKUPS; i++) {
        const e = pool.value[i];
        if (!e.active) continue;
        if (
          px.value + PLAYER_W > e.x &&
          px.value < e.x + e.w &&
          py.value + PLAYER_H > e.y &&
          py.value < e.y + e.h
        ) {
          e.active = false;
          collected.value += 1;
          if (e.data > 0) hiddenFound.value += 1;
          runOnJS(onPickup)(e.data > 0);
        }
      }

      camera.value = Math.max(0, px.value - width * 0.32);

      if (px.value >= level.length) {
        finished.value = 1;
        runOnJS(doComplete)();
      }
    },
    [
      alive, camera, collected, deaths, doComplete, finished, frame, grounded, hazards,
      height, hiddenFound, jumps, level.length, onDeath, onPickup, platforms, pool, px,
      py, runSpeed, vy, width,
    ],
  );

  useGameLoop(loop, !paused);

  /* ---------------------------------------------------------- controls */

  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(400)
        .onEnd(() => {
          'worklet';
          if (jumps.value >= 2) return;
          jumps.value += 1;
          vy.value = -JUMP_V * (jumps.value === 2 ? 0.86 : 1);
          runOnJS(haptics.press)();
        }),
    [jumps, vy],
  );

  /* -------------------------------------------------------- rendering */

  const worldStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -camera.value }],
  }));

  const playerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: px.value },
      { translateY: py.value },
      { rotate: `${grounded.value ? 0 : Math.max(-25, Math.min(25, vy.value * 0.02))}deg` },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, (px.value / level.length) * 100)}%`,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root}>
        <LinearGradient colors={level.sky} style={StyleSheet.absoluteFill} />

        <Animated.View style={[StyleSheet.absoluteFill, worldStyle]}>
          {platforms.map((p, i) => (
            <View
              key={`p${i}`}
              style={[styles.platform, { left: p.x, top: p.top, width: p.w, height: p.h }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)']}
                style={StyleSheet.absoluteFill}
              />
            </View>
          ))}

          {hazards.map((h, i) => (
            <View
              key={`h${i}`}
              style={[styles.hazard, { left: h.x, top: h.top, width: h.w, height: h.h }]}
            >
              <Text size={16}>🔥</Text>
            </View>
          ))}

          {Array.from({ length: MAX_PICKUPS }, (_, i) => (
            <PickupSprite key={i} index={i} pool={pool} frame={frame} />
          ))}

          {/* exit flag */}
          <View style={[styles.exit, { left: level.length, top: floorY - 90 }]}>
            <Text size={40}>🏁</Text>
          </View>

          <Animated.View style={[styles.player, playerStyle]}>
            <Text size={30}>🏃</Text>
          </Animated.View>
        </Animated.View>

        <GameHud
          onPause={requestPause}
          accent={palette.amber}
          centre={
            <View style={{ alignItems: 'center' }}>
              <Text variant="micro" color={palette.amber}>
                {level.name.toUpperCase()}
              </Text>
              <Text variant="title" numeric>
                {hud.collected}/{totalPickups}
              </Text>
            </View>
          }
          right={<Text variant="label">💀 {hud.deaths}</Text>}
        />

        <View style={styles.levelProgress}>
          <View style={styles.levelProgressTrack}>
            <Animated.View style={[styles.levelProgressFill, progressStyle]} />
          </View>
        </View>

        <View style={styles.bottomBar}>
          <Text variant="caption" faint>
            tap anywhere to jump · tap again mid-air to double jump
          </Text>
          <Button label="Levels" variant="ghost" size="sm" onPress={onExitToSelect} />
        </View>
      </View>
    </GestureDetector>
  );
}

const PickupSprite = React.memo(function PickupSprite({
  index,
  pool,
  frame,
}: {
  index: number;
  pool: SharedValue<PooledEntity[]>;
  frame: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const f = frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0, transform: [{ translateY: -9999 }] };
    return {
      opacity: 1,
      transform: [
        { translateX: e.x },
        { translateY: e.y + Math.sin(f * 0.05 + index) * 4 },
        { scale: 1 + Math.sin(f * 0.08 + index) * 0.08 },
      ],
    };
  });

  const [gem, setGem] = useState(false);
  useEffect(() => {
    setGem((pool.value[index]?.data2 ?? 0) > 0);
  }, [index, pool]);

  return (
    <Animated.View pointerEvents="none" style={[styles.pickup, style]}>
      <Text size={gem ? 24 : 20}>{gem ? '💎' : '⭐'}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  select: { paddingHorizontal: spacing.lg, gap: spacing.md },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  levelThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platform: {
    position: 'absolute',
    borderRadius: radius.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  hazard: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pickup: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  exit: { position: 'absolute' },
  player: { position: 'absolute', width: PLAYER_W, height: PLAYER_H, alignItems: 'center', justifyContent: 'center' },
  levelProgress: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.huge },
  levelProgressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  levelProgressFill: { height: '100%', backgroundColor: palette.gold },
  bottomBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
});

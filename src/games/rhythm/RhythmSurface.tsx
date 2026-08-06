import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { useGameLoop, useEntityPool, type PooledEntity } from '@/core/game/useGameLoop';
import { usePlayerStore } from '@/core/state/playerStore';
import {
  Button,
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
import { JUDGE, LANES, LANE_COLORS, SONGS, buildChart, type SongDef } from './content';
import type { RhythmSave } from './types';

const NOTE_POOL = 28;
const FALL_TIME = 1.15; // seconds from spawn line to judgement line

/**
 * RHYTHM
 *
 * Timing is read from a single shared clock advanced by the frame loop, so
 * judgement is measured against real elapsed time rather than frame counts —
 * accurate at 60 Hz and at 120 Hz alike.
 *
 * The chart is generated from the song id (see `buildChart`), so the game ships
 * with playable content and zero audio binaries. `play()` cues are already wired
 * at every hit; dropping audio files in later makes it audible with no code
 * change here.
 */
export function RhythmSurface({ onFinish, paused, requestPause, save, setSave, modifiers }: GameSurfaceProps) {
  const rSave = save as RhythmSave;
  const insets = useSafeAreaInsets();
  const { width, height, s: sc } = useResponsive();
  const accountLevel = usePlayerStore((s) => s.player.level);

  const [songId, setSongId] = useState<string | null>(null);
  const song = SONGS.find((s) => s.id === songId) ?? null;

  if (!song) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.select,
          { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="display">Setlist</Text>
        <Text variant="body" muted style={{ marginBottom: spacing.lg }}>
          Charts are generated from each track — identical every time you play it.
        </Text>
        {SONGS.map((s) => {
          const best = rSave.best[s.id];
          const locked = accountLevel < s.minLevel;
          return (
            <PressableScale
              key={s.id}
              onPress={() => (locked ? haptics.warn() : setSongId(s.id))}
              style={[styles.songRow, locked && { opacity: 0.45 }]}
              scaleTo={0.975}
            >
              <LinearGradient colors={s.colors} style={styles.songArt}>
                <Text size={24}>{locked ? '🔒' : s.glyph}</Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text variant="subheading">{s.name}</Text>
                <Text variant="caption" muted>
                  {s.artist} · {s.bpm} BPM · {'★'.repeat(s.difficulty)}
                </Text>
                {best ? (
                  <Text variant="micro" color={palette.gold}>
                    best {best.score} · {best.accuracy.toFixed(1)}% · combo {best.combo}
                  </Text>
                ) : (
                  <Text variant="micro" faint>
                    {locked ? `Unlocks at level ${s.minLevel}` : 'not played'}
                  </Text>
                )}
              </View>
              <Text size={16}>{locked ? '' : '▶'}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <RhythmPlay
      key={song.id}
      song={song}
      onBack={() => setSongId(null)}
      onFinish={onFinish}
      paused={paused}
      requestPause={requestPause}
      save={rSave}
      setSave={setSave}
      modifiers={modifiers}
      width={width}
      height={height}
      sc={sc}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}

/* ---------------------------------------------------------------- play -- */

function RhythmPlay({
  song,
  onBack,
  onFinish,
  paused,
  requestPause,
  save,
  setSave,
  modifiers,
  width,
  height,
  sc,
  topInset,
  bottomInset,
}: {
  song: SongDef;
  onBack: () => void;
  save: RhythmSave;
  width: number;
  height: number;
  sc: (n: number) => number;
  topInset: number;
  bottomInset: number;
} & Pick<GameSurfaceProps, 'onFinish' | 'paused' | 'requestPause' | 'setSave' | 'modifiers'>) {
  const chart = useMemo(() => buildChart(song), [song]);
  const total = chart.times.length;

  const laneW = width / LANES;
  const hitY = height - bottomInset - sc(120);
  const spawnY = topInset + sc(40);
  const fallDistance = hitY - spawnY;

  const pool = useEntityPool(NOTE_POOL);
  const frame = useSharedValue(0);
  const songTime = useSharedValue(-1.2);
  const nextNote = useSharedValue(0);
  const score = useSharedValue(0);
  const combo = useSharedValue(0);
  const maxCombo = useSharedValue(0);
  const hits = useSharedValue(0);
  const perfects = useSharedValue(0);
  const misses = useSharedValue(0);
  const done = useSharedValue(0);
  const laneFlash = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  const [judgement, setJudgement] = useState<{ text: string; color: string; key: number } | null>(null);
  const [hud, setHud] = useState({ combo: 0, acc: 100 });

  const times = chart.times;
  const lanes = chart.lanes;

  useEffect(() => {
    const id = setInterval(() => {
      const judged = hits.value + misses.value;
      setHud({
        combo: Math.floor(combo.value),
        acc: judged ? (hits.value / judged) * 100 : 100,
      });
    }, 120);
    return () => clearInterval(id);
  }, [combo, hits, misses]);

  useEffect(() => {
    play('game.start');
  }, []);

  /* -------------------------------------------------------- callbacks */

  const showJudgement = useCallback((kind: number) => {
    const map = [
      { text: 'PERFECT', color: palette.gold },
      { text: 'GREAT', color: palette.mint },
      { text: 'GOOD', color: palette.sky },
      { text: 'MISS', color: palette.coral },
    ];
    const j = map[kind];
    setJudgement({ ...j, key: Date.now() });
    if (kind === 0) {
      haptics.tick();
      play('rhythm.perfect');
    } else if (kind === 3) {
      haptics.warn();
      play('rhythm.miss');
    } else {
      haptics.collect();
    }
  }, []);

  const finish = useCallback(() => {
    const judged = hits.value + misses.value || 1;
    const accuracy = (hits.value / judged) * 100;
    const finalScore = Math.floor(score.value);
    const mc = Math.floor(maxCombo.value);
    const fullCombo = misses.value === 0;

    setSave((prev: RhythmSave) => {
      const prevBest = prev.best[song.id];
      return {
        ...prev,
        cleared: prev.cleared + 1,
        best: {
          ...prev.best,
          [song.id]: {
            score: Math.max(prevBest?.score ?? 0, finalScore),
            accuracy: Math.max(prevBest?.accuracy ?? 0, accuracy),
            combo: Math.max(prevBest?.combo ?? 0, mc),
          },
        },
      };
    });

    onFinish({
      score: finalScore,
      outcome: accuracy >= 60 ? 'win' : 'lose',
      metrics: {
        notes_hit: Math.floor(hits.value),
        max_combo: mc,
        songs_cleared: accuracy >= 60 ? 1 : 0,
      },
      reward: {
        coins: Math.round(finalScore * 0.05 + (fullCombo ? 500 : 0)),
        xp: Math.round(40 + finalScore * 0.02 + song.difficulty * 25),
        gems: fullCombo ? 5 : accuracy >= 95 ? 2 : 0,
        items: song.difficulty >= 4 ? { mat_core: 1 } : { mat_circuit: 1 },
        unlocks: fullCombo && song.difficulty === 5 ? ['deco_poster'] : undefined,
      },
      breakdown: [
        { label: 'Song', value: song.name },
        { label: 'Accuracy', value: `${accuracy.toFixed(1)}%` },
        { label: 'Max combo', value: `${mc}` },
        { label: 'Perfects', value: `${Math.floor(perfects.value)}` },
        { label: 'Misses', value: `${Math.floor(misses.value)}` },
      ],
    });
  }, [hits, maxCombo, misses, onFinish, perfects, score, setSave, song]);

  /* --------------------------------------------------------- the loop */

  const loop = useCallback(
    (dt: number) => {
      'worklet';
      if (done.value > 0) return;
      frame.value += 1;
      songTime.value += dt;

      // spawn notes entering the fall window
      while (
        nextNote.value < times.length &&
        times[nextNote.value] - songTime.value <= FALL_TIME
      ) {
        for (let i = 0; i < NOTE_POOL; i++) {
          const e = pool.value[i];
          if (e.active) continue;
          e.active = true;
          e.data = nextNote.value; // note index
          e.data2 = lanes[nextNote.value]; // lane
          e.x = 0;
          e.y = 0;
          break;
        }
        nextNote.value += 1;
      }

      // retire missed notes
      for (let i = 0; i < NOTE_POOL; i++) {
        const e = pool.value[i];
        if (!e.active) continue;
        const delta = songTime.value - times[e.data];
        if (delta > JUDGE.good) {
          e.active = false;
          misses.value += 1;
          combo.value = 0;
          runOnJS(showJudgement)(3);
        }
      }

      if (songTime.value > song.duration) {
        done.value = 1;
        runOnJS(finish)();
      }
    },
    [combo, done, finish, frame, lanes, misses, nextNote, pool, showJudgement, song.duration, songTime, times],
  );

  useGameLoop(loop, !paused);

  /* ------------------------------------------------------------- input */

  const hitLane = useCallback(
    (lane: number) => {
      'worklet';
      laneFlash[lane].value = 1;
      laneFlash[lane].value = withTiming(0, { duration: 180 });

      let bestSlot = -1;
      let bestDelta = 999;
      for (let i = 0; i < NOTE_POOL; i++) {
        const e = pool.value[i];
        if (!e.active || e.data2 !== lane) continue;
        const delta = Math.abs(times[e.data] - songTime.value);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestSlot = i;
        }
      }

      if (bestSlot < 0 || bestDelta > JUDGE.good) return;

      pool.value[bestSlot].active = false;
      hits.value += 1;
      combo.value += 1;
      if (combo.value > maxCombo.value) maxCombo.value = combo.value;

      let kind = 2;
      let base = 60;
      if (bestDelta <= JUDGE.perfect) {
        kind = 0;
        base = 300;
        perfects.value += 1;
      } else if (bestDelta <= JUDGE.great) {
        kind = 1;
        base = 160;
      }
      // combo multiplier caps at 4× so a late run can still matter
      const mult = Math.min(4, 1 + combo.value / 25);
      score.value += base * mult;
      runOnJS(showJudgement)(kind);
    },
    [combo, hits, laneFlash, maxCombo, perfects, pool, score, showJudgement, songTime, times],
  );

  const gestures = useMemo(
    () =>
      Array.from({ length: LANES }, (_, i) =>
        Gesture.Tap()
          .maxDuration(600)
          .onBegin(() => {
            'worklet';
            hitLane(i);
          }),
      ),
    [hitLane],
  );

  /* -------------------------------------------------------- rendering */

  return (
    <View style={styles.root}>
      <LinearGradient colors={[song.colors[1], '#07070E']} style={StyleSheet.absoluteFill} />

      {/* lane guides */}
      {Array.from({ length: LANES }, (_, i) => (
        <LaneGuide
          key={i}
          index={i}
          laneW={laneW}
          top={spawnY}
          hitY={hitY}
          flash={laneFlash[i]}
        />
      ))}

      {/* judgement line */}
      <View style={[styles.hitLine, { top: hitY }]} />

      {/* notes */}
      {Array.from({ length: NOTE_POOL }, (_, i) => (
        <NoteSprite
          key={i}
          index={i}
          pool={pool}
          frame={frame}
          songTime={songTime}
          times={times}
          laneW={laneW}
          spawnY={spawnY}
          fallDistance={fallDistance}
        />
      ))}

      {/* touch zones */}
      <View style={[styles.touchRow, { top: hitY - sc(70), height: sc(190) }]}>
        {gestures.map((g, i) => (
          <GestureDetector key={i} gesture={g}>
            <View style={{ width: laneW, height: '100%' }} />
          </GestureDetector>
        ))}
      </View>

      {/* HUD */}
      <GameHud
        onPause={requestPause}
        accent={song.colors[0]}
        centre={
          <View style={{ alignItems: 'center' }}>
            <LiveValue value={score} variant="title" format={(v) => `${Math.floor(v)}`} />
            <Text variant="caption" muted>
              {hud.acc.toFixed(1)}% acc
            </Text>
          </View>
        }
        right={
          hud.combo > 2 ? (
            <Text variant="heading" color={palette.gold}>
              {hud.combo}×
            </Text>
          ) : null
        }
      />

      {judgement ? (
        <Judgement key={judgement.key} text={judgement.text} color={judgement.color} top={hitY - sc(110)} />
      ) : null}

      <View style={[styles.songBar, { bottom: bottomInset + spacing.sm }]}>
        <Text variant="caption" muted center>
          {song.glyph} {song.name} · {song.bpm} BPM
        </Text>
        <SongProgress songTime={songTime} duration={song.duration} />
        <Button label="Setlist" variant="ghost" size="sm" onPress={onBack} />
      </View>
    </View>
  );
}

/* ---------------------------------------------------------- sub-views -- */

const LaneGuide = React.memo(function LaneGuide({
  index,
  laneW,
  top,
  hitY,
  flash,
}: {
  index: number;
  laneW: number;
  top: number;
  hitY: number;
  flash: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ opacity: 0.06 + flash.value * 0.3 }));
  const padStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + flash.value * 0.65,
    transform: [{ scale: 1 + flash.value * 0.12 }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.lane,
          { left: index * laneW, width: laneW, top, height: hitY - top, backgroundColor: LANE_COLORS[index] },
          style,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pad,
          {
            left: index * laneW + 6,
            width: laneW - 12,
            top: hitY - 6,
            borderColor: LANE_COLORS[index],
          },
          padStyle,
        ]}
      />
    </>
  );
});

const NoteSprite = React.memo(function NoteSprite({
  index,
  pool,
  frame,
  songTime,
  times,
  laneW,
  spawnY,
  fallDistance,
}: {
  index: number;
  pool: SharedValue<PooledEntity[]>;
  frame: SharedValue<number>;
  songTime: SharedValue<number>;
  times: number[];
  laneW: number;
  spawnY: number;
  fallDistance: number;
}) {
  const style = useAnimatedStyle(() => {
    frame.value;
    const e = pool.value[index];
    if (!e || !e.active) return { opacity: 0, transform: [{ translateY: -999 }] };
    const remaining = times[e.data] - songTime.value;
    const t = 1 - remaining / FALL_TIME;
    const lane = e.data2;
    return {
      opacity: 1,
      backgroundColor: LANE_COLORS[lane],
      transform: [
        { translateX: lane * laneW + 10 },
        { translateY: spawnY + t * fallDistance },
      ],
      width: laneW - 20,
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.note, style]} />;
});

const Judgement = React.memo(function Judgement({
  text,
  color,
  top,
}: {
  text: string;
  color: string;
  top: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withTiming(1, { duration: 460 });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateY: -t.value * 26 }, { scale: 1 + t.value * 0.18 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.judgement, { top }, style]}>
      <Text variant="heading" color={color}>
        {text}
      </Text>
    </Animated.View>
  );
});

const SongProgress = React.memo(function SongProgress({
  songTime,
  duration,
}: {
  songTime: SharedValue<number>;
  duration: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setV(Math.max(0, Math.min(1, songTime.value / duration))), 250);
    return () => clearInterval(id);
  }, [duration, songTime]);
  return <ProgressBar value={v} height={4} gradient={[palette.violet, palette.magenta]} style={{ marginVertical: 6 }} />;
});

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  select: { paddingHorizontal: spacing.lg, gap: spacing.md },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  songArt: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  lane: { position: 'absolute' },
  pad: { position: 'absolute', height: 12, borderRadius: 6, borderWidth: 2 },
  hitLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  note: { position: 'absolute', height: 20, borderRadius: 10 },
  touchRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
  judgement: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  songBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
});

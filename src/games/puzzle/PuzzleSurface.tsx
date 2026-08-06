import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import type { GameSurfaceProps } from '@/core/registry';
import { createRng } from '@/core/utils/rng';
import { dayKey } from '@/core/utils/time';
import {
  Button,
  Card,
  PressableScale,
  SectionHeader,
  Text,
  Burst,
  haptics,
  palette,
  radius,
  spacing,
  useResponsive,
  play,
} from '@/ui';
import { MODES, MODE_META, type PuzzleMode, type PuzzleSave } from './types';
import {
  LIGHTS_SIZE,
  MEMORY_PADS,
  SLIDE_SIZE,
  dailyFor,
  lightsNeighbours,
  lightsSolved,
  makeLights,
  makeMemorySequence,
  makeSlide,
  slideNeighbours,
  slideSolved,
} from './logic';

const PAD_COLORS = ['#FF6B6B', '#FFC53D', '#34E2A8', '#4EA8FF', '#C05CFF', '#22D3EE'];

type Stage = 'menu' | 'playing' | 'won';

/**
 * PUZZLE COLLECTION
 *
 * Three self-contained modes behind one shell, plus a date-seeded daily. Board
 * generation is deterministic (`createRng`), so a daily puzzle is identical on
 * every device and cannot be rerolled — without any server involvement.
 *
 * Unlike the action games this one is React-state driven: input is discrete and
 * infrequent, so a worklet loop would add complexity for no frame-rate benefit.
 */
export function PuzzleSurface({ onFinish, track, grant, save, setSave, modifiers }: GameSurfaceProps) {
  const puzzleSave = save as PuzzleSave;
  const insets = useSafeAreaInsets();
  const { width, s: sc } = useResponsive();

  const today = dayKey();
  const daily = useMemo(() => dailyFor(today), [today]);
  const dailyDone = puzzleSave.lastDaily === today;

  const [stage, setStage] = useState<Stage>('menu');
  const [mode, setMode] = useState<PuzzleMode>('lights');
  const [isDaily, setIsDaily] = useState(false);
  const [moves, setMoves] = useState(0);
  const [burst, setBurst] = useState(0);
  const startedAt = useRef(Date.now());

  // boards
  const [lights, setLights] = useState<boolean[]>([]);
  const [tiles, setTiles] = useState<number[]>([]);
  const [sequence, setSequence] = useState<number[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [showing, setShowing] = useState(-1);
  const [round, setRound] = useState(1);

  const boardW = Math.min(width - spacing.lg * 2, sc(340));

  /* ------------------------------------------------------------ start */

  const start = useCallback(
    (m: PuzzleMode, asDaily: boolean) => {
      const seed = asDaily ? daily.seed : Math.floor(Math.random() * 1e9);
      const difficulty = asDaily ? daily.difficulty : 1;
      const rng = createRng(seed);

      setMode(m);
      setIsDaily(asDaily);
      setMoves(0);
      setRound(1);
      setInputIndex(0);
      startedAt.current = Date.now();

      if (m === 'lights') setLights(makeLights(rng, difficulty));
      if (m === 'slide') setTiles(makeSlide(rng, difficulty));
      if (m === 'memory') {
        const seq = makeMemorySequence(rng, 3 + difficulty);
        setSequence(seq);
        playSequence(seq);
      }
      setStage('playing');
      play('game.start');
      haptics.press();
    },
    [daily],
  );

  /* -------------------------------------------------------- memory UX */

  const playSequence = useCallback((seq: number[]) => {
    let i = 0;
    setShowing(-1);
    const step = () => {
      if (i >= seq.length) {
        setShowing(-1);
        return;
      }
      setShowing(seq[i]);
      haptics.tick();
      setTimeout(() => {
        setShowing(-1);
        i += 1;
        setTimeout(step, 160);
      }, 380);
    };
    setTimeout(step, 420);
  }, []);

  /* ------------------------------------------------------------- win */

  const win = useCallback(
    (extra: { score: number; label: string; value: string }[], score: number) => {
      setStage('won');
      setBurst((b) => b + 1);
      haptics.success();
      play('reward.levelup');

      const perfect = mode === 'lights' ? moves <= 8 : mode === 'slide' ? moves <= 40 : true;
      const bonus = isDaily ? 2.2 : 1;

      setSave((prev: PuzzleSave) => ({
        ...prev,
        solved: prev.solved + 1,
        bestMoves: {
          ...prev.bestMoves,
          [mode]: Math.min(prev.bestMoves[mode] ?? Infinity, moves || 1),
        },
        bestMemory: mode === 'memory' ? Math.max(prev.bestMemory, round) : prev.bestMemory,
        lastDaily: isDaily ? today : prev.lastDaily,
        dailyStreak: isDaily ? prev.dailyStreak + 1 : prev.dailyStreak,
      }));

      onFinish({
        score: Math.round(score * bonus),
        outcome: 'win',
        metrics: {
          puzzles_solved: 1,
          daily_puzzle_solved: isDaily ? 1 : 0,
          puzzle_perfect: perfect ? 1 : 0,
        },
        reward: {
          coins: Math.round((120 + score * 0.6) * bonus),
          xp: Math.round((45 + score * 0.35) * bonus),
          gems: isDaily ? 4 : perfect ? 1 : 0,
          items: modifiers.luck > 0.1 || isDaily ? { mat_circuit: 1 } : { mat_scrap: 1 },
        },
        breakdown: [
          { label: 'Mode', value: MODE_META[mode].title },
          ...extra.map((e) => ({ label: e.label, value: e.value })),
          { label: 'Daily bonus', value: isDaily ? '×2.2' : '—' },
        ],
      });
    },
    [isDaily, mode, modifiers.luck, moves, onFinish, round, setSave, today],
  );

  /* ---------------------------------------------------------- actions */

  const tapLight = useCallback(
    (i: number) => {
      if (stage !== 'playing') return;
      const next = lights.slice();
      for (const j of lightsNeighbours(i)) next[j] = !next[j];
      setLights(next);
      setMoves((m) => m + 1);
      haptics.tap();
      if (lightsSolved(next)) {
        const m = moves + 1;
        win([{ label: 'Moves', value: `${m}`, score: 0 }], Math.max(120, 900 - m * 45));
      }
    },
    [lights, moves, stage, win],
  );

  const tapTile = useCallback(
    (i: number) => {
      if (stage !== 'playing') return;
      const emptyIdx = tiles.indexOf(0);
      if (!slideNeighbours(emptyIdx).includes(i)) {
        haptics.warn();
        return;
      }
      const next = tiles.slice();
      next[emptyIdx] = next[i];
      next[i] = 0;
      setTiles(next);
      setMoves((m) => m + 1);
      haptics.tap();
      if (slideSolved(next)) {
        const m = moves + 1;
        win([{ label: 'Moves', value: `${m}`, score: 0 }], Math.max(150, 1400 - m * 18));
      }
    },
    [moves, stage, tiles, win],
  );

  const tapPad = useCallback(
    (pad: number) => {
      if (stage !== 'playing' || showing >= 0) return;
      haptics.tap();
      if (sequence[inputIndex] !== pad) {
        haptics.fail();
        play('rhythm.miss');
        win([{ label: 'Rounds', value: `${round - 1}`, score: 0 }], Math.max(60, (round - 1) * 180));
        return;
      }
      const next = inputIndex + 1;
      if (next >= sequence.length) {
        // extend and continue
        const grown = [...sequence, Math.floor(Math.random() * MEMORY_PADS)];
        setSequence(grown);
        setInputIndex(0);
        setRound((r) => r + 1);
        setMoves((m) => m + 1);
        haptics.success();
        grant({ coins: 25 + round * 10, xp: 10 + round * 4 }, `Echo round ${round}`);
        playSequence(grown);
      } else {
        setInputIndex(next);
      }
    },
    [grant, inputIndex, playSequence, round, sequence, showing, stage, win],
  );

  useEffect(() => {
    if (stage === 'playing') track({ sessions_played: 0 });
  }, [stage, track]);

  /* -------------------------------------------------------- rendering */

  if (stage === 'menu') {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.menu,
          { paddingTop: insets.top + sc(56), paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card
          variant="gradient"
          gradient={dailyDone ? ['#1A1A2E', '#12121F'] : ['#3D1F6E', '#1A0B33']}
          style={styles.dailyCard}
        >
          <View style={styles.dailyHead}>
            <View style={{ flex: 1 }}>
              <Text variant="micro" color={palette.gold}>
                DAILY PUZZLE · {today}
              </Text>
              <Text variant="title">{MODE_META[daily.mode].title}</Text>
              <Text variant="caption" muted style={{ marginTop: 2 }}>
                Same board for everyone · ×2.2 rewards
              </Text>
            </View>
            <Text size={40}>{MODE_META[daily.mode].glyph}</Text>
          </View>
          <Button
            label={dailyDone ? 'Completed today' : 'Play daily'}
            disabled={dailyDone}
            shine={!dailyDone}
            gradient={['#FFD166', '#FF9F1C']}
            onPress={() => start(daily.mode, true)}
            full
            style={{ marginTop: spacing.lg }}
          />
          {puzzleSave.dailyStreak > 0 ? (
            <Text variant="caption" center muted style={{ marginTop: spacing.sm }}>
              🔥 {puzzleSave.dailyStreak} day streak
            </Text>
          ) : null}
        </Card>

        <SectionHeader title="Modes" subtitle="Free play · unlimited attempts" />
        {MODES.map((m) => {
          const meta = MODE_META[m];
          const best = puzzleSave.bestMoves[m];
          return (
            <PressableScale key={m} onPress={() => start(m, false)} style={styles.modeRow} scaleTo={0.975}>
              <View style={[styles.modeGlyph, { backgroundColor: `${meta.accent}22` }]}>
                <Text size={26}>{meta.glyph}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="subheading">{meta.title}</Text>
                <Text variant="caption" muted numberOfLines={2}>
                  {meta.blurb}
                </Text>
              </View>
              <View style={styles.modeBest}>
                <Text variant="micro" muted>
                  BEST
                </Text>
                <Text variant="label" numeric color={meta.accent}>
                  {m === 'memory'
                    ? puzzleSave.bestMemory || '—'
                    : best != null && Number.isFinite(best)
                      ? best
                      : '—'}
                </Text>
              </View>
            </PressableScale>
          );
        })}

        <Text variant="caption" faint center style={{ marginTop: spacing.xl }}>
          Solved {puzzleSave.solved} puzzles so far.
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.board, { paddingTop: insets.top + sc(64) }]}>
      <View style={styles.boardHead}>
        <Text variant="micro" color={MODE_META[mode].accent}>
          {isDaily ? 'DAILY · ' : ''}
          {MODE_META[mode].title.toUpperCase()}
        </Text>
        <Text variant="title" numeric>
          {mode === 'memory' ? `Round ${round}` : `${moves} moves`}
        </Text>
        <Text variant="caption" muted center style={{ maxWidth: 280, marginTop: 4 }}>
          {mode === 'memory' && showing >= 0 ? 'Watch…' : MODE_META[mode].blurb}
        </Text>
      </View>

      <View style={{ width: boardW, alignSelf: 'center' }}>
        <Burst trigger={burst} radius={140} count={22} colors={[MODE_META[mode].accent, '#fff']} />

        {mode === 'lights' ? (
          <View style={styles.grid}>
            {lights.map((on, i) => (
              <PressableScale
                key={i}
                onPress={() => tapLight(i)}
                scaleTo={0.9}
                haptic={false}
                style={[
                  styles.cell,
                  {
                    width: (boardW - (LIGHTS_SIZE - 1) * 8) / LIGHTS_SIZE,
                    height: (boardW - (LIGHTS_SIZE - 1) * 8) / LIGHTS_SIZE,
                    backgroundColor: on ? palette.gold : 'rgba(255,255,255,0.05)',
                    borderColor: on ? palette.amber : palette.hairline,
                  },
                ]}
              >
                <Text size={22}>{on ? '💡' : ''}</Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        {mode === 'slide' ? (
          <View style={styles.grid}>
            {tiles.map((t, i) => (
              <PressableScale
                key={i}
                onPress={() => tapTile(i)}
                scaleTo={0.92}
                haptic={false}
                style={[
                  styles.cell,
                  {
                    width: (boardW - (SLIDE_SIZE - 1) * 8) / SLIDE_SIZE,
                    height: (boardW - (SLIDE_SIZE - 1) * 8) / SLIDE_SIZE,
                    backgroundColor: t === 0 ? 'transparent' : 'rgba(78,168,255,0.16)',
                    borderColor: t === 0 ? 'transparent' : palette.sky,
                  },
                ]}
              >
                {t !== 0 ? (
                  <Animated.View entering={ZoomIn.duration(160)}>
                    <Text variant="display" numeric>
                      {t}
                    </Text>
                  </Animated.View>
                ) : null}
              </PressableScale>
            ))}
          </View>
        ) : null}

        {mode === 'memory' ? (
          <View style={styles.pads}>
            {Array.from({ length: MEMORY_PADS }, (_, i) => {
              const lit = showing === i;
              return (
                <PressableScale
                  key={i}
                  onPress={() => tapPad(i)}
                  scaleTo={0.9}
                  haptic={false}
                  style={[
                    styles.pad,
                    {
                      width: (boardW - 12) / 2,
                      backgroundColor: lit ? PAD_COLORS[i] : `${PAD_COLORS[i]}28`,
                      borderColor: PAD_COLORS[i],
                      opacity: showing >= 0 && !lit ? 0.5 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      {mode === 'memory' ? (
        <View style={styles.progressDots}>
          {sequence.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i < inputIndex ? palette.mint : 'rgba(255,255,255,0.15)' },
              ]}
            />
          ))}
        </View>
      ) : null}

      {stage === 'won' ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.wonOverlay} pointerEvents="none">
          <Text variant="display">Solved</Text>
        </Animated.View>
      ) : null}

      <Button
        label="Back to modes"
        variant="ghost"
        onPress={() => setStage('menu')}
        style={styles.backBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { paddingHorizontal: spacing.lg, gap: spacing.md },
  dailyCard: { marginBottom: spacing.lg },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  modeGlyph: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modeBest: { alignItems: 'flex-end' },
  board: { flex: 1, paddingHorizontal: spacing.lg },
  boardHead: { alignItems: 'center', marginBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cell: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pads: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  pad: { height: 86, borderRadius: radius.lg, borderWidth: 2 },
  progressDots: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginTop: spacing.xl,
    flexWrap: 'wrap',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  wonOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backBtn: { marginTop: 'auto', marginBottom: spacing.xxl },
});

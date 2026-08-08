import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { GameSurfaceProps } from '@/core/registry';
import { comboMultiplier, quickReward } from '@/core/game/quick';
import { useKeyPress } from '@/ui/hooks/useKeyboard';
import { GameHud, PressableScale, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import {
  SNAP_COLORS,
  hitScore,
  isFake,
  makeRound,
  roundTime,
  shade,
  type Round,
} from './logic';
import type { ColorSnapSave } from './types';

/**
 * ============================================================================
 *  COLOR SNAP
 * ============================================================================
 *
 * A target colour appears; tap the tile that matches it before the bar runs
 * out. More tiles, shorter timers and near-miss fake shades as you climb.
 * No per-frame work: one timed round at a time, so plain state + one countdown
 * interval + a single animated timer bar is the whole engine.
 */

const LIVES = 3;

export function ColorSnapSurface({
  onFinish,
  paused,
  requestPause,
  modifiers,
  save,
  setSave,
}: GameSurfaceProps) {
  const { s: sc } = useResponsive();
  const startAt = useRef(Date.now());

  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [round, setRound] = useState<Round>(() => makeRound(1, Math.random));
  const [over, setOver] = useState(false);

  const timerPct = useSharedValue(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const remaining = useRef(0);
  const finished = useRef(false);

  /* ------------------------------------------------------- round clock */
  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startClock = useCallback((secs: number) => {
    stopTimer();
    remaining.current = secs;
    timerPct.value = 1;
    timerPct.value = withTiming(0, { duration: secs * 1000, easing: Easing.linear });
    timer.current = setInterval(() => {
      remaining.current -= 0.1;
      if (remaining.current <= 0) {
        stopTimer();
        resolve(false, 0);
      }
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopTimer, timerPct]);

  const beginRound = useCallback(
    (lv: number) => {
      setRound(makeRound(lv, Math.random));
      startClock(roundTime(lv, modifiers.luck));
    },
    [modifiers.luck, startClock],
  );

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stopTimer();
    setOver(true);
    const elapsed = (Date.now() - startAt.current) / 1000;
    haptics.fail();
    play('game.over');
    setTimeout(() => {
      onFinish({
        score,
        outcome: 'lose',
        metrics: { colorsnap_score: score, colorsnap_streak: bestStreak },
        reward: quickReward(score, elapsed),
        breakdown: [
          { label: 'Level', value: `${level}` },
          { label: 'Best streak', value: `${bestStreak}` },
          { label: 'Fastest round', value: '—' },
        ],
      });
      setSave((s: unknown) => {
        const save2 = (s ?? { runs: 0, best: 0, bestStreak: 0 }) as ColorSnapSave;
        return {
          ...save2,
          runs: save2.runs + 1,
          best: Math.max(save2.best, score),
          bestStreak: Math.max(save2.bestStreak, bestStreak),
        };
      });
    }, 700);
  }, [bestStreak, level, onFinish, score, setSave, stopTimer]);

  const resolve = useCallback(
    (hit: boolean, idx: number) => {
      if (over) return;
      stopTimer();

      if (hit) {
        const gained = hitScore(streak, remaining.current);
        setScore((s) => s + gained);
        const ns = streak + 1;
        setStreak(ns);
        setBestStreak((b) => Math.max(b, ns));
        if (ns % 4 === 0) {
          const lv = level + 1;
          setLevel(lv);
          beginRound(lv);
        } else {
          beginRound(level);
        }
        haptics.collect();
        play('game.collect', { volume: 0.7 });
        void idx;
      } else {
        setStreak(0);
        const nl = lives - 1;
        setLives(nl);
        haptics.fail();
        play('game.hit');
        if (nl <= 0) {
          finish();
        } else {
          beginRound(level);
        }
      }
    },
    [beginRound, finish, level, lives, over, setSave, startAt, stopTimer, streak],
  );

  useEffect(() => {
    beginRound(1);
    play('game.start');
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------- input */
  const tap = useCallback(
    (i: number) => {
      if (paused || over) return;
      resolve(i === round.target, i);
    },
    [over, paused, resolve, round.target],
  );

  const keys = useCallback(() => {
    const map: Record<string, () => void> = {};
    for (let i = 0; i < round.tiles.length; i++) map[`${i + 1}`] = () => tap(i);
    return map;
  }, [round.tiles, tap]);
  useKeyPress(!paused && !over, keys());

  /* ------------------------------------------------------- rendering */
  const barStyle = useAnimatedStyle(() => ({ width: `${timerPct.value * 100}%` }));

  const target = SNAP_COLORS[round.target];

  return (
    <View style={styles.root}>
      <GameHud
        onPause={requestPause}
        accent={palette.gold}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.gold}>
              COLOR SNAP · LV {level}
            </Text>
            <Text variant="display" numeric>
              {score}
            </Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={streak >= 3 ? palette.gold : palette.textMuted}>
              {streak >= 3 ? `${streak} STREAK` : '×' + comboMultiplier(streak).toFixed(2)}
            </Text>
            <Text variant="label" color={palette.coral}>
              {'♥'.repeat(Math.max(0, lives))}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, LIVES - lives))}
              </Text>
            </Text>
          </View>
        }
      />

      <View style={[styles.stage, { paddingTop: sc(104) }]}>
        {/* Timer bar */}
        <View style={[styles.timerTrack, { width: sc(240) }]}>
          <Animated.View style={[styles.timerFill, barStyle]} />
        </View>

        {/* Target colour */}
        <View
          style={[
            styles.target,
            { width: sc(120), height: sc(120), borderRadius: sc(60), backgroundColor: target, borderColor: `${target}88` },
          ]}
        >
          <Text variant="micro" color={shade(target, 0.35)} style={{ textTransform: 'uppercase' }}>
            tap the match
          </Text>
        </View>

        {/* Tiles */}
        <View style={styles.grid}>
          {round.tiles.map((tile, i) => {
            const fake = isFake(tile, round.fakes, round.target);
            const color = fake ? shade(SNAP_COLORS[tile]) : SNAP_COLORS[tile];
            return (
              <PressableScale
                key={i}
                onPress={() => tap(i)}
                scaleTo={0.88}
                haptic={false}
                style={[styles.tile, { backgroundColor: color, borderColor: `${color}66` }]}
              >
                <View style={styles.tileGloss} />
              </PressableScale>
            );
          })}
        </View>

        <Text variant="caption" muted center>
          Pick the tile that matches the disc. Speed pays.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0817', overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  stage: { flex: 1, alignItems: 'center', gap: spacing.xl },
  timerTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  timerFill: { height: '100%', backgroundColor: palette.gold },
  target: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    maxWidth: 360,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tileGloss: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
});

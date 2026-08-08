import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GameSurfaceProps } from '@/core/registry';
import { quickReward } from '@/core/game/quick';
import { useKeyPress } from '@/ui/hooks/useKeyboard';
import { GameHud, PressableScale, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import {
  PADS,
  START_LIVES,
  checkEntry,
  extendSeq,
  makeMem,
  padTimer,
  showPadMs,
  stageScore,
  type MemState,
} from './logic';
import type { MemRushSave } from './types';

/**
 * ============================================================================
 *  MEMORY RUSH
 * ============================================================================
 *
 * Watch the pads light up, then repeat the pattern. Every cleared stage adds
 * one more step; a wrong tap costs a heart. Turn-based, so the whole game is
 * plain React state + a few timers — no per-frame work at all.
 */

const PAD_COLORS = ['#FF6B6B', '#4EA8FF', '#FFD166', '#34E2A8'];

export function MemRushSurface({
  onFinish,
  paused,
  requestPause,
  save,
  setSave,
}: GameSurfaceProps) {
  const { s: sc } = useResponsive();
  const startAt = useRef(Date.now());

  const [state, setState] = useState<MemState>(() => makeMem());
  const [lit, setLit] = useState(-1);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState('Watch the pattern');
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /* --------------------------------------------- the show phase -------- */
  const playSequence = useCallback(
    (seq: number[]) => {
      setInputEnabled(false);
      setHint('Watch the pattern');
      const ms = showPadMs(state.stage);
      later(() => {
        seq.forEach((pad, i) => {
          later(() => {
            setLit(pad);
            play('game.collect', { volume: 0.5 });
            later(() => setLit(-1), ms * 0.6);
          }, i * ms);
        });
        // hand over to input after the full sequence
        later(() => {
          setInputEnabled(true);
          setHint(`Repeat it — ${seq.length} steps`);
        }, seq.length * ms + 260);
      }, 350);
    },
    [later, state.stage],
  );

  /* -------------------------------------------------- start the game --- */
  useEffect(() => {
    const first = extendSeq([], Math.random);
    setState((s) => ({ ...s, seq: first, stage: 1 }));
    playSequence(first);
    play('game.start');
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------- entry timer -- */
  const entryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const wrongEntry = useCallback(() => {
    setState((s) => {
      const lives = s.lives - 1;
      play('game.hit');
      haptics.fail();
      if (lives <= 0) {
        finished.current = true;
        setOver(true);
        const sc = s.score;
        const elapsed = (Date.now() - startAt.current) / 1000;
        later(() => {
          onFinish({
            score: sc,
            outcome: 'lose',
            metrics: { memrush_score: sc, memrush_streak: s.stage },
            reward: quickReward(sc, elapsed),
            breakdown: [
              { label: 'Patterns cleared', value: `${s.stage - 1}` },
              { label: 'Longest pattern', value: `${s.stage}` },
              { label: 'Lives left', value: '0' },
            ],
          });
          setSave((sv: unknown) => {
            const save2 = (sv ?? { runs: 0, best: 0, bestStreak: 0 }) as MemRushSave;
            return {
              ...save2,
              runs: save2.runs + 1,
              best: Math.max(save2.best, sc),
              bestStreak: Math.max(save2.bestStreak, s.stage),
            };
          });
        }, 700);
        return { ...s, lives: 0, phase: 'over' };
      }
      setHint(`Wrong — ${lives} ${lives === 1 ? 'heart' : 'hearts'} left. Watch again.`);
      playSequence(s.seq);
      return { ...s, lives, entered: 0, phase: 'show' };
    });
  }, [later, onFinish, playSequence, setSave]);

  const beginInputTimer = useCallback(() => {
    if (entryTimer.current) clearInterval(entryTimer.current);
    const limit = padTimer(state.stage);
    let left = limit;
    entryTimer.current = setInterval(() => {
      left -= 0.1;
      if (left <= 0) {
        if (entryTimer.current) clearInterval(entryTimer.current);
        entryTimer.current = null;
        wrongEntry();
      }
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage, wrongEntry]);

  /* ------------------------------------------------------- pad press --- */
  const pressPad = useCallback(
    (pad: number) => {
      if (over || paused || !inputEnabled) return;
      setLit(pad);
      later(() => setLit(-1), 140);
      setState((s) => {
        const entered = s.entered + 1;
        if (pad !== s.seq[s.entered]) {
          if (entryTimer.current) clearInterval(entryTimer.current);
          entryTimer.current = null;
          later(() => wrongEntry(), 180);
          return { ...s, entered };
        }
        haptics.collect();
        play('game.collect', { volume: 0.7 });
        const verdict = checkEntry(s.seq, entered);
        if (verdict === 'done') {
          if (entryTimer.current) clearInterval(entryTimer.current);
          entryTimer.current = null;
          const gained = stageScore(s.stage, s.lives);
          const seq = extendSeq(s.seq, Math.random);
          setHint('Cleared! Extending…');
          later(() => {
            setState((s2) => ({ ...s2, entered: 0 }));
            playSequence(seq);
          }, 500);
          return { ...s, entered: 0, score: s.score + gained, stage: s.stage + 1, seq };
        }
        return { ...s, entered };
      });
    },
    [inputEnabled, later, over, paused, playSequence, wrongEntry],
  );

  useEffect(() => {
    if (inputEnabled) beginInputTimer();
    else if (entryTimer.current) {
      clearInterval(entryTimer.current);
      entryTimer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputEnabled]);

  useKeyPress(!paused && !over, {
    '1': () => pressPad(0),
    '2': () => pressPad(1),
    '3': () => pressPad(2),
    '4': () => pressPad(3),
  });

  const padSize = sc(128);

  return (
    <View style={styles.root}>
      <GameHud
        onPause={requestPause}
        accent={palette.cyan}
        centre={
          <View style={styles.hudCentre}>
            <Text variant="micro" color={palette.cyan}>
              MEMORY RUSH · {state.stage} STEPS
            </Text>
            <Text variant="display" numeric>
              {state.score}
            </Text>
          </View>
        }
        right={
          <View style={styles.hudRight}>
            <Text variant="label" color={state.lives > 1 ? palette.mint : palette.coral}>
              {'♥'.repeat(Math.max(0, state.lives))}
              <Text variant="label" muted>
                {'♥'.repeat(Math.max(0, START_LIVES - state.lives))}
              </Text>
            </Text>
            <Text variant="micro" muted>
              {state.stage - 1} cleared
            </Text>
          </View>
        }
      />

      <View style={styles.stage}>
        <Text variant="caption" color={palette.textMuted} center style={{ marginBottom: spacing.lg }}>
          {hint}
        </Text>

        <View style={styles.grid}>
          {Array.from({ length: PADS }, (_, i) => {
            const color = PAD_COLORS[i];
            const active = lit === i;
            return (
              <PressableScale
                key={i}
                onPress={() => pressPad(i)}
                scaleTo={active ? 1 : 0.9}
                haptic={false}
                disabled={!inputEnabled}
                style={[
                  styles.pad,
                  {
                    width: padSize,
                    height: padSize,
                    backgroundColor: active ? color : `${color}26`,
                    borderColor: active ? '#FFFFFF' : `${color}88`,
                  },
                ]}
              >
                {active ? <View style={styles.padGlow} /> : null}
              </PressableScale>
            );
          })}
        </View>

        <Text variant="caption" faint center style={{ marginTop: spacing.lg }}>
          Keys 1–4 on desktop
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0916', overflow: 'hidden' },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    maxWidth: 340,
  },
  pad: {
    borderRadius: radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  padGlow: { flex: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
});

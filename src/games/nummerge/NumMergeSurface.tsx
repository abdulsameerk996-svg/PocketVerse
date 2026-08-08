import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { GameSurfaceProps } from '@/core/registry';
import { comboMultiplier, quickReward } from '@/core/game/quick';
import { useKeyPress } from '@/ui/hooks/useKeyboard';
import { GameHud, PressableScale, Text, haptics, palette, radius, spacing, useResponsive, play } from '@/ui';
import { applyMove, canMove, makeMerge, type MergeState, type MoveDir } from './logic';
import type { NumMergeSave } from './types';

/**
 * ============================================================================
 *  NUMBER MERGE
 * ============================================================================
 *
 * A 3×3 grid, swipe to slide, equal tiles fuse. Short rounds, quick comebacks
 * — the whole board is plain React state because a move is a deliberate,
 * human-paced event (never per-frame).
 */

const TILE_COLORS: Record<number, string> = {
  2: '#3A3A5C',
  4: '#6B5BD2',
  8: '#4EA8FF',
  16: '#34E2A8',
  32: '#FFD166',
  64: '#FFB443',
  128: '#FF6B6B',
  256: '#FF4D8D',
  512: '#C05CFF',
  1024: '#22D3EE',
  2048: '#F4F4FF',
};

export function NumMergeSurface({
  onFinish,
  paused,
  requestPause,
  save,
  setSave,
}: GameSurfaceProps) {
  const { width } = useResponsive();
  const startAt = useRef(Date.now());

  const [state, setState] = useState<MergeState>(() => makeMerge());
  const [combo, setCombo] = useState(0);
  const [over, setOver] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    play('game.start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (finalState: MergeState) => {
      if (finished.current) return;
      finished.current = true;
      setOver(true);
      const elapsed = (Date.now() - startAt.current) / 1000;
      const sc = finalState.score;
      haptics.fail();
      play('game.over');
      setTimeout(() => {
        onFinish({
          score: sc,
          outcome: 'lose',
          metrics: { nummerge_score: sc, nummerge_merges: finalState.merges },
          reward: quickReward(sc, elapsed),
          breakdown: [
            { label: 'Merges', value: `${finalState.merges}` },
            { label: 'Moves', value: `${finalState.moves}` },
            { label: 'Best tile', value: `${Math.max(...finalState.grid)}` },
          ],
        });
        setSave((s: unknown) => {
          const save2 = (s ?? { runs: 0, best: 0, bestMerges: 0 }) as NumMergeSave;
          return {
            ...save2,
            runs: save2.runs + 1,
            best: Math.max(save2.best, sc),
            bestMerges: Math.max(save2.bestMerges, finalState.merges),
          };
        });
      }, 700);
    },
    [onFinish, setSave],
  );

  const move = useCallback(
    (dir: MoveDir) => {
      if (over || paused) return;
      setState((s) => {
        const res = applyMove(s, dir, Math.random);
        const gained = Math.round(res.gained * comboMultiplier(s.merges));
        if (res.merged) {
          setCombo((c) => c + 1);
          haptics.collect();
          play('game.collect', { volume: 0.6 });
        } else if (res.gained > 0) {
          setCombo((c) => c + 1);
        } else {
          setCombo(0);
          haptics.tick();
        }
        const next = { ...s, score: s.score + gained };
        if (res.over) {
          play('game.crash');
          setTimeout(() => finish(next), 150);
        }
        return next;
      });
    },
    [finish, over, paused],
  );

  const keys = useCallback(
    () => ({
      ArrowLeft: () => move(0),
      ArrowUp: () => move(1),
      ArrowRight: () => move(2),
      ArrowDown: () => move(3),
    }),
    [move],
  );
  useKeyPress(!paused && !over, keys());

  const swipe = useCallback(
    (e: { translationX: number; translationY: number }) => {
      const ax = Math.abs(e.translationX);
      const ay = Math.abs(e.translationY);
      if (Math.max(ax, ay) < 24) return;
      if (ax > ay) move(e.translationX > 0 ? 2 : 0);
      else move(e.translationY > 0 ? 3 : 1);
    },
    [move],
  );
  const gesture = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onEnd((e) => swipe(e)),
    [swipe],
  );

  const board = spacing.lg * 2;
  const size = Math.min(width - board, 320);
  const tile = (size - spacing.md * 2) / 3;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={styles.boardWrap}>
          <GameHud
            onPause={requestPause}
            accent={palette.violet}
            centre={
              <View style={styles.hudCentre}>
                <Text variant="micro" color={palette.violet}>
                  NUMBER MERGE
                </Text>
                <Text variant="display" numeric>
                  {state.score}
                </Text>
              </View>
            }
            right={
              <View style={styles.hudRight}>
                <Text variant="label" color={combo >= 3 ? palette.gold : palette.textMuted}>
                  {combo >= 3 ? `${combo} MERGE` : `${state.merges} fusions`}
                </Text>
                <Text variant="micro" muted>
                  {state.moves} moves
                </Text>
              </View>
            }
          />

          <View style={[styles.board, { width: size, height: size }]}>
            {state.grid.map((v, i) => (
              <View
                key={i}
                style={[
                  styles.cell,
                  {
                    width: tile,
                    height: tile,
                    backgroundColor: v === 0 ? 'rgba(255,255,255,0.04)' : TILE_COLORS[v] ?? palette.violet,
                  },
                ]}
              >
                {v > 0 ? (
                  <Text variant="heading" color={v >= 8 ? '#0B0B14' : '#F4F4FF'}>
                    {v}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <Text variant="caption" muted center style={{ marginTop: spacing.lg }}>
            Swipe to slide · same tiles fuse
          </Text>

          {/* on-screen D-pad for touch certainty */}
          <View style={styles.dpad}>
            <View style={styles.dpadRow}>
              <DpadButton label="←" onPress={() => move(0)} />
              <DpadButton label="↑" onPress={() => move(1)} />
              <DpadButton label="↓" onPress={() => move(3)} />
              <DpadButton label="→" onPress={() => move(2)} />
            </View>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function DpadButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.88} haptic="tick" style={styles.dpadBtn}>
      <Text variant="label" color={palette.violet}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0817', overflow: 'hidden' },
  boardWrap: { flex: 1, alignItems: 'center' },
  hudCentre: { alignItems: 'center' },
  hudRight: { alignItems: 'flex-end', gap: 2 },
  board: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  cell: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dpad: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  dpadRow: { flexDirection: 'row', gap: spacing.sm },
  dpadBtn: {
    width: 56,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,92,255,0.12)',
    borderWidth: 1,
    borderColor: `${palette.violet}66`,
  },
});

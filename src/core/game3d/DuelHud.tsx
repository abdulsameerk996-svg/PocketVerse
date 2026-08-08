import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Button, GameHud, Text, palette, radius, spacing } from '@/ui';
import { HAS_KEYBOARD, KEY_HINT } from './useDuelInput';
import type { MatchPhase, Side } from './useMatch';

/**
 * The shared furniture of a two-player match: who is who, what the score is,
 * the countdown, and the "play again" that every one of these games needs.
 *
 * Kept in one component so the seven duel games look like one product rather
 * than seven prototypes, and so a change to the win screen is one edit.
 */

export const P1_COLOR = '#4EA8FF';
export const P2_COLOR = '#FF6B6B';

export type DuelHudProps = {
  phase: MatchPhase;
  score: Record<Side, number>;
  count: number;
  winner: Side | null;
  lastScorer?: Side | null;
  target: number;
  /** e.g. "First to 5" */
  rule: string;
  p1Name?: string;
  p2Name?: string;
  onPause?: () => void;
  /** Extra readout under the score — a clock, a stroke count, a percentage. */
  centre?: ReactNode;
  /** A control hint, shown under the score. */
  summary?: string;
};

export const DuelHud = memo(function DuelHud({
  phase,
  score,
  count,
  winner,
  lastScorer,
  target,
  rule,
  p1Name = 'P1',
  p2Name = 'P2',
  onPause,
  centre,
  summary,
}: DuelHudProps) {
  return (
    <>
      <GameHud
        onPause={onPause}
        accent={P1_COLOR}
        centre={
          <View style={styles.centre}>
            <View style={styles.scoreRow}>
              <Score name={p1Name} value={score.p1} color={P1_COLOR} hint={KEY_HINT.p1} />
              <Text variant="caption" muted>
                {rule}
              </Text>
              <Score name={p2Name} value={score.p2} color={P2_COLOR} hint={KEY_HINT.p2} align="right" />
            </View>
            {centre}
            {summary && phase === 'playing' ? (
              <Text variant="micro" faint center>
                {summary}
              </Text>
            ) : null}
          </View>
        }
      />

      {/* Countdown — the beat that tells both players to get ready. */}
      {phase === 'countdown' ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(180)}
          style={styles.overlay}
        >
          <Animated.View key={count} entering={ZoomIn.duration(220)}>
            <Text variant="display" size={72} center>
              {count > 0 ? count : 'GO'}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}

      {phase === 'point' && lastScorer ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(200)}
          style={styles.overlay}
        >
          <Text variant="display" center color={lastScorer === 'p1' ? P1_COLOR : P2_COLOR}>
            {lastScorer === 'p1' ? p1Name : p2Name} scores
          </Text>
        </Animated.View>
      ) : null}

      {/*
        The winner moment, and deliberately *only* the moment.

        The game host owns game-over for every game in PocketVerse: when a match
        calls `onFinish` it slides its results sheet up with the score, the
        rewards, "Play again" and "Home". An interactive win card here would sit
        underneath that sheet with unreachable buttons — which is exactly what
        the first version did. So this is a non-interactive banner that plays
        for the beat before the sheet arrives, and rematch stays where every
        other game already puts it.
      */}
      {phase === 'over' && winner ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(220)}
          style={styles.overlay}
        >
          <Text size={56} center>
            {winner === 'p1' ? '🥇' : '🏆'}
          </Text>
          <Text variant="display" center color={winner === 'p1' ? P1_COLOR : P2_COLOR}>
            {winner === 'p1' ? p1Name : p2Name} wins
          </Text>
          <Text variant="title" center numeric style={{ marginTop: spacing.xs }}>
            {score.p1} – {score.p2}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );
});

const Score = memo(function Score({
  name,
  value,
  color,
  hint,
  align = 'left',
}: {
  name: string;
  value: number;
  color: string;
  hint: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', minWidth: 62 }}>
      <Text variant="micro" color={color}>
        {name.toUpperCase()}
      </Text>
      <Text variant="title" numeric color={color}>
        {value}
      </Text>
      {HAS_KEYBOARD ? (
        <Text variant="micro" faint>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  centre: { alignItems: 'center', gap: 2, minWidth: 220 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    paddingHorizontal: spacing.xl,
  },
  winCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(10,7,19,0.92)',
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
  },
});

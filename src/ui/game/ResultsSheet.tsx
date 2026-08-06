import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FinishedSession } from '@/core/services/session';
import { getItem } from '@/content/catalog';
import { palette, radius, spacing } from '../theme/tokens';
import { Sheet } from '../components/Sheet';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { CountUp } from '../components/CountUp';
import { Burst } from '../fx/Particles';
import { haptics } from '../hooks/useHaptics';

/**
 * The universal end-of-run screen.
 *
 * Every game finishes here, which is why rewards, best-score handling and the
 * "play again" loop behave identically across all ten. Games only supply a
 * `breakdown` array to say what mattered in their own language.
 */
export const ResultsSheet = memo(function ResultsSheet({
  session,
  onReplay,
  onExit,
  replayCost,
  canReplay,
}: {
  session: FinishedSession | null;
  onReplay: () => void;
  onExit: () => void;
  replayCost: number;
  canReplay: boolean;
}) {
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!session) return;
    setBurst((b) => b + 1);
    if (session.isBest) haptics.success();
  }, [session]);

  if (!session) return null;

  const r = session.finalReward;
  const items = Object.entries(r.items ?? {});

  return (
    <Sheet
      visible
      onClose={onExit}
      dismissable={false}
      title={session.outcome === 'win' ? 'Cleared' : 'Run complete'}
      subtitle={session.isBest && session.score > 0 ? '🏆 New personal best' : undefined}
    >
      <View style={styles.scoreRow}>
        <Burst trigger={burst} radius={70} count={session.isBest ? 20 : 10} />
        <Text variant="micro" muted>
          SCORE
        </Text>
        <CountUp value={session.score} variant="display" size={44} format="comma" />
        {session.previousBest > 0 ? (
          <Text variant="caption" muted>
            best {Math.round(session.previousBest)}
          </Text>
        ) : null}
      </View>

      {session.breakdown?.length ? (
        <View style={styles.breakdown}>
          {session.breakdown.map((row) => (
            <View key={row.label} style={styles.breakRow}>
              <Text variant="body" muted>
                {row.label}
              </Text>
              <Text variant="label" numeric>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.rewards}>
        {r.coins ? <RewardPill glyph="🪙" value={`+${r.coins}`} color={palette.coin} /> : null}
        {r.xp ? <RewardPill glyph="⚡" value={`+${r.xp} XP`} color={palette.xp} /> : null}
        {r.gems ? <RewardPill glyph="💎" value={`+${r.gems}`} color={palette.gem} /> : null}
        {items.map(([id, qty]) => (
          <RewardPill key={id} glyph={getItem(id).glyph} value={`×${qty}`} color={palette.mint} />
        ))}
        {(r.unlocks ?? []).map((id) => (
          <RewardPill key={id} glyph={getItem(id).glyph} value="UNLOCKED" color={palette.gold} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button label="Home" variant="secondary" onPress={onExit} style={{ flex: 1 }} />
        <Button
          label="Play again"
          onPress={onReplay}
          disabled={!canReplay}
          trailing={replayCost > 0 ? `${replayCost}⚡` : undefined}
          shine
          style={{ flex: 1.4 }}
        />
      </View>
    </Sheet>
  );
});

const RewardPill = memo(function RewardPill({
  glyph,
  value,
  color,
}: {
  glyph: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.pill, { borderColor: `${color}55` }]}>
      <Text size={15}>{glyph}</Text>
      <Text variant="label" color={color}>
        {value}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  scoreRow: { alignItems: 'center', paddingVertical: spacing.lg },
  breakdown: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
});

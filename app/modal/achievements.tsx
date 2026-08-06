import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useProgressStore } from '@/core/state/progressStore';
import type { AchievementDef } from '@/core/types';
import { catalog } from '@/content/catalog';
import { getGame } from '@/core/registry';
import { describeReward } from '@/core/services/rewards';
import {
  Card,
  ModalHeader,
  ProgressBar,
  Screen,
  SectionHeader,
  Text,
  palette,
  radius,
  spacing,
} from '@/ui';

/**
 * ACHIEVEMENTS
 *
 * Tiered and permanent. The list is assembled from the merged catalog, so a new
 * module's achievements appear here automatically, grouped by their game.
 */
export default function AchievementsModal() {
  const values = useProgressStore((s) => s.achievements);
  const metrics = useProgressStore((s) => s.metrics);

  const grouped = useMemo(() => {
    const all = catalog().achievementList;
    const core = all.filter((a) => !a.game);
    const byGame = new Map<string, typeof all>();
    for (const a of all) {
      if (!a.game) continue;
      const list = byGame.get(a.game) ?? [];
      list.push(a);
      byGame.set(a.game, list);
    }
    return { core, byGame: [...byGame.entries()] };
  }, []);

  const totalTiers = catalog().achievementList.reduce((n, a) => n + a.tiers.length, 0);
  const earnedTiers = Object.values(values).reduce((n, v) => n + v.tier, 0);

  return (
    <Screen ambient={false} edges={{ top: false }}>
      <ModalHeader title="Achievements" subtitle={`${earnedTiers}/${totalTiers} tiers earned`} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card variant="gradient" gradient={['#3B2E0E', '#141006']} padding={spacing.lg}>
          <Text variant="micro" color={palette.gold}>
            LIFETIME
          </Text>
          <Text variant="title">Everything counts, everywhere</Text>
          <ProgressBar
            value={totalTiers ? earnedTiers / totalTiers : 0}
            height={9}
            gradient={[palette.gold, palette.amber]}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <SectionHeader title="Across the verse" />
        {grouped.core.map((a) => (
          <AchievementCard
            key={a.id}
            def={a}
            value={metrics[a.metric] ?? 0}
            tier={values[a.id]?.tier ?? 0}
          />
        ))}

        {grouped.byGame.map(([gameId, list]) => {
          const game = getGame(gameId);
          return (
            <View key={gameId}>
              <SectionHeader
                title={game ? `${game.meta.glyph} ${game.meta.title}` : gameId}
                subtitle={game?.meta.tagline}
              />
              {list.map((a) => (
                <AchievementCard
                  key={a.id}
                  def={a}
                  value={metrics[a.metric] ?? 0}
                  tier={values[a.id]?.tier ?? 0}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function AchievementCard({
  def,
  value,
  tier,
}: {
  def: AchievementDef;
  value: number;
  tier: number;
}) {
  const complete = tier >= def.tiers.length;
  const current = def.tiers[Math.min(tier, def.tiers.length - 1)];
  const previousTarget = tier > 0 ? def.tiers[tier - 1].target : 0;
  const pct = complete
    ? 1
    : Math.max(
        0,
        Math.min(1, (value - previousTarget) / Math.max(1, current.target - previousTarget)),
      );

  return (
    <View style={[styles.card, complete && { borderColor: palette.gold }]}>
      <View style={styles.head}>
        <View style={[styles.icon, complete && { backgroundColor: 'rgba(255,197,61,0.2)' }]}>
          <Text size={20}>{def.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{def.title}</Text>
          <Text variant="caption" muted numberOfLines={2}>
            {def.description}
          </Text>
        </View>
        <View style={styles.tierBadge}>
          <Text variant="micro" color={complete ? palette.gold : palette.textMuted}>
            {tier}/{def.tiers.length}
          </Text>
        </View>
      </View>

      <ProgressBar
        value={pct}
        height={6}
        gradient={complete ? [palette.gold, palette.amber] : [palette.violet, palette.magenta]}
        glow={false}
        style={{ marginTop: spacing.md }}
      />
      <View style={styles.foot}>
        <Text variant="caption" numeric muted>
          {Math.floor(value).toLocaleString()} / {complete ? '—' : current.target.toLocaleString()}
        </Text>
        <Text variant="caption" color={palette.gold} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
          {complete ? 'complete' : describeReward(current.reward)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, gap: spacing.sm },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: palette.hairline,
    marginBottom: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
